// @vitest-environment jsdom

import type { ExchangeParams } from "@gatu/hl-react";
import { useExchange } from "@gatu/hl-react/hooks/useExchange";
import { FundsActionLockTimeoutError } from "@gatu/hl-react/internal/exchange/funds-action-lock";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0x1234567890abcdef1234567890abcdef12345678";
const SESSION_STORAGE_KEY = `hyperliquid_agent_registration_session_Mainnet_${OWNER}`;
const FUNDS_LOCK_NAME = `hyperliquid_funds_action:Mainnet:${OWNER}`;

const clients = vi.hoisted(() => {
	const response = { status: "ok", response: { type: "default" } } as const;
	const firstWithdraw = vi.fn(async () => response);
	const secondWithdraw = vi.fn(async () => response);
	const tokenDelegate = vi.fn(async () => response);
	return {
		first: { tokenDelegate, withdraw3: firstWithdraw },
		firstWithdraw,
		hookCallCount: 0,
		response,
		second: { withdraw3: secondWithdraw },
		secondWithdraw,
		tokenDelegate,
	};
});

const providerState = vi.hoisted(() => ({
	exchangeLifecycle: { id: Symbol("funds-lock-integration-test"), active: true },
}));

vi.mock("@gatu/hl-react/hooks/useClients", () => ({
	useHyperliquidClients: () => {
		const hookIndex = clients.hookCallCount % 3;
		const user = hookIndex === 1 ? clients.second : clients.first;
		clients.hookCallCount += 1;
		return {
			agentPublicKey: undefined,
			info: {},
			subscription: {},
			trading: {},
			user,
			userWalletMismatch: false,
		};
	},
}));

vi.mock("@gatu/hl-react/provider", () => ({
	useHyperliquid: () => ({
		builderConfig: { b: "0x0000000000000000000000000000000000000000", f: 0 },
		clientKey: OWNER,
		env: "Mainnet",
		exchangeLifecycle: providerState.exchangeLifecycle,
		sessionMode: "wallet",
	}),
}));

interface CapturedMutations {
	first: (params: ExchangeParams<"withdraw3">) => Promise<unknown>;
	second: (params: ExchangeParams<"withdraw3">) => Promise<unknown>;
	tokenDelegate: (params: ExchangeParams<"tokenDelegate">) => Promise<unknown>;
}

interface PendingLockRequest<T = unknown> {
	callback: (lock: Lock | null) => T | PromiseLike<T>;
	name: string;
	reject: (reason?: unknown) => void;
	resolve: (value: T | PromiseLike<T>) => void;
	signal?: AbortSignal;
}

function setLockManager(manager: LockManager | undefined): void {
	Object.defineProperty(window.navigator, "locks", {
		configurable: true,
		value: manager,
	});
}

function installExclusiveLockManager(): void {
	const active = new Set<string>();
	const pending: PendingLockRequest[] = [];

	function drain(name: string): void {
		if (active.has(name)) return;
		const index = pending.findIndex((entry) => entry.name === name);
		if (index < 0) return;
		const [entry] = pending.splice(index, 1);
		if (!entry) return;
		if (entry.signal?.aborted) {
			entry.reject(entry.signal.reason);
			drain(name);
			return;
		}

		active.add(name);
		void Promise.resolve(entry.callback({ name, mode: "exclusive" } as Lock))
			.then(entry.resolve, entry.reject)
			.finally(() => {
				active.delete(name);
				drain(name);
			});
	}

	setLockManager({
		request<T>(
			name: string,
			optionsOrCallback: LockOptions | ((lock: Lock | null) => T | PromiseLike<T>),
			maybeCallback?: (lock: Lock | null) => T | PromiseLike<T>,
		): Promise<T> {
			const options = typeof optionsOrCallback === "function" ? undefined : optionsOrCallback;
			const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
			if (!callback) return Promise.reject(new Error("Missing lock callback"));

			return new Promise<T>((resolve, reject) => {
				pending.push({ callback, name, reject, resolve, signal: options?.signal } as PendingLockRequest);
				drain(name);
			});
		},
	} as unknown as LockManager);
}

function installNeverGrantFundsLockManager(): { getRequestCount: () => number } {
	let requestCount = 0;
	setLockManager({
		request<T>(
			name: string,
			optionsOrCallback: LockOptions | ((lock: Lock | null) => T | PromiseLike<T>),
			maybeCallback?: (lock: Lock | null) => T | PromiseLike<T>,
		): Promise<T> {
			const options = typeof optionsOrCallback === "function" ? undefined : optionsOrCallback;
			const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
			if (!callback) return Promise.reject(new Error("Missing lock callback"));
			if (name !== FUNDS_LOCK_NAME) return Promise.resolve(callback({ name, mode: "exclusive" } as Lock));

			requestCount += 1;
			return new Promise<T>((_resolve, reject) => {
				const signal = options?.signal;
				if (signal?.aborted) {
					reject(signal.reason);
					return;
				}
				signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
			});
		},
	} as unknown as LockManager);
	return { getRequestCount: () => requestCount };
}

async function flushMicrotasks(): Promise<void> {
	for (let attempt = 0; attempt < 10; attempt += 1) await Promise.resolve();
}

async function waitUntil(predicate: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
	throw new Error("Condition was not reached");
}

describe("useExchange funds action lock integration", () => {
	let capturedMutations: CapturedMutations | null;
	let container: HTMLDivElement;
	let queryClient: QueryClient;
	let root: Root;

	beforeEach(() => {
		vi.clearAllMocks();
		clients.hookCallCount = 0;
		providerState.exchangeLifecycle.active = true;
		window.localStorage.clear();
		window.localStorage.setItem(
			SESSION_STORAGE_KEY,
			JSON.stringify({
				version: 1,
				epoch: "11111111-1111-4111-8111-111111111111",
				state: "active",
			}),
		);
		capturedMutations = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		queryClient = new QueryClient();
		root = createRoot(container);
	});

	afterEach(() => {
		vi.useRealTimers();
		act(() => root.unmount());
		queryClient.clear();
		container.remove();
		window.localStorage.clear();
		setLockManager(undefined);
	});

	function Probe() {
		const first = useExchange("withdraw3", { retry: 3, retryDelay: 0 });
		const second = useExchange("withdraw3", { retry: 3, retryDelay: 0 });
		const tokenDelegate = useExchange("tokenDelegate", { retry: 3, retryDelay: 0 });
		capturedMutations = {
			first: first.mutateAsync,
			second: second.mutateAsync,
			tokenDelegate: tokenDelegate.mutateAsync,
		};
		return null;
	}

	function renderProbe(): CapturedMutations {
		act(() => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<Probe />
				</QueryClientProvider>,
			);
		});
		if (!capturedMutations) throw new Error("Mutation hooks were not captured");
		return capturedMutations;
	}

	it("serializes separate hook and ExchangeClient instances until the first SDK promise settles", async () => {
		installExclusiveLockManager();
		let releaseFirst = () => {};
		const firstSdkResponse = new Promise<typeof clients.response>((resolve) => {
			releaseFirst = () => resolve(clients.response);
		});
		clients.firstWithdraw.mockImplementationOnce(() => firstSdkResponse);
		const mutations = renderProbe();
		expect(clients.first).not.toBe(clients.second);

		let firstRequest: Promise<unknown> | undefined;
		await act(async () => {
			firstRequest = mutations.first({ destination: OWNER, amount: "10" });
			await waitUntil(() => clients.firstWithdraw.mock.calls.length === 1);
		});

		let secondRequest: Promise<unknown> | undefined;
		await act(async () => {
			secondRequest = mutations.second({ destination: OWNER, amount: "20" });
			await flushMicrotasks();
		});
		expect(clients.secondWithdraw).not.toHaveBeenCalled();

		await act(async () => {
			releaseFirst();
			await expect(firstRequest).resolves.toEqual(clients.response);
			await expect(secondRequest).resolves.toEqual(clients.response);
		});
		expect(clients.secondWithdraw).toHaveBeenCalledTimes(1);
	});

	it("fails closed without Web Locks and does not retry or call either SDK client", async () => {
		let lockCapabilityReads = 0;
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			get: () => {
				lockCapabilityReads += 1;
				return undefined;
			},
		});
		const mutations = renderProbe();

		await act(async () => {
			await expect(mutations.first({ destination: OWNER, amount: "10" })).rejects.toThrow(
				"Secure cross-tab funds coordination requires Web Locks support.",
			);
		});

		expect(lockCapabilityReads).toBe(1);
		expect(clients.firstWithdraw).not.toHaveBeenCalled();
		expect(clients.secondWithdraw).not.toHaveBeenCalled();
		expect(queryClient.getMutationCache().getAll()).toHaveLength(1);
		expect(queryClient.getMutationCache().getAll()[0]?.state.failureCount).toBe(1);
	});

	it("does not retry a newly guarded staking funds action", async () => {
		let lockCapabilityReads = 0;
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			get: () => {
				lockCapabilityReads += 1;
				return undefined;
			},
		});
		const mutations = renderProbe();

		await act(async () => {
			await expect(
				mutations.tokenDelegate({
					validator: OWNER,
					wei: 100_000_000,
					isUndelegate: false,
				}),
			).rejects.toThrow("Secure cross-tab funds coordination requires Web Locks support.");
		});

		expect(lockCapabilityReads).toBe(1);
		expect(clients.tokenDelegate).not.toHaveBeenCalled();
		expect(queryClient.getMutationCache().getAll()).toHaveLength(1);
		expect(queryClient.getMutationCache().getAll()[0]?.state.failureCount).toBe(1);
	});

	it("fails closed after the lock wait timeout and does not retry or call either SDK client", async () => {
		vi.useFakeTimers();
		const lockManager = installNeverGrantFundsLockManager();
		const mutations = renderProbe();
		const request = mutations.first({ destination: OWNER, amount: "10" });
		const rejection = request.catch((error: unknown) => error);
		await flushMicrotasks();
		expect(lockManager.getRequestCount()).toBe(1);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(40_001);
			await expect(rejection).resolves.toBeInstanceOf(FundsActionLockTimeoutError);
		});

		expect(lockManager.getRequestCount()).toBe(1);
		expect(clients.firstWithdraw).not.toHaveBeenCalled();
		expect(clients.secondWithdraw).not.toHaveBeenCalled();
		expect(queryClient.getMutationCache().getAll()).toHaveLength(1);
		expect(queryClient.getMutationCache().getAll()[0]?.state.failureCount).toBe(1);
	});
});
