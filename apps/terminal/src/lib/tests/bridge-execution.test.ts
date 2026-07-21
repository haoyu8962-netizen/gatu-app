import type { RouteExtended } from "@lifi/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeQuote } from "@/lib/lifi/use-quote";

const sdk = vi.hoisted(() => ({
	convertQuoteToRoute: vi.fn(),
	executeRoute: vi.fn(),
	resumeRoute: vi.fn(),
	updateRouteExecution: vi.fn(),
}));

vi.mock("@lifi/sdk", () => sdk);

import {
	continueBridgeInBackground,
	executeBridgeQuote,
	resetBridgeExecution,
	retryBridgeExecution,
} from "@/lib/lifi/use-bridge";

interface ExecutionOptions {
	updateRouteHook?: (route: RouteExtended) => void;
}

const SOURCE_ADDRESS = "0x1111111111111111111111111111111111111111";
const TX_HASH = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function createRoute(
	process: Array<Record<string, unknown>> = [],
	executionStatus: "PENDING" | "DONE" = "PENDING",
): RouteExtended {
	return {
		id: "route-1",
		steps: [
			{
				id: "step-1",
				action: {
					fromAddress: SOURCE_ADDRESS,
					fromChainId: 42161,
					toChainId: 1337,
					fromToken: { symbol: "USDC" },
				},
				execution:
					process.length > 0
						? {
								status: executionStatus,
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

function createCrossChainProcess(status: "PENDING" | "DONE") {
	return {
		type: "CROSS_CHAIN",
		status,
		txHash: TX_HASH,
		txLink: `https://explorer.li.fi/tx/${TX_HASH}`,
		startedAt: 1,
		doneAt: status === "DONE" ? 2 : undefined,
	};
}

describe("LI.FI bridge execution", () => {
	beforeEach(() => {
		sdk.convertQuoteToRoute.mockReset();
		sdk.executeRoute.mockReset();
		sdk.resumeRoute.mockReset();
		sdk.updateRouteExecution.mockReset();
		sdk.convertQuoteToRoute.mockReturnValue(createRoute());
	});

	afterEach(() => {
		expect(resetBridgeExecution()).toBe(true);
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
		await expect(retryBridgeExecution()).resolves.toBe("success");

		expect(sdk.convertQuoteToRoute).toHaveBeenCalledOnce();
		expect(sdk.executeRoute).toHaveBeenCalledOnce();
		expect(sdk.resumeRoute).toHaveBeenCalledOnce();
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

	it("moves an active route to background execution before the UI closes", async () => {
		let resolveExecution: ((route: RouteExtended) => void) | undefined;
		const executionPromise = new Promise<RouteExtended>((resolve) => {
			resolveExecution = resolve;
		});
		sdk.executeRoute.mockReturnValue(executionPromise);

		const outcomePromise = executeBridgeQuote(createQuote());
		expect(continueBridgeInBackground()).toBe(true);
		expect(sdk.updateRouteExecution).toHaveBeenCalledWith(expect.objectContaining({ id: "route-1" }), {
			executeInBackground: true,
		});

		const doneRoute = createRoute([createCrossChainProcess("DONE")], "DONE");
		resolveExecution?.(doneRoute);
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
				process: [createCrossChainProcess("PENDING")],
			} as RouteExtended["steps"][number]["execution"];
			throw new Error("RPC disconnected");
		});
		sdk.resumeRoute.mockResolvedValue(createRoute([createCrossChainProcess("DONE")], "DONE"));

		await expect(executeBridgeQuote(createQuote())).resolves.toBe("error");
		expect(resetBridgeExecution()).toBe(false);
		await expect(retryBridgeExecution()).resolves.toBe("success");
	});
});
