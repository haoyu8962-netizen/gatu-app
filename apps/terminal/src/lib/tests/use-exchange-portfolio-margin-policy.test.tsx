// @vitest-environment jsdom

import type { ExchangeParams } from "@gatu/hl-react";
import { HyperliquidExchangePolicyProvider } from "@gatu/hl-react/exchange-policy";
import { useExchange } from "@gatu/hl-react/hooks/useExchange";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clients = vi.hoisted(() => {
	const response = { status: "ok", response: { type: "default" } } as const;
	const agentSetAbstraction = vi.fn(async () => response);
	const borrowLend = vi.fn(async () => response);
	const updateIsolatedMargin = vi.fn(async () => response);
	const updateLeverage = vi.fn(async () => response);
	const userPortfolioMargin = vi.fn(async () => response);
	const userSetAbstraction = vi.fn(async () => response);
	const withdraw3 = vi.fn(async () => response);
	return {
		agentPublicKey: "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf" as const,
		agentSetAbstraction,
		borrowLend,
		response,
		trading: {
			agentSetAbstraction,
			borrowLend,
			updateIsolatedMargin,
			updateLeverage,
		},
		updateIsolatedMargin,
		updateLeverage,
		user: {
			userPortfolioMargin,
			userSetAbstraction,
			withdraw3,
		},
		userPortfolioMargin,
		userSetAbstraction,
		withdraw3,
	};
});

const providerState = vi.hoisted(() => ({
	exchangeLifecycle: { id: Symbol("portfolio-margin-policy-test"), active: true },
}));

vi.mock("@gatu/hl-react/hooks/useClients", () => ({
	useHyperliquidClients: () => ({
		agentPublicKey: clients.agentPublicKey,
		info: {},
		subscription: {},
		trading: clients.trading,
		user: clients.user,
		userWalletMismatch: false,
	}),
}));

vi.mock("@gatu/hl-react/provider", () => ({
	useHyperliquid: () => ({
		builderConfig: { b: "0x0000000000000000000000000000000000000000", f: 0 },
		clientKey: "0x1234567890abcdef1234567890abcdef12345678",
		env: "Mainnet",
		exchangeLifecycle: providerState.exchangeLifecycle,
		sessionMode: "wallet",
	}),
}));

interface CapturedMutations {
	agentSetAbstraction: (params: ExchangeParams<"agentSetAbstraction">) => Promise<unknown>;
	borrowLend: (params: ExchangeParams<"borrowLend">) => Promise<unknown>;
	updateIsolatedMargin: (params: ExchangeParams<"updateIsolatedMargin">) => Promise<unknown>;
	updateLeverage: (params: ExchangeParams<"updateLeverage">) => Promise<unknown>;
	userPortfolioMargin: (params: ExchangeParams<"userPortfolioMargin">) => Promise<unknown>;
	userSetAbstraction: (params: ExchangeParams<"userSetAbstraction">) => Promise<unknown>;
	withdraw3: (params: ExchangeParams<"withdraw3">) => Promise<unknown>;
}

const USER = "0x1234567890abcdef1234567890abcdef12345678";
const BLOCKED_MESSAGE = "Portfolio margin activation is temporarily unavailable";
const AGENT_PRIVATE_KEY = `0x${"0".repeat(63)}1`;
const SESSION_STORAGE_KEY = `hyperliquid_agent_registration_session_Mainnet_${USER}`;
const AGENT_STORAGE_KEY = `hyperliquid_agent_Mainnet_${USER}`;
const EXECUTION_BLOCKED_MESSAGE = "The isolated-management state changed before execution";
const isolatedExecutionAllowedRef = { current: true };
const updateIsolatedMarginExecutionGuard = vi.fn((_params: ExchangeParams<"updateIsolatedMargin">) => {
	if (!isolatedExecutionAllowedRef.current) throw new Error(EXECUTION_BLOCKED_MESSAGE);
});
const updateLeverageExecutionGuard = vi.fn((_params: ExchangeParams<"updateLeverage">) => {
	if (!isolatedExecutionAllowedRef.current) throw new Error(EXECUTION_BLOCKED_MESSAGE);
});
const withdrawalRouteAllowedRef = { current: true };
const withdrawalPreExecutionGuard = vi.fn(async (_params: ExchangeParams<"withdraw3">) => {
	if (!withdrawalRouteAllowedRef.current) throw new Error("The withdrawal route changed before signing");
});
const borrowLendAllowedRef = { current: true };
const borrowLendPreExecutionGuard = vi.fn(async (_params: ExchangeParams<"borrowLend">) => {
	if (!borrowLendAllowedRef.current) throw new Error("The Earn position changed inside the funds lock");
});
const requestedLockNames: string[] = [];

function installExclusiveLockManager() {
	const queues = new Map<string, Promise<void>>();
	const manager = {
		async request<T>(
			name: string,
			optionsOrCallback: LockOptions | ((lock: Lock | null) => T | PromiseLike<T>),
			maybeCallback?: (lock: Lock | null) => T | PromiseLike<T>,
		): Promise<T> {
			const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
			if (!callback) throw new Error("Missing lock callback");
			requestedLockNames.push(name);

			const previous = queues.get(name) ?? Promise.resolve();
			let release = () => {};
			const current = new Promise<void>((resolve) => {
				release = resolve;
			});
			queues.set(
				name,
				previous.then(() => current),
			);
			await previous;
			try {
				return await callback({ name, mode: "exclusive" } as Lock);
			} finally {
				release();
			}
		},
	} as unknown as LockManager;

	Object.defineProperty(window.navigator, "locks", {
		configurable: true,
		value: manager,
	});
}

describe("useExchange portfolio margin policy", () => {
	let capturedMutations: CapturedMutations | null;
	let container: HTMLDivElement;
	let queryClient: QueryClient;
	let root: Root;

	beforeEach(() => {
		vi.clearAllMocks();
		isolatedExecutionAllowedRef.current = true;
		withdrawalRouteAllowedRef.current = true;
		borrowLendAllowedRef.current = true;
		requestedLockNames.length = 0;
		window.localStorage.clear();
		installExclusiveLockManager();
		providerState.exchangeLifecycle.active = true;
		window.localStorage.setItem(
			SESSION_STORAGE_KEY,
			JSON.stringify({
				version: 1,
				epoch: "11111111-1111-4111-8111-111111111111",
				state: "active",
			}),
		);
		window.localStorage.setItem(
			AGENT_STORAGE_KEY,
			JSON.stringify({
				privateKey: AGENT_PRIVATE_KEY,
				publicKey: clients.agentPublicKey,
				source: "local-registration",
			}),
		);
		capturedMutations = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		queryClient = new QueryClient({
			defaultOptions: {
				mutations: { retry: false },
			},
		});
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		queryClient.clear();
		container.remove();
		window.localStorage.clear();
		Object.defineProperty(window.navigator, "locks", {
			configurable: true,
			value: undefined,
		});
	});

	function Probe() {
		const agentSetAbstraction = useExchange("agentSetAbstraction");
		const borrowLend = useExchange("borrowLend", { preExecutionGuard: borrowLendPreExecutionGuard });
		const updateIsolatedMargin = useExchange("updateIsolatedMargin", {
			executionGuard: updateIsolatedMarginExecutionGuard,
		});
		const updateLeverage = useExchange("updateLeverage", {
			executionGuard: updateLeverageExecutionGuard,
		});
		const userPortfolioMargin = useExchange("userPortfolioMargin");
		const userSetAbstraction = useExchange("userSetAbstraction");
		const withdraw3 = useExchange("withdraw3", {
			preExecutionGuard: withdrawalPreExecutionGuard,
			retry: 3,
		});

		capturedMutations = {
			agentSetAbstraction: agentSetAbstraction.mutateAsync,
			borrowLend: borrowLend.mutateAsync,
			updateIsolatedMargin: updateIsolatedMargin.mutateAsync,
			updateLeverage: updateLeverage.mutateAsync,
			userPortfolioMargin: userPortfolioMargin.mutateAsync,
			userSetAbstraction: userSetAbstraction.mutateAsync,
			withdraw3: withdraw3.mutateAsync,
		};
		return null;
	}

	function renderPolicy(portfolioMarginActivationEnabled?: boolean) {
		act(() => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<HyperliquidExchangePolicyProvider portfolioMarginActivationEnabled={portfolioMarginActivationEnabled}>
						<Probe />
					</HyperliquidExchangePolicyProvider>
				</QueryClientProvider>,
			);
		});
	}

	it("blocks direct mutation-hook bypasses when the provider flag is absent", async () => {
		act(() => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<Probe />
				</QueryClientProvider>,
			);
		});

		await act(async () => {
			await expect(
				capturedMutations?.userSetAbstraction({
					user: USER,
					abstraction: "portfolioMargin",
				}),
			).rejects.toThrow(BLOCKED_MESSAGE);
			await expect(
				capturedMutations?.userPortfolioMargin({
					user: USER,
					enabled: true,
				}),
			).rejects.toThrow(BLOCKED_MESSAGE);
			await expect(capturedMutations?.agentSetAbstraction({ abstraction: "p" })).rejects.toThrow(BLOCKED_MESSAGE);
		});

		expect(clients.userSetAbstraction).not.toHaveBeenCalled();
		expect(clients.userPortfolioMargin).not.toHaveBeenCalled();
		expect(clients.agentSetAbstraction).not.toHaveBeenCalled();
	});

	it("snapshots and rechecks policy fields at SDK execution time", async () => {
		renderPolicy(false);
		let abstractionReads = 0;
		const params = { user: USER } as ExchangeParams<"userSetAbstraction">;
		Object.defineProperty(params, "abstraction", {
			enumerable: true,
			get: () => {
				abstractionReads += 1;
				return abstractionReads === 1 ? "unifiedAccount" : "portfolioMargin";
			},
		});

		await act(async () => {
			await expect(capturedMutations?.userSetAbstraction(params)).rejects.toThrow(BLOCKED_MESSAGE);
		});

		expect(abstractionReads).toBe(2);
		expect(clients.userSetAbstraction).not.toHaveBeenCalled();
	});

	it("preserves disable and switch-away mutations while the gate is closed", async () => {
		renderPolicy(false);

		await act(async () => {
			await capturedMutations?.userSetAbstraction({
				user: USER,
				abstraction: "unifiedAccount",
			});
			await capturedMutations?.userPortfolioMargin({
				user: USER,
				enabled: false,
			});
			await capturedMutations?.agentSetAbstraction({ abstraction: "u" });
		});

		expect(clients.userSetAbstraction).toHaveBeenCalledWith({
			user: USER,
			abstraction: "unifiedAccount",
		});
		expect(clients.userPortfolioMargin).toHaveBeenCalledWith({
			user: USER,
			enabled: false,
		});
		expect(clients.agentSetAbstraction).toHaveBeenCalledWith({ abstraction: "u" });
	});

	it("allows all three activation paths only when the provider flag is true", async () => {
		renderPolicy(true);

		await act(async () => {
			await capturedMutations?.userSetAbstraction({
				user: USER,
				abstraction: "portfolioMargin",
			});
			await capturedMutations?.userPortfolioMargin({
				user: USER,
				enabled: true,
			});
			await capturedMutations?.agentSetAbstraction({ abstraction: "p" });
		});

		expect(clients.userSetAbstraction).toHaveBeenCalledTimes(1);
		expect(clients.userPortfolioMargin).toHaveBeenCalledTimes(1);
		expect(clients.agentSetAbstraction).toHaveBeenCalledTimes(1);
	});

	it("passes isolated leverage and margin mutations through to the SDK boundary", async () => {
		renderPolicy(false);
		const stringMarginRemoval = {
			asset: 1,
			isBuy: true,
			ntli: "-1",
		} as unknown as ExchangeParams<"updateIsolatedMargin">;

		await act(async () => {
			await capturedMutations?.updateLeverage({
				asset: 1,
				isCross: false,
				leverage: 5,
			});
			await capturedMutations?.updateIsolatedMargin({
				asset: 1,
				isBuy: true,
				ntli: -1,
			});
			await capturedMutations?.updateIsolatedMargin(stringMarginRemoval);
		});

		expect(clients.updateLeverage).toHaveBeenCalledWith({
			asset: 1,
			isCross: false,
			leverage: 5,
		});
		expect(clients.updateIsolatedMargin).toHaveBeenNthCalledWith(1, {
			asset: 1,
			isBuy: true,
			ntli: -1,
		});
		expect(clients.updateIsolatedMargin).toHaveBeenNthCalledWith(2, {
			asset: 1,
			isBuy: true,
			ntli: "-1",
		});
	});

	it("acquires funds before session locks while ordinary trading methods stay outside the funds lock", async () => {
		renderPolicy(false);
		const mutations = capturedMutations;
		if (!mutations) throw new Error("Mutation hooks were not captured");

		await act(async () => {
			await mutations.userSetAbstraction({ user: USER, abstraction: "unifiedAccount" });
		});
		expect(requestedLockNames).toEqual([
			`hyperliquid_funds_action:Mainnet:${USER}`,
			`hyperliquid_agent_registration_session:Mainnet:${USER}`,
		]);

		requestedLockNames.length = 0;
		await act(async () => {
			await mutations.updateLeverage({ asset: 1, isCross: false, leverage: 5 });
		});
		expect(requestedLockNames).toEqual([`hyperliquid_agent_registration_session:Mainnet:${USER}`]);
	});

	it("holds the cross-tab funds lock until the SDK response settles", async () => {
		renderPolicy(false);
		const mutations = capturedMutations;
		if (!mutations) throw new Error("Mutation hooks were not captured");
		let markSdkStarted = () => {};
		let releaseSdk = () => {};
		const sdkStarted = new Promise<void>((resolve) => {
			markSdkStarted = resolve;
		});
		const sdkResponse = new Promise<typeof clients.response>((resolve) => {
			releaseSdk = () => resolve(clients.response);
		});
		clients.userSetAbstraction.mockImplementationOnce(async () => {
			markSdkStarted();
			return sdkResponse;
		});

		let firstRequest: Promise<unknown> | undefined;
		await act(async () => {
			firstRequest = mutations.userSetAbstraction({ user: USER, abstraction: "unifiedAccount" });
			await sdkStarted;
		});
		let competingTabEntered = false;
		const competingTab = navigator.locks.request(
			`hyperliquid_funds_action:Mainnet:${USER}`,
			{ mode: "exclusive" },
			async () => {
				competingTabEntered = true;
			},
		);
		await Promise.resolve();
		expect(competingTabEntered).toBe(false);

		await act(async () => {
			releaseSdk();
			await expect(firstRequest).resolves.toEqual(clients.response);
			await competingTab;
		});
		expect(competingTabEntered).toBe(true);
	});

	it("rechecks the latest isolated-management state when a queued request reaches the SDK boundary", async () => {
		renderPolicy(false);
		let releaseFirstRequest = () => {};
		let markFirstRequestStarted = () => {};
		const firstRequestStarted = new Promise<void>((resolve) => {
			markFirstRequestStarted = resolve;
		});
		const firstRequestResponse = new Promise<typeof clients.response>((resolve) => {
			releaseFirstRequest = () => resolve(clients.response);
		});
		clients.updateLeverage.mockImplementationOnce(async () => {
			markFirstRequestStarted();
			return firstRequestResponse;
		});

		const mutations = capturedMutations;
		if (!mutations) throw new Error("Mutation hooks were not captured");
		let firstRequest: Promise<unknown> | undefined;
		await act(async () => {
			firstRequest = mutations.updateLeverage({ asset: 1, isCross: false, leverage: 5 });
			await firstRequestStarted;
		});
		let queuedRequest: Promise<unknown> | undefined;
		await act(async () => {
			queuedRequest = mutations.updateLeverage({ asset: 1, isCross: false, leverage: 6 });
			await vi.waitFor(() => expect(updateLeverageExecutionGuard).toHaveBeenCalledTimes(3));
		});

		isolatedExecutionAllowedRef.current = false;
		await act(async () => {
			releaseFirstRequest();
			await expect(firstRequest).resolves.toEqual(clients.response);
			await expect(queuedRequest).rejects.toThrow(EXECUTION_BLOCKED_MESSAGE);
		});

		expect(updateLeverageExecutionGuard).toHaveBeenCalledTimes(4);
		expect(clients.updateLeverage).toHaveBeenCalledTimes(1);
	});

	it("runs async pre-execution guards after queueing and before the SDK signing boundary", async () => {
		renderPolicy(false);
		let releaseFirstRequest = () => {};
		let markFirstRequestStarted = () => {};
		const firstRequestStarted = new Promise<void>((resolve) => {
			markFirstRequestStarted = resolve;
		});
		const firstRequestResponse = new Promise<typeof clients.response>((resolve) => {
			releaseFirstRequest = () => resolve(clients.response);
		});
		clients.userSetAbstraction.mockImplementationOnce(async () => {
			markFirstRequestStarted();
			return firstRequestResponse;
		});

		const mutations = capturedMutations;
		if (!mutations) throw new Error("Mutation hooks were not captured");
		let firstRequest: Promise<unknown> | undefined;
		await act(async () => {
			firstRequest = mutations.userSetAbstraction({ user: USER, abstraction: "unifiedAccount" });
			await firstRequestStarted;
		});
		let queuedWithdrawal: Promise<unknown> | undefined;
		await act(async () => {
			queuedWithdrawal = mutations.withdraw3({ destination: USER, amount: "10" });
			await Promise.resolve();
		});
		expect(withdrawalPreExecutionGuard).not.toHaveBeenCalled();

		withdrawalRouteAllowedRef.current = false;
		await act(async () => {
			releaseFirstRequest();
			await expect(firstRequest).resolves.toEqual(clients.response);
			await expect(queuedWithdrawal).rejects.toThrow("The withdrawal route changed before signing");
		});
		expect(withdrawalPreExecutionGuard).toHaveBeenCalledTimes(1);
		expect(clients.withdraw3).not.toHaveBeenCalled();

		withdrawalRouteAllowedRef.current = true;
		await act(async () => {
			await expect(mutations.withdraw3({ destination: USER, amount: "10" })).resolves.toEqual(clients.response);
		});
		expect(withdrawalPreExecutionGuard).toHaveBeenCalledTimes(2);
		expect(clients.withdraw3).toHaveBeenCalledTimes(1);
	});

	it("never automatically retries a funds action after the SDK request starts", async () => {
		renderPolicy(false);
		const mutations = capturedMutations;
		if (!mutations) throw new Error("Mutation hooks were not captured");
		clients.withdraw3.mockRejectedValueOnce(new Error("request status is unknown"));

		await act(async () => {
			await expect(mutations.withdraw3({ destination: USER, amount: "10" })).rejects.toThrow(
				"request status is unknown",
			);
		});
		expect(clients.withdraw3).toHaveBeenCalledTimes(1);
	});

	it("fails closed at runtime when guarded methods bypass their required TypeScript option", async () => {
		let mutationsWithoutGuards: {
			topUpIsolatedOnlyMargin: (params: ExchangeParams<"topUpIsolatedOnlyMargin">) => Promise<unknown>;
			updateIsolatedMargin: CapturedMutations["updateIsolatedMargin"];
			updateLeverage: CapturedMutations["updateLeverage"];
		} | null = null;
		function MissingGuardProbe() {
			const topUpIsolatedOnlyMargin = useExchange("topUpIsolatedOnlyMargin", undefined as never);
			const updateIsolatedMargin = useExchange("updateIsolatedMargin", undefined as never);
			const updateLeverage = useExchange("updateLeverage", undefined as never);
			mutationsWithoutGuards = {
				topUpIsolatedOnlyMargin: topUpIsolatedOnlyMargin.mutateAsync,
				updateIsolatedMargin: updateIsolatedMargin.mutateAsync,
				updateLeverage: updateLeverage.mutateAsync,
			};
			return null;
		}

		act(() => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<MissingGuardProbe />
				</QueryClientProvider>,
			);
		});

		if (!mutationsWithoutGuards) throw new Error("Mutation hooks were not captured");
		await act(async () => {
			await expect(mutationsWithoutGuards?.updateLeverage({ asset: 1, isCross: false, leverage: 5 })).rejects.toThrow(
				"An execution guard is required for isolated margin management",
			);
			await expect(mutationsWithoutGuards?.updateIsolatedMargin({ asset: 1, isBuy: true, ntli: -1 })).rejects.toThrow(
				"An execution guard is required for isolated margin management",
			);
			await expect(mutationsWithoutGuards?.topUpIsolatedOnlyMargin({ asset: 1, leverage: "5" })).rejects.toThrow(
				"An execution guard is required for isolated margin management",
			);
		});
		expect(clients.updateLeverage).not.toHaveBeenCalled();
		expect(clients.updateIsolatedMargin).not.toHaveBeenCalled();
	});

	it("rejects asynchronous pre-execution guards on trading-client methods", async () => {
		let mutateWithPreExecutionGuard: CapturedMutations["agentSetAbstraction"] | null = null;
		const preExecutionGuard = vi.fn(async () => {});
		function TradingGuardProbe() {
			const mutation = useExchange("agentSetAbstraction", { preExecutionGuard });
			mutateWithPreExecutionGuard = mutation.mutateAsync;
			return null;
		}

		act(() => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<HyperliquidExchangePolicyProvider portfolioMarginActivationEnabled>
						<TradingGuardProbe />
					</HyperliquidExchangePolicyProvider>
				</QueryClientProvider>,
			);
		});

		await act(async () => {
			await expect(mutateWithPreExecutionGuard?.({ abstraction: "u" })).rejects.toThrow(
				"Pre-execution guards are supported only for user-signed methods and opted-in trading funds actions",
			);
		});
		expect(preExecutionGuard).not.toHaveBeenCalled();
		expect(clients.agentSetAbstraction).not.toHaveBeenCalled();
	});

	it("runs the opted-in borrowLend pre-execution guard inside the funds and session locks", async () => {
		renderPolicy(false);
		const mutations = capturedMutations;
		if (!mutations) throw new Error("Mutation hooks were not captured");

		await act(async () => {
			await expect(mutations.borrowLend({ operation: "withdraw", token: 0, amount: null })).resolves.toEqual(
				clients.response,
			);
		});
		expect(requestedLockNames).toEqual([
			`hyperliquid_funds_action:Mainnet:${USER}`,
			`hyperliquid_agent_registration_session:Mainnet:${USER}`,
		]);
		expect(borrowLendPreExecutionGuard).toHaveBeenCalledTimes(1);
		expect(borrowLendPreExecutionGuard.mock.invocationCallOrder[0]).toBeLessThan(
			clients.borrowLend.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
		);

		borrowLendAllowedRef.current = false;
		await act(async () => {
			await expect(mutations.borrowLend({ operation: "withdraw", token: 0, amount: null })).rejects.toThrow(
				"The Earn position changed inside the funds lock",
			);
		});
		expect(clients.borrowLend).toHaveBeenCalledTimes(1);
	});

	it("rejects asynchronous execution guards before scheduling an SDK request", async () => {
		let mutateWithAsyncGuard: CapturedMutations["updateLeverage"] | null = null;
		const asyncExecutionGuard = vi.fn(async (_params: ExchangeParams<"updateLeverage">) => {});
		function AsyncGuardProbe() {
			const mutation = useExchange("updateLeverage", { executionGuard: asyncExecutionGuard });
			mutateWithAsyncGuard = mutation.mutateAsync;
			return null;
		}

		act(() => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<AsyncGuardProbe />
				</QueryClientProvider>,
			);
		});

		await act(async () => {
			await expect(mutateWithAsyncGuard?.({ asset: 1, isCross: false, leverage: 5 })).rejects.toThrow(
				"Execution guards must complete synchronously",
			);
		});
		expect(asyncExecutionGuard).toHaveBeenCalledTimes(1);
		expect(clients.updateLeverage).not.toHaveBeenCalled();
	});
});
