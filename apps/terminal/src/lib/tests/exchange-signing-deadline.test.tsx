// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExchangeClient, IRequestTransport } from "@nktkas/hyperliquid";
import { createExchangeClient } from "@sairn/hl-react/clients";
import { useExchange } from "@sairn/hl-react/hooks/useExchange";
import {
	ExchangeActionDeadlineError,
	startExchangeActionDeadline,
	unwrapExchangeSigningDeadline,
} from "@sairn/hl-react/internal/exchange/request-scheduler";
import {
	captureAgentRegistrationExecutionLease,
	startAgentRegistrationExecution,
} from "@sairn/hl-react/signing/agent-registration-session";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { classifyVaultMutationFailure } from "@/components/vaults/vault-action-domain";
import { classifyActionError } from "@/lib/errors/action-error";
import { verifyLegalActionAllowed } from "@/lib/hyperliquid";
import { createOwnerSignerClient } from "../../../../../packages/hl-react/src/signing/owner-signer-client";

const OWNER = "0x1234567890abcdef1234567890abcdef12345678" as const;
const AGENT = "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf" as const;
const AGENT_PRIVATE_KEY = `0x${"0".repeat(63)}1`;
const SESSION_STORAGE_KEY = `hyperliquid_agent_registration_session_Mainnet_${OWNER}`;
const AGENT_STORAGE_KEY = `hyperliquid_agent_Mainnet_${OWNER}`;
const FUNDS_LOCK_NAME = `hyperliquid_funds_action:Mainnet:${OWNER}`;
const SESSION_LOCK_PREFIX = "hyperliquid_agent_registration_session:";
const NONCE_LOCK_PREFIX = "hyperliquid_exchange_nonce:";
const SIGNATURE = `0x${"1".repeat(128)}1b`;
const DEADLINE_MS = 15_000;
const ORDER = { orders: [{ a: 0, b: true, p: "100", s: "1", r: false, t: { limit: { tif: "Gtc" } } }], grouping: "na" };
const CANCEL = { cancels: [{ a: 0, o: 1 }] };
const VAULT_TRANSFER = { vaultAddress: OWNER, isDeposit: true, usd: 1 };
const WITHDRAW = { destination: OWNER, amount: "1" };

const state = vi.hoisted(() => ({
	clockWaits: [] as Array<() => Promise<void>>,
	guardWaits: [] as Array<() => Promise<void>>,
	enforceLegalActions: false,
	exchangeLifecycle: { id: Symbol("exchange-signing-deadline-test"), active: true },
	legalCheck: null as unknown as Mock,
	client: null as unknown,
	user: null as unknown,
	ownerSigner: null as unknown,
	agentPublicKey: null as string | null,
}));

vi.mock("../../../../../packages/hl-react/src/internal/exchange/server-clock", async (importOriginal) => ({
	...(await importOriginal<object>()),
	createServerClock: () => ({
		sync: async () => {},
		getExpiresAfter: async () => {
			await state.clockWaits.shift()?.();
			return Date.now() + DEADLINE_MS;
		},
	}),
}));

vi.mock("@sairn/hl-react/hooks/useClients", () => ({
	useHyperliquidClients: () => ({
		agentPublicKey: state.agentPublicKey,
		info: {},
		subscription: {},
		trading: state.client,
		user: state.user,
		userWalletMismatch: false,
	}),
}));

vi.mock("../../../../../packages/hl-react/src/signing/owner-signer-provider", () => ({
	useHyperliquidOwnerSigner: () => state.ownerSigner,
}));

vi.mock("@sairn/hl-react/provider", () => ({
	useHyperliquid: () => ({
		builderConfig: { b: "0x0000000000000000000000000000000000000000", f: 0 },
		clientKey: OWNER,
		enforceLegalActions: state.enforceLegalActions,
		env: "Mainnet",
		exchangeLifecycle: state.exchangeLifecycle,
		info: { legalCheck: state.legalCheck },
		sessionMode: "wallet",
	}),
}));

type Mutate = (params: unknown) => Promise<unknown>;
type Mutations = Record<"order" | "cancel" | "vaultTransfer" | "withdraw3" | "guardedWithdraw", Mutate>;

interface Outcome {
	settled: boolean;
	error?: unknown;
}

function track(promise: Promise<unknown>): Outcome {
	const outcome: Outcome = { settled: false };
	promise.then(
		() => {
			outcome.settled = true;
		},
		(error: unknown) => {
			outcome.settled = true;
			outcome.error = error;
		},
	);
	return outcome;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

interface LockStub {
	isHeld: (name: string) => boolean;
	acquisitions: (name: string) => number;
	acquisitionsWithPrefix: (prefix: string) => number;
	hold: (prefix: string) => () => void;
}

function installLockManager(): LockStub {
	const active = new Set<string>();
	const held = new Map<string, number>();
	const counts = new Map<string, number>();
	const blocked = new Set<string>();
	const pending: { name: string; run: () => void; signal?: AbortSignal; reject: (reason: unknown) => void }[] = [];
	const isBlocked = (name: string) => [...blocked].some((prefix) => name.startsWith(prefix));
	function drain() {
		for (const entry of [...pending]) {
			if (active.has(entry.name) || isBlocked(entry.name)) continue;
			pending.splice(pending.indexOf(entry), 1);
			active.add(entry.name);
			counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);
			entry.run();
		}
	}
	Object.defineProperty(window.navigator, "locks", {
		configurable: true,
		value: {
			request(name: string, options: unknown, maybeCallback?: (lock: Lock | null) => unknown) {
				const callback = (typeof options === "function" ? options : maybeCallback) as (lock: Lock | null) => unknown;
				const signal = typeof options === "object" ? (options as LockOptions | null)?.signal : undefined;
				return new Promise((resolve, reject) => {
					if (signal?.aborted) {
						reject(signal.reason);
						return;
					}
					const entry = {
						name,
						signal,
						reject,
						run: () => {
							void Promise.resolve()
								.then(() => callback({ name, mode: "exclusive" } as Lock))
								.then(resolve, reject)
								.finally(() => {
									active.delete(name);
									drain();
								});
						},
					};
					signal?.addEventListener(
						"abort",
						() => {
							const index = pending.indexOf(entry);
							if (index < 0) return;
							pending.splice(index, 1);
							reject(signal.reason);
						},
						{ once: true },
					);
					pending.push(entry);
					drain();
				});
			},
		},
	});
	return {
		isHeld: (name) => active.has(name) || (held.get(name) ?? 0) > 0,
		acquisitions: (name) => counts.get(name) ?? 0,
		acquisitionsWithPrefix: (prefix) =>
			[...counts].reduce((total, [name, count]) => (name.startsWith(prefix) ? total + count : total), 0),
		hold: (prefix) => {
			blocked.add(prefix);
			return () => {
				blocked.delete(prefix);
				drain();
			};
		},
	};
}

function createTransport() {
	const request = vi.fn(async (endpoint: string, payload: unknown) => {
		if (endpoint !== "exchange") throw new Error(`Unexpected ${endpoint} request`);
		const type = (payload as { action: { type: string } }).action.type;
		if (type === "order")
			return { status: "ok", response: { type: "order", data: { statuses: [{ resting: { oid: 1 } }] } } };
		if (type === "cancel") return { status: "ok", response: { type: "cancel", data: { statuses: ["success"] } } };
		return { status: "ok", response: { type: "default" } };
	});
	return { transport: { isTestnet: false, request } as unknown as IRequestTransport, request };
}

const signatures: string[] = [];

function createJsonRpcWallet(address: string) {
	return {
		getAddresses: async () => [address as `0x${string}`],
		getChainId: async () => 42161,
		async signTypedData(_typedData: unknown) {
			signatures.push(address);
			return SIGNATURE as `0x${string}`;
		},
	};
}

function createLocalWallet(address: string) {
	return {
		address,
		async signTypedData(_typedData: unknown) {
			signatures.push(address);
			return SIGNATURE as `0x${string}`;
		},
	};
}

describe.each(["owner", "agent"] as const)("exchange signing deadline with the %s signer", (branch) => {
	let captured: Mutations | null;
	let container: HTMLDivElement;
	let queryClient: QueryClient;
	let root: Root;
	let locks: LockStub;
	let request: ReturnType<typeof createTransport>["request"];
	let perfOffset: number;

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
		perfOffset = 0;
		const realNow = performance.now.bind(performance);
		vi.spyOn(performance, "now").mockImplementation(() => realNow() + perfOffset);
		signatures.length = 0;
		state.clockWaits = [];
		state.guardWaits = [];
		state.enforceLegalActions = false;
		state.legalCheck = vi.fn().mockResolvedValue({ acceptedTerms: true, userAllowed: true, restrictions: "n" });
		Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
		window.localStorage.setItem(
			SESSION_STORAGE_KEY,
			JSON.stringify({ version: 1, epoch: "11111111-1111-4111-8111-111111111111", state: "active" }),
		);
		const created = createTransport();
		request = created.request;
		const ownerClient = createOwnerSignerClient(
			{ wallet: createJsonRpcWallet(OWNER), ownerAddress: OWNER, assertCurrent: () => {} } as never,
			false,
			created.transport,
		);
		if (branch === "owner") {
			state.ownerSigner = { wallet: createJsonRpcWallet(OWNER), ownerAddress: OWNER, assertCurrent: () => {} };
			state.agentPublicKey = null;
			state.client = ownerClient;
			state.user = ownerClient;
		} else {
			window.localStorage.setItem(
				AGENT_STORAGE_KEY,
				JSON.stringify({ privateKey: AGENT_PRIVATE_KEY, publicKey: AGENT, source: "local-registration" }),
			);
			state.ownerSigner = null;
			state.agentPublicKey = AGENT;
			state.client = createExchangeClient(createLocalWallet(AGENT) as never, false, undefined, created.transport);
			state.user = ownerClient;
		}
		locks = installLockManager();
		captured = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		queryClient = new QueryClient();
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		onlineManager.setOnline(true);
		queryClient.clear();
		container.remove();
		window.localStorage.clear();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	function Probe() {
		const order = useExchange("order", { networkMode: "online" });
		const cancel = useExchange("cancel");
		const vaultTransfer = useExchange("vaultTransfer");
		const withdraw3 = useExchange("withdraw3");
		const guardedWithdraw = useExchange("withdraw3", {
			preExecutionGuard: async () => {
				await state.guardWaits.shift()?.();
			},
		});
		captured = {
			order: order.mutateAsync as Mutate,
			cancel: cancel.mutateAsync as Mutate,
			vaultTransfer: vaultTransfer.mutateAsync as Mutate,
			withdraw3: withdraw3.mutateAsync as Mutate,
			guardedWithdraw: guardedWithdraw.mutateAsync as Mutate,
		};
		return null;
	}

	function render(): Mutations {
		act(() => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<Probe />
				</QueryClientProvider>,
			);
		});
		if (!captured) throw new Error("Mutations were not captured");
		return captured;
	}

	async function advance(ms: number): Promise<void> {
		await act(async () => {
			await vi.advanceTimersByTimeAsync(ms);
		});
	}

	function freezeFor(ms: number): void {
		vi.setSystemTime(Date.now() + ms);
		perfOffset += ms;
	}

	const exchangeRequests = () => request.mock.calls.filter(([endpoint]) => endpoint === "exchange").length;

	it.each([
		["an order", "order", ORDER],
		["a funds action", "vaultTransfer", VAULT_TRANSFER],
	] as const)(
		"never signs %s whose clock sync returns 60 seconds after it was queued",
		async (_label, method, params) => {
			const sync = deferred();
			state.clockWaits.push(() => sync.promise);
			const mutations = render();

			const outcome = track(mutations[method](params));
			await advance(0);
			freezeFor(60_000);
			sync.resolve();
			await advance(0);

			expect(outcome.error).toBeInstanceOf(ExchangeActionDeadlineError);
			expect(locks.acquisitionsWithPrefix(NONCE_LOCK_PREFIX)).toBe(0);
			expect(signatures).toEqual([]);
			expect(exchangeRequests()).toBe(0);
		},
	);

	it("never signs an order that enters the SDK at 14 seconds and waits 2 more for the clock", async () => {
		let releaseFirst = () => {};
		request.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					releaseFirst = () =>
						resolve({ status: "ok", response: { type: "order", data: { statuses: [{ resting: { oid: 1 } }] } } });
				}),
		);
		state.clockWaits.push(
			async () => {},
			() => new Promise((resolve) => setTimeout(resolve, 2_000)),
		);
		const mutations = render();

		const first = track(mutations.order(ORDER));
		await advance(0);
		const late = track(mutations.order(ORDER));
		await advance(14_000);
		releaseFirst();
		await advance(0);
		expect(first).toEqual({ settled: true });
		expect(late.settled).toBe(false);

		await advance(2_000);
		expect(late.error).toBeInstanceOf(ExchangeActionDeadlineError);
		expect(signatures).toHaveLength(1);
		expect(exchangeRequests()).toBe(1);
	});

	it("checks the deadline at the wallet when a wait after the expiry outlasts it", async () => {
		const releaseNonce = locks.hold(NONCE_LOCK_PREFIX);
		const mutations = render();

		const outcome = track(mutations.order(ORDER));
		await advance(0);
		freezeFor(60_000);
		releaseNonce();
		await advance(0);

		expect(outcome.error).toBeInstanceOf(ExchangeActionDeadlineError);
		expect(classifyActionError(outcome.error)).toEqual(classifyActionError(new ExchangeActionDeadlineError()));
		expect(classifyActionError(outcome.error)).not.toEqual(classifyActionError(new Error("x")));
		expect(classifyVaultMutationFailure(outcome.error)).toBe("deterministic");
		expect(signatures).toEqual([]);
		expect(exchangeRequests()).toBe(0);
	});

	it("signs and sends an order once on the ordinary path", async () => {
		const mutations = render();
		const outcome = track(mutations.order(ORDER));
		await advance(0);
		expect(outcome).toEqual({ settled: true });
		expect(signatures).toHaveLength(1);
		expect(exchangeRequests()).toBe(1);
	});

	it("does not apply a finished action's deadline to a later direct call on the same client", async () => {
		const mutations = render();
		await advance(0);
		const done = track(mutations.order(ORDER));
		await advance(0);
		expect(done).toEqual({ settled: true });

		await advance(60_000);
		await expect((state.client as ExchangeClient).cancel(CANCEL as never)).resolves.toMatchObject({ status: "ok" });
		expect(signatures).toHaveLength(2);
	});

	it("still signs a cancel after the same 60-second wait", async () => {
		const sync = deferred();
		state.clockWaits.push(() => sync.promise);
		const releaseNonce = locks.hold(NONCE_LOCK_PREFIX);
		const mutations = render();

		const outcome = track(mutations.cancel(CANCEL));
		await advance(0);
		freezeFor(60_000);
		sync.resolve();
		releaseNonce();
		await advance(0);

		expect(outcome).toEqual({ settled: true });
		expect(signatures).toHaveLength(1);
		expect(exchangeRequests()).toBe(1);
	});

	it("never signs a user-signed withdrawal held past the deadline before the wallet", async () => {
		const releaseNonce = locks.hold(NONCE_LOCK_PREFIX);
		const mutations = render();

		const outcome = track(mutations.withdraw3(WITHDRAW));
		await advance(0);
		freezeFor(60_000);
		releaseNonce();
		await advance(0);

		expect(outcome.error).toBeInstanceOf(ExchangeActionDeadlineError);
		expect(signatures).toEqual([]);
		expect(exchangeRequests()).toBe(0);
	});

	it("releases the funds lock at the deadline while the action waits for the session lock", async () => {
		const releaseSession = locks.hold(SESSION_LOCK_PREFIX);
		const mutations = render();

		const first = track(mutations.vaultTransfer(VAULT_TRANSFER));
		await advance(0);
		expect(locks.acquisitions(FUNDS_LOCK_NAME)).toBe(1);

		await advance(DEADLINE_MS);
		expect(first.error).toBeInstanceOf(ExchangeActionDeadlineError);
		expect(locks.isHeld(FUNDS_LOCK_NAME)).toBe(false);

		const second = track(mutations.vaultTransfer(VAULT_TRANSFER));
		await advance(0);
		expect(locks.acquisitions(FUNDS_LOCK_NAME)).toBe(2);

		releaseSession();
		await advance(0);
		expect(second).toEqual({ settled: true });
		expect(signatures).toHaveLength(1);
	});

	it("releases both locks at the deadline while the pre-execution guard that entered at 14 seconds still waits", async () => {
		const releaseSession = locks.hold(SESSION_LOCK_PREFIX);
		state.guardWaits.push(() => new Promise(() => {}));
		const mutations = render();
		const sessionLock = `${SESSION_LOCK_PREFIX}Mainnet:${OWNER}`;

		const first = track(mutations.guardedWithdraw(WITHDRAW));
		await advance(14_000);
		releaseSession();
		await advance(0);
		expect(locks.isHeld(sessionLock)).toBe(true);
		expect(locks.isHeld(FUNDS_LOCK_NAME)).toBe(true);

		await advance(1_000);
		expect(first.error).toBeInstanceOf(ExchangeActionDeadlineError);
		expect(locks.isHeld(sessionLock)).toBe(false);
		expect(locks.isHeld(FUNDS_LOCK_NAME)).toBe(false);

		const second = track(mutations.guardedWithdraw(WITHDRAW));
		await advance(0);
		expect(second).toEqual({ settled: true });
		expect(signatures).toHaveLength(1);
	});

	it("fails an action submitted offline at once and never sends it when the network returns", async () => {
		state.enforceLegalActions = true;
		state.legalCheck.mockRejectedValue(new TypeError("fetch failed"));
		const mutations = render();
		onlineManager.setOnline(false);

		const outcome = track(mutations.order(ORDER));
		await advance(0);
		const [mutation] = queryClient.getMutationCache().getAll();
		expect(mutation?.options.networkMode).toBe("always");
		expect(mutation?.state.isPaused).toBe(false);
		expect(outcome.error).toMatchObject({ name: "LegalActionNotAllowedError", reason: "status_unavailable" });

		state.legalCheck.mockResolvedValue({ acceptedTerms: true, userAllowed: true, restrictions: "n" });
		onlineManager.setOnline(true);
		await advance(120_000);
		expect(signatures).toEqual([]);
		expect(exchangeRequests()).toBe(0);
	});
});

describe("pre-execution guard after an abandoned start", () => {
	afterEach(() => {
		window.localStorage.clear();
	});

	it("does not run the guard when the action was abandoned before the session lock was granted", async () => {
		window.localStorage.setItem(
			SESSION_STORAGE_KEY,
			JSON.stringify({ version: 1, epoch: "11111111-1111-4111-8111-111111111111", state: "active" }),
		);
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			value: {
				request: (_name: string, _options: unknown, callback: (lock: Lock) => unknown) =>
					Promise.resolve(callback({} as Lock)),
			},
		});
		const lease = captureAgentRegistrationExecutionLease("Mainnet", OWNER);
		if (!lease) throw new Error("Expected an execution lease");
		const controller = new AbortController();
		controller.abort();
		const guard = vi.fn(async () => {});
		const execute = vi.fn(async () => "sent");

		await expect(
			startAgentRegistrationExecution(lease, () => true, execute, guard, controller.signal),
		).resolves.toEqual({ status: "invalidated" });
		expect(guard).not.toHaveBeenCalled();
		expect(execute).not.toHaveBeenCalled();
	});
});

describe("aborted legal re-check", () => {
	it("sends no request when the action was already abandoned", async () => {
		const legalCheck = vi.fn().mockResolvedValue({ acceptedTerms: true, userAllowed: true, restrictions: "n" });
		const controller = new AbortController();
		controller.abort();
		await expect(
			verifyLegalActionAllowed({
				queryClient: new QueryClient(),
				info: { legalCheck } as never,
				env: "Mainnet",
				owner: OWNER,
				signal: controller.signal,
			}),
		).rejects.toMatchObject({ reason: "status_unavailable", statusReason: "aborted" });
		expect(legalCheck).not.toHaveBeenCalled();
	});
});

describe("offline legal re-check", () => {
	afterEach(() => {
		onlineManager.setOnline(true);
		vi.useRealTimers();
	});

	it("does not wait for the network manager before failing closed", async () => {
		vi.useFakeTimers();
		Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
		onlineManager.setOnline(false);
		const legalCheck = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
		const outcome = track(
			verifyLegalActionAllowed({
				queryClient: new QueryClient(),
				info: { legalCheck } as never,
				env: "Mainnet",
				owner: OWNER,
			}),
		);
		await vi.advanceTimersByTimeAsync(0);
		expect(legalCheck).toHaveBeenCalledOnce();
		expect(outcome.error).toMatchObject({ reason: "status_unavailable", statusReason: "network" });
	});
});

describe("mutation network mode contract", () => {
	it("never lets the application pause a mutation offline and replay it later", () => {
		const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../providers/root.tsx"), "utf8");
		expect(source).toMatch(/mutations:\s*\{\s*networkMode:\s*"always"\s*\}/);
	});

	it("keeps a client that is unrelated to the scheduler unchanged", async () => {
		const { transport, request } = createTransport();
		const client: ExchangeClient = createExchangeClient(createLocalWallet(AGENT) as never, false, undefined, transport);
		signatures.length = 0;
		await expect(client.cancel(CANCEL as never)).resolves.toMatchObject({ status: "ok" });
		expect(signatures).toHaveLength(1);
		expect(request).toHaveBeenCalledOnce();
	});
});

describe("direct client bound to the caller's deadline", () => {
	const APPROVE = { agentAddress: AGENT, agentName: "Mobile QR" };
	let perfOffset = 0;

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
		perfOffset = 0;
		const realNow = performance.now.bind(performance);
		vi.spyOn(performance, "now").mockImplementation(() => realNow() + perfOffset);
		signatures.length = 0;
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	function freezeFor(ms: number): void {
		vi.setSystemTime(Date.now() + ms);
		perfOffset += ms;
	}

	it.each([
		[60_000, 0],
		[14_000, 1],
	])(
		"when the SDK's nonce lock is granted %i ms after the click, signs the approval %i times",
		async (waitMs, signed) => {
			const locks = installLockManager();
			const releaseNonce = locks.hold(NONCE_LOCK_PREFIX);
			const { transport, request } = createTransport();
			const deadline = startExchangeActionDeadline();
			const client: ExchangeClient = createExchangeClient(
				createJsonRpcWallet(OWNER) as never,
				false,
				undefined,
				transport,
				deadline,
			);

			const outcome = track(client.approveAgent(APPROVE as never).catch(unwrapExchangeSigningDeadline));
			await vi.advanceTimersByTimeAsync(0);
			expect(signatures).toEqual([]);
			freezeFor(waitMs);
			releaseNonce();
			await vi.advanceTimersByTimeAsync(0);

			expect(outcome.settled).toBe(true);
			expect(signatures).toHaveLength(signed);
			expect(request).toHaveBeenCalledTimes(signed);
			if (signed === 0) expect(outcome.error).toBeInstanceOf(ExchangeActionDeadlineError);
			else expect(outcome.error).toBeUndefined();
		},
	);

	it("does not count the time the wallet itself takes to answer the signature request", async () => {
		const locks = installLockManager();
		const { transport, request } = createTransport();
		const wallet = createJsonRpcWallet(OWNER);
		const promptedWallet = {
			...wallet,
			async signTypedData(typedData: unknown) {
				await new Promise((resolve) => setTimeout(resolve, 20_000));
				freezeFor(20_000);
				return wallet.signTypedData(typedData);
			},
		};
		const client: ExchangeClient = createExchangeClient(
			promptedWallet as never,
			false,
			undefined,
			transport,
			startExchangeActionDeadline(),
		);

		const outcome = track(client.approveAgent(APPROVE as never).catch(unwrapExchangeSigningDeadline));
		await vi.advanceTimersByTimeAsync(20_000);
		await vi.advanceTimersByTimeAsync(0);

		expect(locks.acquisitionsWithPrefix(NONCE_LOCK_PREFIX)).toBe(1);
		expect(outcome).toEqual({ settled: true });
		expect(signatures).toHaveLength(1);
		expect(request).toHaveBeenCalledOnce();
	});

	it("never binds a cached client to one click's deadline", async () => {
		const deadline = startExchangeActionDeadline();
		if (deadline.current) deadline.current.queuedAt -= 60_000;
		const client: ExchangeClient = createExchangeClient(
			createLocalWallet(AGENT) as never,
			false,
			"direct-deadline-cache-key",
			undefined,
			deadline,
		);
		const typedData = { domain: {}, types: {}, primaryType: "Agent", message: {} };

		await expect(
			(client.config_.wallet as unknown as { signTypedData: (data: unknown) => Promise<string> }).signTypedData(
				typedData,
			),
		).resolves.toBe(SIGNATURE);
	});
});
