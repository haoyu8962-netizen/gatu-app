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
	return {
		agentPublicKey: "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf" as const,
		agentSetAbstraction: vi.fn(async () => response),
		updateIsolatedMargin: vi.fn(async () => response),
		updateLeverage: vi.fn(async () => response),
		userPortfolioMargin: vi.fn(async () => response),
		userSetAbstraction: vi.fn(async () => response),
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
		trading: {
			agentSetAbstraction: clients.agentSetAbstraction,
			updateIsolatedMargin: clients.updateIsolatedMargin,
			updateLeverage: clients.updateLeverage,
		},
		user: {
			userPortfolioMargin: clients.userPortfolioMargin,
			userSetAbstraction: clients.userSetAbstraction,
		},
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
	updateIsolatedMargin: (params: ExchangeParams<"updateIsolatedMargin">) => Promise<unknown>;
	updateLeverage: (params: ExchangeParams<"updateLeverage">) => Promise<unknown>;
	userPortfolioMargin: (params: ExchangeParams<"userPortfolioMargin">) => Promise<unknown>;
	userSetAbstraction: (params: ExchangeParams<"userSetAbstraction">) => Promise<unknown>;
}

const USER = "0x1234567890abcdef1234567890abcdef12345678";
const BLOCKED_MESSAGE = "Portfolio margin activation is temporarily unavailable";
const AGENT_PRIVATE_KEY = `0x${"0".repeat(63)}1`;
const SESSION_STORAGE_KEY = `hyperliquid_agent_registration_session_Mainnet_${USER}`;
const AGENT_STORAGE_KEY = `hyperliquid_agent_Mainnet_${USER}`;

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
		const updateIsolatedMargin = useExchange("updateIsolatedMargin");
		const updateLeverage = useExchange("updateLeverage");
		const userPortfolioMargin = useExchange("userPortfolioMargin");
		const userSetAbstraction = useExchange("userSetAbstraction");

		capturedMutations = {
			agentSetAbstraction: agentSetAbstraction.mutateAsync,
			updateIsolatedMargin: updateIsolatedMargin.mutateAsync,
			updateLeverage: updateLeverage.mutateAsync,
			userPortfolioMargin: userPortfolioMargin.mutateAsync,
			userSetAbstraction: userSetAbstraction.mutateAsync,
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

	it("blocks isolated leverage and margin-removal mutations at the final SDK boundary", async () => {
		renderPolicy(false);

		await act(async () => {
			await expect(
				capturedMutations?.updateLeverage({
					asset: 1,
					isCross: false,
					leverage: 5,
				}),
			).rejects.toThrow("Isolated risk-increasing actions are temporarily unavailable");
			await expect(
				capturedMutations?.updateIsolatedMargin({
					asset: 1,
					isBuy: true,
					ntli: -1,
				}),
			).rejects.toThrow("Isolated risk-increasing actions are temporarily unavailable");
		});

		expect(clients.updateLeverage).not.toHaveBeenCalled();
		expect(clients.updateIsolatedMargin).not.toHaveBeenCalled();
	});

	it("snapshots and rechecks isolated policy fields immediately before SDK execution", async () => {
		renderPolicy(false);
		let isCrossReads = 0;
		const params = { asset: 1, leverage: 5 } as ExchangeParams<"updateLeverage">;
		Object.defineProperty(params, "isCross", {
			enumerable: true,
			get: () => {
				isCrossReads += 1;
				return isCrossReads === 1;
			},
		});

		await act(async () => {
			await expect(capturedMutations?.updateLeverage(params)).rejects.toThrow(
				"Isolated risk-increasing actions are temporarily unavailable",
			);
		});

		expect(isCrossReads).toBe(2);
		expect(clients.updateLeverage).not.toHaveBeenCalled();
	});

	it("preserves cross leverage and isolated margin additions while the gate is closed", async () => {
		renderPolicy(false);

		await act(async () => {
			await capturedMutations?.updateLeverage({
				asset: 1,
				isCross: true,
				leverage: 5,
			});
			await capturedMutations?.updateIsolatedMargin({
				asset: 1,
				isBuy: true,
				ntli: 1,
			});
		});

		expect(clients.updateLeverage).toHaveBeenCalledWith({
			asset: 1,
			isCross: true,
			leverage: 5,
		});
		expect(clients.updateIsolatedMargin).toHaveBeenCalledWith({
			asset: 1,
			isBuy: true,
			ntli: 1,
		});
	});
});
