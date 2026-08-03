// @vitest-environment jsdom

import { HttpRequestError } from "@nktkas/hyperliquid";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTrackedOrder } from "@/hooks/trade/use-tracked-order";
import { getPendingOrderActions, hasPendingOrderForAssets } from "@/stores/use-pending-order-store";

const mutateAsync = vi.fn();
const reset = vi.fn();
const CROSS_PERP_SUBMIT_OPTIONS = {
	riskContext: { marketKind: "perp", marginMode: "cross" },
} as const;
const ISOLATED_SUBMIT_OPTIONS = {
	riskContext: { marketKind: "perp", marginMode: "isolated" },
} as const;

vi.mock("@/lib/hyperliquid", () => ({
	useExchange: () => ({ mutateAsync, isPending: false, error: null, reset }),
	useHyperliquid: () => ({ clientKey: "0x1111111111111111111111111111111111111111", env: "Mainnet" }),
}));

let hookValue: ReturnType<typeof useTrackedOrder> | null = null;

function Probe() {
	hookValue = useTrackedOrder();
	return null;
}

function createParams(assetId = 0, count = 1, reduceOnly = false) {
	return {
		grouping: "na" as const,
		orders: Array.from({ length: count }, () => ({
			a: assetId,
			b: true,
			p: "10",
			r: reduceOnly,
			s: "1",
			t: { limit: { tif: "Gtc" as const } },
		})),
	};
}

function createForeignApiRequestError(response: unknown): Error & { response: unknown } {
	return Object.assign(new Error("Exchange rejected the request"), { name: "ApiRequestError", response });
}

describe("useTrackedOrder", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mutateAsync.mockReset();
		reset.mockReset();
		getPendingOrderActions().prune(Number.MAX_SAFE_INTEGER);
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		act(() => root.render(createElement(Probe)));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		hookValue = null;
	});

	it("marks an HTTP timeout as reconciling and blocks a duplicate asset submission", async () => {
		mutateAsync.mockRejectedValueOnce(new HttpRequestError({ detail: "Request timed out after 10000 ms" }));
		const params = createParams(7);
		let firstResult: Awaited<ReturnType<NonNullable<typeof hookValue>["submitOrder"]>> | undefined;
		await act(async () => {
			firstResult = await hookValue?.submitOrder(params, CROSS_PERP_SUBMIT_OPTIONS);
		});

		expect(firstResult?.state).toBe("reconciling");
		expect(hasPendingOrderForAssets("Mainnet", "0x1111111111111111111111111111111111111111", [7])).toBe(true);
		expect(mutateAsync).toHaveBeenCalledTimes(1);
		expect(mutateAsync.mock.calls[0]?.[0].orders[0].c).toMatch(/^0x[a-f0-9]{32}$/);

		let secondResult: Awaited<ReturnType<NonNullable<typeof hookValue>["submitOrder"]>> | undefined;
		await act(async () => {
			secondResult = await hookValue?.submitOrder(params, CROSS_PERP_SUBMIT_OPTIONS);
		});
		expect(secondResult?.state).toBe("blocked");
		expect(mutateAsync).toHaveBeenCalledTimes(1);
	});

	it("accepts a complete exchange response without creating reconciliation state", async () => {
		mutateAsync.mockResolvedValueOnce({
			status: "ok",
			response: { type: "order", data: { statuses: [{ filled: { totalSz: "1", avgPx: "10", oid: 1 } }] } },
		});
		let result: Awaited<ReturnType<NonNullable<typeof hookValue>["submitOrder"]>> | undefined;
		await act(async () => {
			result = await hookValue?.submitOrder(createParams(8), CROSS_PERP_SUBMIT_OPTIONS);
		});

		expect(result?.state).toBe("confirmed");
		expect(hasPendingOrderForAssets("Mainnet", "0x1111111111111111111111111111111111111111", [8])).toBe(false);
	});

	it("persists the cloid before awaiting the exchange response", async () => {
		let resolveRequest: ((value: unknown) => void) | undefined;
		const request = new Promise<unknown>((resolve) => {
			resolveRequest = resolve;
		});
		mutateAsync.mockReturnValueOnce(request);
		if (!hookValue) throw new Error("Expected tracked order hook");

		const submitPromise = hookValue.submitOrder(createParams(10), CROSS_PERP_SUBMIT_OPTIONS);
		expect(hasPendingOrderForAssets("Mainnet", "0x1111111111111111111111111111111111111111", [10])).toBe(true);

		if (!resolveRequest) throw new Error("Expected pending exchange request");
		resolveRequest({
			status: "ok",
			response: { type: "order", data: { statuses: [{ resting: { oid: 1 } }] } },
		});
		let result: Awaited<typeof submitPromise> | undefined;
		await act(async () => {
			result = await submitPromise;
		});

		expect(result?.state).toBe("confirmed");
		expect(hasPendingOrderForAssets("Mainnet", "0x1111111111111111111111111111111111111111", [10])).toBe(false);
	});

	it("reconciles a batch when the response omits any child status", async () => {
		mutateAsync.mockResolvedValueOnce({
			status: "ok",
			response: { type: "order", data: { statuses: ["waitingForFill"] } },
		});
		let result: Awaited<ReturnType<NonNullable<typeof hookValue>["submitOrder"]>> | undefined;
		await act(async () => {
			result = await hookValue?.submitOrder(createParams(9, 2), CROSS_PERP_SUBMIT_OPTIONS);
		});

		expect(result?.state).toBe("reconciling");
		expect(mutateAsync.mock.calls[0]?.[0].orders).toHaveLength(2);
		expect(new Set(mutateAsync.mock.calls[0]?.[0].orders.map((order: { c: string }) => order.c)).size).toBe(2);
	});

	it("surfaces a definitive HTTP rejection without leaving the market blocked", async () => {
		const error = new HttpRequestError({ response: new Response("bad request", { status: 400 }) });
		mutateAsync.mockRejectedValueOnce(error);
		if (!hookValue) throw new Error("Expected tracked order hook");

		await act(async () => {
			await expect(hookValue?.submitOrder(createParams(11), CROSS_PERP_SUBMIT_OPTIONS)).rejects.toBe(error);
		});

		expect(hasPendingOrderForAssets("Mainnet", "0x1111111111111111111111111111111111111111", [11])).toBe(false);
	});

	it("treats HTTP 429 as a definitive rejection without leaving the market blocked", async () => {
		const error = new HttpRequestError({ response: new Response("rate limited", { status: 429 }) });
		mutateAsync.mockRejectedValueOnce(error);
		if (!hookValue) throw new Error("Expected tracked order hook");

		await act(async () => {
			await expect(hookValue?.submitOrder(createParams(14), CROSS_PERP_SUBMIT_OPTIONS)).rejects.toBe(error);
		});

		expect(hasPendingOrderForAssets("Mainnet", "0x1111111111111111111111111111111111111111", [14])).toBe(false);
	});

	it("allows a different reduce-only intent while an entry order for the asset is unresolved", async () => {
		mutateAsync
			.mockRejectedValueOnce(new HttpRequestError({ detail: "Request timed out after 10000 ms" }))
			.mockResolvedValueOnce({
				status: "ok",
				response: { type: "order", data: { statuses: [{ filled: { totalSz: "1", avgPx: "10", oid: 2 } }] } },
			});
		if (!hookValue) throw new Error("Expected tracked order hook");

		await act(async () => {
			await hookValue?.submitOrder(createParams(15), CROSS_PERP_SUBMIT_OPTIONS);
		});
		let closeResult: Awaited<ReturnType<typeof hookValue.submitOrder>> | undefined;
		await act(async () => {
			closeResult = await hookValue?.submitOrder(createParams(15, 1, true), ISOLATED_SUBMIT_OPTIONS);
		});

		expect(closeResult?.state).toBe("confirmed");
		expect(mutateAsync).toHaveBeenCalledTimes(2);
	});

	it("reports mixed batch statuses as partial without leaving reconciliation state", async () => {
		const response = {
			status: "ok",
			response: {
				type: "order",
				data: { statuses: [{ resting: { oid: 1 } }, { error: "Order must have minimum value of $10." }] },
			},
		};
		mutateAsync.mockRejectedValueOnce(createForeignApiRequestError(response));
		if (!hookValue) throw new Error("Expected tracked order hook");

		let caught: unknown;
		await act(async () => {
			try {
				await hookValue?.submitOrder(createParams(12, 2), CROSS_PERP_SUBMIT_OPTIONS);
			} catch (error) {
				caught = error;
			}
		});

		expect(caught).toMatchObject({
			name: "OrderBatchResolutionError",
			resolution: { status: "partial", acceptedCount: 1, rejectedCount: 1, totalCount: 2 },
		});
		expect(hasPendingOrderForAssets("Mainnet", "0x1111111111111111111111111111111111111111", [12])).toBe(false);
	});

	it("reports a single batch prevalidation error as a definitive rejection", async () => {
		const response = {
			status: "ok",
			response: { type: "order", data: { statuses: [{ error: "Invalid order request" }] } },
		};
		mutateAsync.mockRejectedValueOnce(createForeignApiRequestError(response));
		if (!hookValue) throw new Error("Expected tracked order hook");

		await act(async () => {
			await expect(hookValue?.submitOrder(createParams(13, 3), CROSS_PERP_SUBMIT_OPTIONS)).rejects.toMatchObject({
				resolution: { status: "rejected", acceptedCount: 0, rejectedCount: 3, totalCount: 3 },
			});
		});

		expect(hasPendingOrderForAssets("Mainnet", "0x1111111111111111111111111111111111111111", [13])).toBe(false);
	});

	it("submits a non-reduce-only order for a forced-isolated HIP-3 market", async () => {
		mutateAsync.mockResolvedValueOnce({
			status: "ok",
			response: { type: "order", data: { statuses: [{ filled: { totalSz: "1", avgPx: "10", oid: 3 } }] } },
		});
		if (!hookValue) throw new Error("Expected tracked order hook");

		let result: Awaited<ReturnType<typeof hookValue.submitOrder>> | undefined;
		await act(async () => {
			result = await hookValue?.submitOrder(createParams(120_031), ISOLATED_SUBMIT_OPTIONS);
		});

		expect(result?.state).toBe("confirmed");
		expect(mutateAsync).toHaveBeenCalledOnce();
		expect(mutateAsync.mock.calls[0]?.[0].orders[0]).toMatchObject({ a: 120_031, r: false });
		expect(hasPendingOrderForAssets("Mainnet", "0x1111111111111111111111111111111111111111", [120_031])).toBe(false);
	});

	it("rejects a caller that labels a perp asset as spot", async () => {
		if (!hookValue) throw new Error("Expected tracked order hook");

		await act(async () => {
			await expect(hookValue?.submitOrder(createParams(18), { riskContext: { marketKind: "spot" } })).rejects.toThrow(
				"Order market context does not match the submitted asset.",
			);
		});

		expect(mutateAsync).not.toHaveBeenCalled();
		expect(hasPendingOrderForAssets("Mainnet", "0x1111111111111111111111111111111111111111", [18])).toBe(false);
	});
});
