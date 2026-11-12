// @vitest-environment jsdom

import { useExchange } from "@sairn/hl-react/hooks/useExchange";
import {
	EXCHANGE_ACTION_START_DEADLINE_MS,
	ExchangeActionDeadlineError,
	ExchangeRequestScheduler,
} from "@sairn/hl-react/internal/exchange/request-scheduler";
import { LegalActionNotAllowedError } from "@sairn/hl-react/legal";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { infoKey } from "@/lib/hyperliquid";

const OWNER = "0x1234567890abcdef1234567890abcdef12345678";
const SESSION_STORAGE_KEY = `hyperliquid_agent_registration_session_Mainnet_${OWNER}`;
const FUNDS_LOCK_NAME = `hyperliquid_funds_action:Mainnet:${OWNER}`;
const LEGAL_ACCESS = { acceptedTerms: true, userAllowed: true, restrictions: "n" } as const;
const RESPONSE = { status: "ok", response: { type: "default" } } as const;
const ORDER = { orders: [], grouping: "na" } as never;
const CANCEL = { cancels: [{ a: 0, o: 1 }] } as never;
const VAULT_TRANSFER = { vaultAddress: OWNER, isDeposit: true, usd: 1 } as never;

const state = vi.hoisted(() => ({
	enforceLegalActions: false,
	exchangeLifecycle: { id: Symbol("exchange-start-deadline-test"), active: true },
	legalCheck: vi.fn(),
	trading: {
		cancel: vi.fn(),
		order: vi.fn(),
		vaultTransfer: vi.fn(),
	},
}));

vi.mock("@sairn/hl-react/hooks/useClients", () => ({
	useHyperliquidClients: () => ({
		agentPublicKey: null,
		info: {},
		subscription: {},
		trading: state.trading,
		user: {},
		userWalletMismatch: false,
	}),
}));

vi.mock("../../../../../packages/hl-react/src/signing/owner-signer-provider", () => ({
	useHyperliquidOwnerSigner: () => ({ assertCurrent: () => {} }),
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

interface Mutations {
	order: (params: never) => Promise<unknown>;
	cancel: (params: never) => Promise<unknown>;
	vaultTransfer: (params: never) => Promise<unknown>;
}

interface Outcome {
	settled: boolean;
	error?: unknown;
}

function installLockManager(): { isHeld: (name: string) => boolean } {
	const active = new Set<string>();
	const pending: { name: string; run: () => void }[] = [];
	function drain(name: string) {
		if (active.has(name)) return;
		const index = pending.findIndex((entry) => entry.name === name);
		if (index < 0) return;
		const [entry] = pending.splice(index, 1);
		active.add(name);
		entry?.run();
	}
	Object.defineProperty(window.navigator, "locks", {
		configurable: true,
		value: {
			request(name: string, options: unknown, maybeCallback?: (lock: Lock | null) => unknown) {
				const callback = (typeof options === "function" ? options : maybeCallback) as (lock: Lock | null) => unknown;
				return new Promise((resolve, reject) => {
					pending.push({
						name,
						run: () => {
							void Promise.resolve()
								.then(() => callback({ name, mode: "exclusive" } as Lock))
								.then(resolve, reject)
								.finally(() => {
									active.delete(name);
									drain(name);
								});
						},
					});
					drain(name);
				});
			},
		},
	});
	return { isHeld: (name) => active.has(name) };
}

function neverAnswered(_params: unknown, signal: AbortSignal): Promise<never> {
	return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
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

describe("exchange action start deadline", () => {
	let captured: Mutations | null;
	let container: HTMLDivElement;
	let queryClient: QueryClient;
	let root: Root;
	let locks: { isHeld: (name: string) => boolean };

	beforeEach(() => {
		vi.useFakeTimers();
		state.enforceLegalActions = false;
		state.legalCheck.mockReset();
		state.legalCheck.mockResolvedValue(LEGAL_ACCESS);
		state.trading = {
			cancel: vi.fn().mockResolvedValue(RESPONSE),
			order: vi.fn().mockResolvedValue(RESPONSE),
			vaultTransfer: vi.fn().mockResolvedValue(RESPONSE),
		};
		Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
		window.localStorage.setItem(
			SESSION_STORAGE_KEY,
			JSON.stringify({ version: 1, epoch: "11111111-1111-4111-8111-111111111111", state: "active" }),
		);
		locks = installLockManager();
		captured = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		queryClient = new QueryClient();
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		focusManager.setFocused(undefined);
		queryClient.clear();
		container.remove();
		window.localStorage.clear();
		vi.useRealTimers();
	});

	function Probe() {
		const order = useExchange("order");
		const cancel = useExchange("cancel");
		const vaultTransfer = useExchange("vaultTransfer");
		captured = {
			order: order.mutateAsync as Mutations["order"],
			cancel: cancel.mutateAsync as Mutations["cancel"],
			vaultTransfer: vaultTransfer.mutateAsync as Mutations["vaultTransfer"],
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

	it("fails closed when the page loses focus during a legal-check retry and never signs after refocus", async () => {
		state.enforceLegalActions = true;
		state.legalCheck.mockRejectedValueOnce(new TypeError("fetch failed"));
		const mutations = render();

		const outcome = track(mutations.order(ORDER));
		await advance(0);
		expect(state.legalCheck).toHaveBeenCalledTimes(1);

		focusManager.setFocused(false);
		await advance(EXCHANGE_ACTION_START_DEADLINE_MS + 1);
		expect(outcome.settled).toBe(true);
		expect(outcome.error).toBeInstanceOf(LegalActionNotAllowedError);

		focusManager.setFocused(true);
		await advance(60_000);
		expect(state.trading.order).not.toHaveBeenCalled();
		expect(state.legalCheck).toHaveBeenCalledTimes(1);
	});

	it("bounds a legal check that never answers and releases the scheduler for the next order", async () => {
		state.enforceLegalActions = true;
		state.legalCheck.mockImplementationOnce(neverAnswered);
		const mutations = render();

		const first = track(mutations.order(ORDER));
		await advance(EXCHANGE_ACTION_START_DEADLINE_MS);
		expect(first.error).toMatchObject({ reason: "status_unavailable" });

		const second = track(mutations.order(ORDER));
		await advance(0);
		expect(second).toEqual({ settled: true });
		expect(state.trading.order).toHaveBeenCalledTimes(1);
	});

	it("rejects an order that waited past the deadline but still sends a cancel queued behind the same request", async () => {
		let releaseFirst = () => {};
		state.trading.order.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					releaseFirst = () => resolve(RESPONSE);
				}),
		);
		const mutations = render();

		const first = track(mutations.order(ORDER));
		await advance(0);
		expect(state.trading.order).toHaveBeenCalledTimes(1);

		const late = track(mutations.order(ORDER));
		const cancel = track(mutations.cancel(CANCEL));
		await advance(EXCHANGE_ACTION_START_DEADLINE_MS + 1);
		expect(late.settled).toBe(true);
		expect(late.error).toBeInstanceOf(ExchangeActionDeadlineError);
		expect(cancel.settled).toBe(false);

		releaseFirst();
		await advance(0);
		expect(first).toEqual({ settled: true });
		expect(cancel).toEqual({ settled: true });
		expect(state.trading.cancel).toHaveBeenCalledTimes(1);
		expect(state.trading.order).toHaveBeenCalledTimes(1);
	});

	it("releases the funds lock when its legal check joins a passive status request paused in the background", async () => {
		state.enforceLegalActions = true;
		state.legalCheck.mockRejectedValueOnce(new TypeError("fetch failed"));
		const mutations = render();
		queryClient
			.fetchQuery({
				queryKey: infoKey("legalCheck", { user: OWNER }, "Mainnet"),
				queryFn: () => state.legalCheck(),
				retry: 2,
				retryDelay: 1000,
			})
			.catch(() => {});
		await advance(0);
		focusManager.setFocused(false);
		await advance(1000);
		expect(state.legalCheck).toHaveBeenCalledTimes(1);

		const first = track(mutations.vaultTransfer(VAULT_TRANSFER));
		await advance(0);
		expect(locks.isHeld(FUNDS_LOCK_NAME)).toBe(true);

		await advance(EXCHANGE_ACTION_START_DEADLINE_MS);
		expect(first.error).toMatchObject({ reason: "status_unavailable", statusReason: "timeout" });
		expect(locks.isHeld(FUNDS_LOCK_NAME)).toBe(false);
		expect(state.trading.vaultTransfer).not.toHaveBeenCalled();

		focusManager.setFocused(true);
		await advance(0);
		expect(state.trading.vaultTransfer).not.toHaveBeenCalled();
		const second = track(mutations.vaultTransfer(VAULT_TRANSFER));
		await advance(0);
		expect(second).toEqual({ settled: true });
		expect(state.trading.vaultTransfer).toHaveBeenCalledTimes(1);
	});
});

describe("exchange request scheduler start deadline", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	function gatedStart() {
		let open = () => {};
		const opened = new Promise<void>((resolve) => {
			open = resolve;
		});
		return {
			open: () => open(),
			gate: async (start: () => { status: "started"; execution: Promise<unknown> } | { status: "invalidated" }) => {
				await opened;
				return start();
			},
		};
	}

	it.each([
		["the wall clock", "Date"],
		["the monotonic clock", "performance"],
	] as const)(
		"refuses to start when %s shows the deadline passed before its timer could fire",
		async (_label, clock) => {
			const scheduler = new ExchangeRequestScheduler();
			const run = vi.fn(async () => "sent");
			const { open, gate } = gatedStart();
			const request = scheduler.schedule("normal", run, undefined, gate, EXCHANGE_ACTION_START_DEADLINE_MS);

			const now = clock === "Date" ? Date.now() : performance.now();
			if (clock === "Date") vi.spyOn(Date, "now").mockReturnValue(now + EXCHANGE_ACTION_START_DEADLINE_MS);
			else vi.spyOn(performance, "now").mockReturnValue(now + EXCHANGE_ACTION_START_DEADLINE_MS);
			open();

			await expect(request).rejects.toBeInstanceOf(ExchangeActionDeadlineError);
			expect(run).not.toHaveBeenCalled();
		},
	);

	it("frees the queue when a start gate is still waiting at the deadline", async () => {
		vi.useFakeTimers();
		const scheduler = new ExchangeRequestScheduler();
		const stuckRun = vi.fn(async () => "late");
		const { open, gate } = gatedStart();
		const stuck = scheduler.schedule("normal", stuckRun, undefined, gate, EXCHANGE_ACTION_START_DEADLINE_MS);
		const stuckRejection = expect(stuck).rejects.toBeInstanceOf(ExchangeActionDeadlineError);

		await vi.advanceTimersByTimeAsync(EXCHANGE_ACTION_START_DEADLINE_MS);
		await stuckRejection;

		const next = scheduler.schedule("normal", async () => "next");
		await vi.advanceTimersByTimeAsync(0);
		await expect(next).resolves.toBe("next");

		open();
		await vi.advanceTimersByTimeAsync(0);
		expect(stuckRun).not.toHaveBeenCalled();
	});

	it("never expires a request scheduled without a deadline", async () => {
		vi.useFakeTimers();
		const scheduler = new ExchangeRequestScheduler();
		const run = vi.fn(async () => "cancelled");
		const { open, gate } = gatedStart();
		const request = scheduler.schedule("urgent", run, undefined, gate);

		await vi.advanceTimersByTimeAsync(10 * EXCHANGE_ACTION_START_DEADLINE_MS);
		open();
		await expect(request).resolves.toBe("cancelled");
	});
});
