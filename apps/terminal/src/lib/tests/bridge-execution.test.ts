import type { RouteExtended } from "@lifi/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeQuote } from "@/lib/lifi/use-quote";

const sdk = vi.hoisted(() => ({
	convertQuoteToRoute: vi.fn(),
	executeRoute: vi.fn(),
	resumeRoute: vi.fn(),
	updateRouteExecution: vi.fn(),
}));

const featureState = vi.hoisted(() => ({
	createNewRoute: true,
}));

const executionSecurity = vi.hoisted(() => ({
	activeWalletAddress: "0x1111111111111111111111111111111111111111" as `0x${string}` | null,
	clearPersistedBridgeExecution: vi.fn(),
	persistCommittedBridgeExecution: vi.fn(() => true),
	recoveryStorageAvailable: true,
}));

vi.mock("@lifi/sdk", () => sdk);
vi.mock("@/config/lifi-bridge", () => ({
	LIFI_BRIDGE_FEATURES: featureState,
}));
vi.mock("@/lib/lifi/config", () => ({
	getActiveLiFiWalletAddress: () => executionSecurity.activeWalletAddress,
	runWithLiFiExecutionWallet: async (_walletAddress: string, _sourceChainId: number, execute: () => Promise<unknown>) =>
		execute(),
}));
vi.mock("@/lib/lifi/bridge-execution-persistence", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/lifi/bridge-execution-persistence")>();
	return {
		...actual,
		clearPersistedBridgeExecution: executionSecurity.clearPersistedBridgeExecution,
		isBridgeRecoveryStorageAvailable: () => executionSecurity.recoveryStorageAvailable,
		persistCommittedBridgeExecution: executionSecurity.persistCommittedBridgeExecution,
	};
});

import { INITIAL_BRIDGE_STATE, useBridgeExecutionState } from "@/lib/lifi/bridge-execution-state";
import {
	continueBridgeInBackground,
	executeBridgeQuote,
	resetBridgeExecution,
	restoreBridgeInForeground,
	retryBridgeExecution,
} from "@/lib/lifi/use-bridge";

interface ExecutionOptions {
	updateRouteHook?: (route: RouteExtended) => void;
}

const SOURCE_ADDRESS = "0x1111111111111111111111111111111111111111";
const HYPERCORE_USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const TX_HASH = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function createRoute(
	process: Array<Record<string, unknown>> = [],
	executionStatus: "ACTION_REQUIRED" | "PENDING" | "FAILED" | "DONE" = "PENDING",
): RouteExtended {
	return {
		id: "route-1",
		fromChainId: 42161,
		fromAmount: "1000000",
		fromAmountUSD: "1",
		fromAddress: SOURCE_ADDRESS,
		fromToken: { address: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8", chainId: 42161 },
		toChainId: 1337,
		toAmount: "997500",
		toAmountMin: "992512",
		toAmountUSD: "0.9965",
		toAddress: SOURCE_ADDRESS,
		toToken: { address: HYPERCORE_USDC_ADDRESS, chainId: 1337 },
		steps: [
			{
				id: "route-1",
				type: "lifi",
				tool: "hyperliquid",
				action: {
					fromAddress: SOURCE_ADDRESS,
					fromChainId: 42161,
					fromAmount: "1000000",
					fromToken: {
						address: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
						chainId: 42161,
						symbol: "USDC",
					},
					toAddress: SOURCE_ADDRESS,
					toChainId: 1337,
					toToken: { address: HYPERCORE_USDC_ADDRESS, chainId: 1337 },
				},
				execution:
					process.length > 0
						? {
								status: executionStatus,
								startedAt: 1,
								process,
								toAmount: executionStatus === "DONE" ? "997500" : undefined,
							}
						: undefined,
			},
		],
	} as unknown as RouteExtended;
}

function createQuote(): BridgeQuote {
	return {
		step: {} as BridgeQuote["step"],
		fromAmount: "1000000",
		fromAmountUSD: "1",
		toAmount: "997500",
		toAmountMin: "992512",
		toAmountUSD: "0.9965",
		executionDuration: 30,
		gasCosts: [],
		feeCosts: [],
		totalFeesUSD: "0.01",
	};
}

function createCrossChainProcess(status: "PENDING" | "FAILED" | "DONE") {
	return {
		type: "CROSS_CHAIN",
		status,
		chainId: 42161,
		txHash: TX_HASH,
		txLink: `https://explorer.li.fi/tx/${TX_HASH}`,
		startedAt: 1,
		doneAt: status === "DONE" ? 2 : undefined,
	};
}

describe("LI.FI bridge execution", () => {
	beforeEach(() => {
		featureState.createNewRoute = true;
		executionSecurity.activeWalletAddress = SOURCE_ADDRESS;
		executionSecurity.recoveryStorageAvailable = true;
		executionSecurity.clearPersistedBridgeExecution.mockReset();
		executionSecurity.persistCommittedBridgeExecution.mockReset();
		executionSecurity.persistCommittedBridgeExecution.mockReturnValue(true);
		sdk.convertQuoteToRoute.mockReset();
		sdk.executeRoute.mockReset();
		sdk.resumeRoute.mockReset();
		sdk.updateRouteExecution.mockReset();
		sdk.convertQuoteToRoute.mockReturnValue(createRoute());
	});

	it("blocks a new route at the final execution boundary when the gate is closed", async () => {
		featureState.createNewRoute = false;

		await expect(executeBridgeQuote(createQuote())).resolves.toBe("disabled");

		expect(sdk.convertQuoteToRoute).not.toHaveBeenCalled();
		expect(sdk.executeRoute).not.toHaveBeenCalled();
	});

	it("does not start when secure reload recovery storage is unavailable", async () => {
		executionSecurity.recoveryStorageAvailable = false;

		await expect(executeBridgeQuote(createQuote())).resolves.toBe("error");

		expect(sdk.convertQuoteToRoute).not.toHaveBeenCalled();
		expect(sdk.executeRoute).not.toHaveBeenCalled();
	});

	afterEach(() => {
		resetBridgeExecution();
		useBridgeExecutionState.setState(INITIAL_BRIDGE_STATE, true);
	});

	it("resumes the latest route after a transaction hash exists", async () => {
		const pendingRoute = createRoute([createCrossChainProcess("PENDING")]);
		const doneRoute = createRoute([createCrossChainProcess("DONE")], "DONE");
		sdk.executeRoute.mockImplementation(async (_route: RouteExtended, options: ExecutionOptions) => {
			options.updateRouteHook?.(pendingRoute);
			throw new Error("RPC disconnected");
		});
		sdk.resumeRoute.mockImplementation(async (route: RouteExtended, options: ExecutionOptions) => {
			expect(route.steps[0]?.execution?.process[0]?.txHash).toBe(TX_HASH);
			options.updateRouteHook?.(doneRoute);
			return doneRoute;
		});

		await expect(executeBridgeQuote(createQuote())).resolves.toBe("error");
		expect(resetBridgeExecution()).toBe(false);
		featureState.createNewRoute = false;
		await expect(retryBridgeExecution()).resolves.toBe("success");

		expect(sdk.convertQuoteToRoute).toHaveBeenCalledOnce();
		expect(sdk.executeRoute).toHaveBeenCalledOnce();
		expect(sdk.resumeRoute).toHaveBeenCalledOnce();
		expect(executionSecurity.persistCommittedBridgeExecution).toHaveBeenCalledWith(
			expect.objectContaining({
				route: pendingRoute,
				expectedToAmount: "997500",
			}),
		);
	});

	it("resumes a committed route when a later receiving process failed", async () => {
		const failedRoute = createRoute(
			[
				createCrossChainProcess("DONE"),
				{
					type: "RECEIVING_CHAIN",
					status: "FAILED",
					chainId: 1337,
					startedAt: 2,
				},
			],
			"FAILED",
		);
		const doneRoute = createRoute([createCrossChainProcess("DONE")], "DONE");
		sdk.executeRoute.mockImplementation(async (_route: RouteExtended, options: ExecutionOptions) => {
			options.updateRouteHook?.(failedRoute);
			throw new Error("Destination status unavailable");
		});
		sdk.resumeRoute.mockResolvedValue(doneRoute);

		await expect(executeBridgeQuote(createQuote())).resolves.toBe("error");
		featureState.createNewRoute = false;
		await expect(retryBridgeExecution()).resolves.toBe("success");

		expect(executionSecurity.persistCommittedBridgeExecution).toHaveBeenCalledWith(
			expect.objectContaining({ route: failedRoute }),
		);
		expect(sdk.resumeRoute).toHaveBeenCalledWith(
			expect.objectContaining({
				steps: [
					expect.objectContaining({
						execution: expect.objectContaining({
							status: "PENDING",
							process: expect.arrayContaining([
								expect.objectContaining({ type: "CROSS_CHAIN", status: "DONE", txHash: TX_HASH }),
							]),
						}),
					}),
				],
			}),
			expect.any(Object),
		);
	});

	it("tracks a failed source process by its existing transaction without passing a failed process to resumeRoute", async () => {
		const failedRoute = createRoute([createCrossChainProcess("FAILED")], "FAILED");
		const doneRoute = createRoute([createCrossChainProcess("DONE")], "DONE");
		sdk.executeRoute.mockImplementation(async (_route: RouteExtended, options: ExecutionOptions) => {
			options.updateRouteHook?.(failedRoute);
			throw new Error("Source receipt temporarily unavailable");
		});
		sdk.resumeRoute.mockImplementation(async (route: RouteExtended) => {
			expect(route).not.toBe(failedRoute);
			expect(route.steps[0]?.execution).toMatchObject({
				status: "PENDING",
				process: [
					expect.objectContaining({
						type: "CROSS_CHAIN",
						status: "PENDING",
						txHash: TX_HASH,
					}),
				],
			});
			return doneRoute;
		});

		await expect(executeBridgeQuote(createQuote())).resolves.toBe("error");
		expect(executionSecurity.persistCommittedBridgeExecution).toHaveBeenCalledWith(
			expect.objectContaining({ route: failedRoute }),
		);

		featureState.createNewRoute = false;
		await expect(retryBridgeExecution()).resolves.toBe("success");
		expect(sdk.resumeRoute).toHaveBeenCalledOnce();
	});

	it("rejects an update whose route fingerprint changes while wallet and source chain stay the same", async () => {
		const changedRoute = createRoute([createCrossChainProcess("PENDING")]);
		const step = changedRoute.steps[0];
		if (!step) throw new Error("Missing route step");
		step.tool = "different-tool";
		sdk.executeRoute.mockImplementation(async (_route: RouteExtended, options: ExecutionOptions) => {
			options.updateRouteHook?.(changedRoute);
			return changedRoute;
		});

		await expect(executeBridgeQuote(createQuote())).resolves.toBe("error");

		expect(useBridgeExecutionState.getState()).toMatchObject({
			status: "error",
			error: "LI.FI returned a bridge route that does not match the approved route.",
		});
		expect(executionSecurity.persistCommittedBridgeExecution).not.toHaveBeenCalled();
	});

	it("refuses to start when the actual wagmi signer does not own the route", async () => {
		executionSecurity.activeWalletAddress = "0x2222222222222222222222222222222222222222";

		await expect(executeBridgeQuote(createQuote())).resolves.toBe("error");

		expect(sdk.executeRoute).not.toHaveBeenCalled();
	});

	it("refuses to resume a committed route with a different actual wagmi signer", async () => {
		const pendingRoute = createRoute([createCrossChainProcess("PENDING")]);
		sdk.executeRoute.mockImplementation(async (_route: RouteExtended, options: ExecutionOptions) => {
			options.updateRouteHook?.(pendingRoute);
			throw new Error("RPC disconnected");
		});

		await expect(executeBridgeQuote(createQuote())).resolves.toBe("error");
		executionSecurity.activeWalletAddress = "0x2222222222222222222222222222222222222222";
		await expect(retryBridgeExecution()).resolves.toBe("error");

		expect(sdk.resumeRoute).not.toHaveBeenCalled();
		executionSecurity.activeWalletAddress = SOURCE_ADDRESS;
	});

	it("returns to confirmation after a rejection with no committed funds", async () => {
		sdk.executeRoute.mockRejectedValueOnce(new Error("User rejected the request"));
		sdk.executeRoute.mockImplementationOnce(async (_route: RouteExtended, options: ExecutionOptions) => {
			const doneRoute = createRoute([createCrossChainProcess("DONE")], "DONE");
			options.updateRouteHook?.(doneRoute);
			return doneRoute;
		});

		await expect(executeBridgeQuote(createQuote())).resolves.toBe("rejected");
		await expect(executeBridgeQuote(createQuote())).resolves.toBe("success");
		expect(sdk.executeRoute).toHaveBeenCalledTimes(2);
	});

	it("does not declare success when processes look done but the SDK execution is not done", async () => {
		const failedRoute = createRoute([createCrossChainProcess("DONE")], "PENDING");
		sdk.executeRoute.mockResolvedValue(failedRoute);

		await expect(executeBridgeQuote(createQuote())).resolves.toBe("error");

		expect(useBridgeExecutionState.getState()).toMatchObject({
			status: "error",
			error: "Request status could not be confirmed. Check balances and transfer history before retrying.",
		});
	});

	it("keeps retry rejection visible instead of silently returning to asset selection", async () => {
		sdk.executeRoute.mockRejectedValueOnce(new Error("RPC unavailable before submission"));
		sdk.resumeRoute.mockRejectedValueOnce(new Error("User rejected the request"));

		await expect(executeBridgeQuote(createQuote())).resolves.toBe("error");
		await expect(retryBridgeExecution()).resolves.toBe("rejected");

		expect(useBridgeExecutionState.getState()).toMatchObject({
			status: "error",
			error: "Transaction was rejected",
			canAbandon: true,
		});
	});

	it("does not resume an uncommitted attempt after the creation gate closes", async () => {
		sdk.executeRoute.mockRejectedValue(new Error("RPC unavailable before submission"));

		await expect(executeBridgeQuote(createQuote())).resolves.toBe("error");
		featureState.createNewRoute = false;
		await expect(retryBridgeExecution()).resolves.toBe("disabled");

		expect(sdk.resumeRoute).not.toHaveBeenCalled();
		expect(useBridgeExecutionState.getState().error).toBe(
			"Bridge creation is paused. This route did not submit a source transaction and cannot be retried.",
		);
	});

	it("moves an active route to background execution before the UI closes", async () => {
		let resolveExecution: ((route: RouteExtended) => void) | undefined;
		const executionPromise = new Promise<RouteExtended>((resolve) => {
			resolveExecution = resolve;
		});
		sdk.executeRoute.mockReturnValue(executionPromise);

		const outcomePromise = executeBridgeQuote(createQuote());
		featureState.createNewRoute = false;
		expect(continueBridgeInBackground()).toBe(true);
		expect(sdk.updateRouteExecution).toHaveBeenCalledWith(expect.objectContaining({ id: "route-1" }), {
			executeInBackground: true,
		});
		expect(restoreBridgeInForeground()).toBe(true);
		expect(sdk.updateRouteExecution).toHaveBeenLastCalledWith(expect.objectContaining({ id: "route-1" }), {
			executeInBackground: false,
		});

		const doneRoute = createRoute([createCrossChainProcess("DONE")], "DONE");
		resolveExecution?.(doneRoute);
		await expect(outcomePromise).resolves.toBe("success");
	});

	it("resumes a route that halted while the bridge UI was in the background", async () => {
		let resolveExecution: ((route: RouteExtended) => void) | undefined;
		const executionPromise = new Promise<RouteExtended>((resolve) => {
			resolveExecution = resolve;
		});
		sdk.executeRoute.mockReturnValue(executionPromise);
		sdk.resumeRoute.mockResolvedValue(createRoute([createCrossChainProcess("DONE")], "DONE"));

		const outcomePromise = executeBridgeQuote(createQuote());
		expect(continueBridgeInBackground()).toBe(true);
		resolveExecution?.(createRoute());
		await expect(outcomePromise).resolves.toBe("error");
		expect(useBridgeExecutionState.getState()).toMatchObject({ status: "error", isBackgrounded: true });

		expect(restoreBridgeInForeground()).toBe(true);
		await vi.waitFor(() => expect(sdk.resumeRoute).toHaveBeenCalledOnce());
		await vi.waitFor(() => expect(useBridgeExecutionState.getState().status).toBe("success"));
	});

	it("keeps genuine background execution errors on the manual retry path", async () => {
		let rejectExecution: ((error: Error) => void) | undefined;
		const executionPromise = new Promise<RouteExtended>((_resolve, reject) => {
			rejectExecution = reject;
		});
		sdk.executeRoute.mockReturnValue(executionPromise);

		const outcomePromise = executeBridgeQuote(createQuote());
		expect(continueBridgeInBackground()).toBe(true);
		rejectExecution?.(new Error("RPC unavailable before submission"));
		await expect(outcomePromise).resolves.toBe("error");

		expect(useBridgeExecutionState.getState()).toMatchObject({ status: "error", isBackgrounded: false });
		expect(restoreBridgeInForeground()).toBe(false);
		expect(sdk.resumeRoute).not.toHaveBeenCalled();
	});

	it("keeps tracking but warns and prevents safe-close claims when committed recovery cannot be written", async () => {
		let resolveExecution: ((route: RouteExtended) => void) | undefined;
		const pendingRoute = createRoute([createCrossChainProcess("PENDING")]);
		const executionPromise = new Promise<RouteExtended>((resolve) => {
			resolveExecution = resolve;
		});
		executionSecurity.persistCommittedBridgeExecution.mockReturnValue(false);
		sdk.executeRoute.mockImplementation(async (_route: RouteExtended, options: ExecutionOptions) => {
			options.updateRouteHook?.(pendingRoute);
			return executionPromise;
		});

		const outcomePromise = executeBridgeQuote(createQuote());
		expect(useBridgeExecutionState.getState()).toMatchObject({
			status: "executing",
			canAbandon: false,
			recoveryWarning: "Reload recovery could not be saved. Keep this tab open until the bridge completes.",
		});

		resolveExecution?.(createRoute([createCrossChainProcess("DONE")], "DONE"));
		await expect(outcomePromise).resolves.toBe("success");
	});

	it("does not abandon a route mutated with a transaction hash before an error", async () => {
		const route = createRoute();
		const step = route.steps[0];
		if (!step) throw new Error("Missing route step");
		sdk.convertQuoteToRoute.mockReturnValue(route);
		sdk.executeRoute.mockImplementation(async () => {
			step.execution = {
				status: "PENDING",
				startedAt: 1,
				process: [createCrossChainProcess("PENDING")],
			} as RouteExtended["steps"][number]["execution"];
			throw new Error("RPC disconnected");
		});
		sdk.resumeRoute.mockResolvedValue(createRoute([createCrossChainProcess("DONE")], "DONE"));

		await expect(executeBridgeQuote(createQuote())).resolves.toBe("error");
		expect(resetBridgeExecution()).toBe(false);
		expect(executionSecurity.persistCommittedBridgeExecution).toHaveBeenCalledWith(expect.objectContaining({ route }));
		await expect(retryBridgeExecution()).resolves.toBe("success");
	});
});
