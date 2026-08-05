// @vitest-environment jsdom

import { HttpRequestError } from "@nktkas/hyperliquid";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTrackedOrder } from "@/hooks/trade/use-tracked-order";
import { reserveOrderAssets, runWithOrderAssetLocks } from "@/lib/trade/order-asset-lock";
import { getPendingOrderActions, hasPendingOrderForAssets } from "@/stores/use-pending-order-store";

const mutateAsync = vi.fn();
const reset = vi.fn();
const CROSS_PERP_SUBMIT_OPTIONS = {
	riskContext: { marketKind: "perp", marginMode: "cross" },
} as const;
const ISOLATED_SUBMIT_OPTIONS = {
	riskContext: { marketKind: "perp", marginMode: "isolated" },
} as const;
const EXCLUSIVE_FILLED_SUBMIT_OPTIONS = {
	...ISOLATED_SUBMIT_OPTIONS,
	exclusiveAssetLock: true,
	confirmationMode: "filled",
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

function installExclusiveLockManager(): void {
	const queues = new Map<string, Promise<void>>();
	const busyCounts = new Map<string, number>();
	const manager = {
		async request<T>(
			name: string,
			options: LockOptions,
			callback: (lock: Lock | null) => T | PromiseLike<T>,
		): Promise<T> {
			if (options.ifAvailable) {
				if ((busyCounts.get(name) ?? 0) > 0) return callback(null);
				busyCounts.set(name, 1);
				try {
					return await callback({ name, mode: "exclusive" } as Lock);
				} finally {
					busyCounts.delete(name);
				}
			}

			const previous = queues.get(name) ?? Promise.resolve();
			let release = () => {};
			const current = new Promise<void>((resolve) => {
				release = resolve;
			});
			busyCounts.set(name, (busyCounts.get(name) ?? 0) + 1);
			queues.set(
				name,
				previous.then(() => current),
			);
			await previous;
			try {
				return await callback({ name, mode: "exclusive" } as Lock);
			} finally {
				release();
				const remaining = (busyCounts.get(name) ?? 1) - 1;
				if (remaining === 0) busyCounts.delete(name);
				else busyCounts.set(name, remaining);
			}
		},
	} as unknown as LockManager;
	Object.defineProperty(window.navigator, "locks", { configurable: true, value: manager });
}

describe("useTrackedOrder", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mutateAsync.mockReset();
		reset.mockReset();
		getPendingOrderActions().prune(Number.MAX_SAFE_INTEGER);
		window.localStorage.clear();
		installExclusiveLockManager();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		act(() => root.render(createElement(Probe)));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		hookValue = null;
		Object.defineProperty(window.navigator, "locks", { configurable: true, value: undefined });
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

	it("blocks an exclusive same-asset reservation created by another tab", async () => {
		await runWithOrderAssetLocks(
			{
				env: "Mainnet",
				owner: "0x1111111111111111111111111111111111111111",
				assetIds: [22],
			},
			async (lease) =>
				reserveOrderAssets(lease, {
					submissionId: "other-tab-submission",
					intentKey: "other-tab-intent",
					exclusiveAssetLock: true,
					isRiskReducing: true,
					createdAt: Date.now(),
				}),
		);

		let result: Awaited<ReturnType<NonNullable<typeof hookValue>["submitOrder"]>> | undefined;
		await act(async () => {
			result = await hookValue?.submitOrder(createParams(22), CROSS_PERP_SUBMIT_OPTIONS);
		});

		expect(result?.state).toBe("blocked");
		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it("fails before the SDK call when pending submission persistence cannot be verified", async () => {
		const nativeSetItem = Storage.prototype.setItem;
		const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
			if (key.startsWith("hl-pending-orders-v1:submission:")) return;
			return nativeSetItem.call(this, key, value);
		});
		if (!hookValue) throw new Error("Expected tracked order hook");

		try {
			await act(async () => {
				await expect(hookValue?.submitOrder(createParams(25), CROSS_PERP_SUBMIT_OPTIONS)).rejects.toThrow(
					"Safe order coordination across tabs is unavailable in this browser.",
				);
			});
		} finally {
			setItemSpy.mockRestore();
		}

		expect(mutateAsync).not.toHaveBeenCalled();
		expect(hasPendingOrderForAssets("Mainnet", "0x1111111111111111111111111111111111111111", [25])).toBe(false);
	});

	it("rejects immediately while another tab is submitting the same asset", async () => {
		let releaseOtherTab = () => {};
		let markOtherTabEntered = () => {};
		const otherTabGate = new Promise<void>((resolve) => {
			releaseOtherTab = resolve;
		});
		const otherTabEntered = new Promise<void>((resolve) => {
			markOtherTabEntered = resolve;
		});
		const otherTab = runWithOrderAssetLocks(
			{
				env: "Mainnet",
				owner: "0x1111111111111111111111111111111111111111",
				assetIds: [23],
			},
			async () => {
				markOtherTabEntered();
				await otherTabGate;
			},
		);
		await otherTabEntered;

		let result: Awaited<ReturnType<NonNullable<typeof hookValue>["submitOrder"]>> | undefined;
		await act(async () => {
			result = await hookValue?.submitOrder(createParams(23), CROSS_PERP_SUBMIT_OPTIONS);
		});

		expect(result?.state).toBe("blocked");
		expect(mutateAsync).not.toHaveBeenCalled();
		releaseOtherTab();
		await otherTab;
	});

	it("blocks a same-hook double submit and reports coordination as pending", async () => {
		let resolveRequest: ((value: unknown) => void) | undefined;
		const request = new Promise<unknown>((resolve) => {
			resolveRequest = resolve;
		});
		mutateAsync.mockReturnValueOnce(request);
		if (!hookValue) throw new Error("Expected tracked order hook");

		let firstPromise: ReturnType<typeof hookValue.submitOrder> | undefined;
		await act(async () => {
			firstPromise = hookValue?.submitOrder(createParams(24), CROSS_PERP_SUBMIT_OPTIONS);
			await Promise.resolve();
		});
		expect(hookValue?.isPending).toBe(true);

		const duplicate = await hookValue.submitOrder(createParams(24), CROSS_PERP_SUBMIT_OPTIONS);
		expect(duplicate).toEqual({ state: "blocked" });
		expect(mutateAsync).toHaveBeenCalledTimes(1);

		if (!resolveRequest || !firstPromise) throw new Error("Expected pending exchange request");
		resolveRequest({
			status: "ok",
			response: { type: "order", data: { statuses: [{ filled: { totalSz: "1", avgPx: "10", oid: 24 } }] } },
		});
		await act(async () => {
			await firstPromise;
		});
		expect(hookValue?.isPending).toBe(false);
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

	it("reconciles a same-length response whose child status is malformed", async () => {
		mutateAsync.mockResolvedValueOnce({
			status: "ok",
			response: { type: "order", data: { statuses: [{}] } },
		});
		let result: Awaited<ReturnType<NonNullable<typeof hookValue>["submitOrder"]>> | undefined;
		await act(async () => {
			result = await hookValue?.submitOrder(createParams(29), CROSS_PERP_SUBMIT_OPTIONS);
		});

		expect(result?.state).toBe("reconciling");
		expect(hasPendingOrderForAssets("Mainnet", "0x1111111111111111111111111111111111111111", [29])).toBe(true);
	});

	it("persists the cloid before awaiting the exchange response", async () => {
		let resolveRequest: ((value: unknown) => void) | undefined;
		const request = new Promise<unknown>((resolve) => {
			resolveRequest = resolve;
		});
		mutateAsync.mockReturnValueOnce(request);
		if (!hookValue) throw new Error("Expected tracked order hook");
		const trackedOrder = hookValue;

		let submitPromise!: ReturnType<typeof trackedOrder.submitOrder>;
		act(() => {
			submitPromise = trackedOrder.submitOrder(createParams(10), CROSS_PERP_SUBMIT_OPTIONS);
		});
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

	it("keeps a complete resting response pending in filled confirmation mode", async () => {
		mutateAsync.mockResolvedValueOnce({
			status: "ok",
			response: { type: "order", data: { statuses: [{ resting: { oid: 11 } }] } },
		});
		let result: Awaited<ReturnType<NonNullable<typeof hookValue>["submitOrder"]>> | undefined;
		await act(async () => {
			result = await hookValue?.submitOrder(createParams(20, 1, true), EXCLUSIVE_FILLED_SUBMIT_OPTIONS);
		});

		expect(result?.state).toBe("reconciling");
		expect(hasPendingOrderForAssets("Mainnet", "0x1111111111111111111111111111111111111111", [20])).toBe(true);
	});

	it("confirms and releases a filled response in filled confirmation mode", async () => {
		mutateAsync.mockResolvedValueOnce({
			status: "ok",
			response: { type: "order", data: { statuses: [{ filled: { totalSz: "1", avgPx: "10", oid: 12 } }] } },
		});
		let result: Awaited<ReturnType<NonNullable<typeof hookValue>["submitOrder"]>> | undefined;
		await act(async () => {
			result = await hookValue?.submitOrder(createParams(21, 1, true), EXCLUSIVE_FILLED_SUBMIT_OPTIONS);
		});

		expect(result?.state).toBe("confirmed");
		expect(hasPendingOrderForAssets("Mainnet", "0x1111111111111111111111111111111111111111", [21])).toBe(false);
	});

	it("rejects an incomplete filled size without leaving the asset locked", async () => {
		mutateAsync.mockResolvedValueOnce({
			status: "ok",
			response: { type: "order", data: { statuses: [{ filled: { totalSz: "0.4", avgPx: "10", oid: 13 } }] } },
		});
		if (!hookValue) throw new Error("Expected tracked order hook");

		await act(async () => {
			await expect(
				hookValue?.submitOrder(createParams(26, 1, true), EXCLUSIVE_FILLED_SUBMIT_OPTIONS),
			).rejects.toMatchObject({
				name: "OrderBatchResolutionError",
				resolution: { status: "rejected", acceptedCount: 0, rejectedCount: 1, totalCount: 1 },
			});
		});

		expect(hasPendingOrderForAssets("Mainnet", "0x1111111111111111111111111111111111111111", [26])).toBe(false);
	});

	it("keeps a mixed error and non-terminal child pending in filled confirmation mode", async () => {
		mutateAsync.mockResolvedValueOnce({
			status: "ok",
			response: {
				type: "order",
				data: { statuses: [{ resting: { oid: 14 } }, { error: "Rejected" }] },
			},
		});
		let result: Awaited<ReturnType<NonNullable<typeof hookValue>["submitOrder"]>> | undefined;
		await act(async () => {
			result = await hookValue?.submitOrder(createParams(27, 2, true), EXCLUSIVE_FILLED_SUBMIT_OPTIONS);
		});

		expect(result?.state).toBe("reconciling");
		expect(hasPendingOrderForAssets("Mainnet", "0x1111111111111111111111111111111111111111", [27])).toBe(true);
	});

	it("retains a fully filled response when the caller cannot confirm final account state", async () => {
		mutateAsync.mockResolvedValueOnce({
			status: "ok",
			response: { type: "order", data: { statuses: [{ filled: { totalSz: "1", avgPx: "10", oid: 15 } }] } },
		});
		const finalConfirmation = vi.fn().mockResolvedValue(false);
		let result: Awaited<ReturnType<NonNullable<typeof hookValue>["submitOrder"]>> | undefined;
		await act(async () => {
			result = await hookValue?.submitOrder(createParams(28, 1, true), {
				...EXCLUSIVE_FILLED_SUBMIT_OPTIONS,
				finalConfirmation,
			});
		});

		expect(finalConfirmation).toHaveBeenCalledOnce();
		expect(result?.state).toBe("reconciling");
		expect(hasPendingOrderForAssets("Mainnet", "0x1111111111111111111111111111111111111111", [28])).toBe(true);
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

	it("blocks an exclusive submission behind any ordinary pending order for the asset", async () => {
		mutateAsync.mockRejectedValueOnce(new HttpRequestError({ detail: "Request timed out after 10000 ms" }));
		if (!hookValue) throw new Error("Expected tracked order hook");

		await act(async () => {
			await hookValue?.submitOrder(createParams(16), CROSS_PERP_SUBMIT_OPTIONS);
		});
		let exclusiveResult: Awaited<ReturnType<typeof hookValue.submitOrder>> | undefined;
		await act(async () => {
			exclusiveResult = await hookValue?.submitOrder(createParams(16, 1, true), EXCLUSIVE_FILLED_SUBMIT_OPTIONS);
		});

		expect(exclusiveResult?.state).toBe("blocked");
		expect(mutateAsync).toHaveBeenCalledTimes(1);
	});

	it("blocks a later reduce-only submission behind an exclusive pending order for the asset", async () => {
		mutateAsync.mockRejectedValueOnce(new HttpRequestError({ detail: "Request timed out after 10000 ms" }));
		if (!hookValue) throw new Error("Expected tracked order hook");

		await act(async () => {
			await hookValue?.submitOrder(createParams(17, 1, true), EXCLUSIVE_FILLED_SUBMIT_OPTIONS);
		});
		const differentReduceOnlyParams = createParams(17, 1, true);
		const differentReduceOnlyOrder = differentReduceOnlyParams.orders[0];
		if (!differentReduceOnlyOrder) throw new Error("Expected a reduce-only order");
		differentReduceOnlyOrder.p = "11";
		let reduceOnlyResult: Awaited<ReturnType<typeof hookValue.submitOrder>> | undefined;
		await act(async () => {
			reduceOnlyResult = await hookValue?.submitOrder(differentReduceOnlyParams, ISOLATED_SUBMIT_OPTIONS);
		});

		expect(reduceOnlyResult?.state).toBe("blocked");
		expect(mutateAsync).toHaveBeenCalledTimes(1);
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
