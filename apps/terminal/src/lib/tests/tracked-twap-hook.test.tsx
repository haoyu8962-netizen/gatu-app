// @vitest-environment jsdom

import { HttpRequestError } from "@nktkas/hyperliquid";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTrackedTwapOrder } from "@/hooks/trade/use-tracked-twap-order";
import {
	clearOrderAssetReservations,
	getOrderAssetReservationState,
	reserveOrderAssets,
	runWithOrderAssetLocks,
} from "@/lib/trade/order-asset-lock";
import { getActiveTwapReservationId } from "@/lib/trade/twap-order-asset-reservation";
import { getPendingOrderActions } from "@/stores/use-pending-order-store";
import { getPendingTwapActions, hasPendingTwapForAsset } from "@/stores/use-pending-twap-store";

const USER = "0x1111111111111111111111111111111111111111" as const;
const CROSS_PERP_RISK_CONTEXT = { marketKind: "perp", marginMode: "cross" } as const;
const ISOLATED_RISK_CONTEXT = { marketKind: "perp", marginMode: "isolated" } as const;
const mocks = vi.hoisted(() => ({
	mutateAsync: vi.fn(),
	reset: vi.fn(),
	activeStatus: "active",
	activeStale: false,
	historyStatus: "active",
	historyStale: false,
}));

vi.mock("@/lib/hyperliquid", () => ({
	useExchange: () => ({ mutateAsync: mocks.mutateAsync, isPending: false, error: null, reset: mocks.reset }),
	useHyperliquid: () => ({ clientKey: USER, env: "Mainnet" }),
	useSubscription: (method: string) => {
		if (method === "twapStates") {
			return {
				status: mocks.activeStatus,
				data: { dex: "", user: USER, states: [] },
				error: null,
				isStale: mocks.activeStale,
			};
		}
		return {
			status: mocks.historyStatus,
			data: { isSnapshot: true, user: USER, history: [] },
			error: null,
			isStale: mocks.historyStale,
		};
	},
}));

let hookValue: ReturnType<typeof useTrackedTwapOrder> | null = null;

function Probe() {
	hookValue = useTrackedTwapOrder();
	return null;
}

function createParams(assetId = 7, reduceOnly = false) {
	return {
		twap: {
			a: assetId,
			b: true,
			s: "1.25",
			r: reduceOnly,
			m: 30,
			t: true,
		},
	};
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

describe("useTrackedTwapOrder", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.mutateAsync.mockReset();
		mocks.reset.mockReset();
		mocks.activeStatus = "active";
		mocks.activeStale = false;
		mocks.historyStatus = "active";
		mocks.historyStale = false;
		getPendingTwapActions().prune(Number.MAX_SAFE_INTEGER);
		getPendingOrderActions().prune(Number.MAX_SAFE_INTEGER);
		window.localStorage.clear();
		installExclusiveLockManager();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		act(() => root.render(createElement(Probe)));
	});

	it("blocks a TWAP when a persisted ordinary order already targets the asset", async () => {
		getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "other-tab-order",
			children: [{ assetId: 19, cloid: "0x00000000000000000000000000000019" }],
		});
		if (!hookValue) throw new Error("Expected tracked TWAP hook");

		let result: Awaited<ReturnType<typeof hookValue.submitTwap>> | undefined;
		await act(async () => {
			result = await hookValue?.submitTwap(createParams(19), {
				coin: "BTC",
				riskContext: CROSS_PERP_RISK_CONTEXT,
			});
		});

		expect(result).toEqual({ state: "blocked", reason: "pending" });
		expect(mocks.mutateAsync).not.toHaveBeenCalled();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		hookValue = null;
		Object.defineProperty(window.navigator, "locks", { configurable: true, value: undefined });
		vi.restoreAllMocks();
	});

	it("marks an HTTP timeout as reconciling and blocks another TWAP for the same asset", async () => {
		mocks.mutateAsync.mockRejectedValueOnce(new HttpRequestError({ detail: "Request timed out after 10000 ms" }));
		if (!hookValue) throw new Error("Expected tracked TWAP hook");

		let firstResult: Awaited<ReturnType<typeof hookValue.submitTwap>> | undefined;
		await act(async () => {
			firstResult = await hookValue?.submitTwap(createParams(), {
				coin: "xyz:GOLD",
				riskContext: CROSS_PERP_RISK_CONTEXT,
			});
		});

		expect(firstResult?.state).toBe("reconciling");
		expect(hasPendingTwapForAsset("Mainnet", USER, 7)).toBe(true);
		expect(mocks.mutateAsync).toHaveBeenCalledWith(createParams());

		let secondResult: Awaited<ReturnType<typeof hookValue.submitTwap>> | undefined;
		await act(async () => {
			secondResult = await hookValue?.submitTwap(createParams(), {
				coin: "xyz:GOLD",
				riskContext: CROSS_PERP_RISK_CONTEXT,
			});
		});
		expect(secondResult).toEqual({ state: "blocked", reason: "pending" });
		expect(mocks.mutateAsync).toHaveBeenCalledTimes(1);
	});

	it("does not submit until both reconciliation snapshots are fresh", async () => {
		mocks.historyStatus = "subscribing";
		act(() => root.render(createElement(Probe)));
		if (!hookValue) throw new Error("Expected tracked TWAP hook");

		let result: Awaited<ReturnType<typeof hookValue.submitTwap>> | undefined;
		await act(async () => {
			result = await hookValue?.submitTwap(createParams(12), {
				coin: "BTC",
				riskContext: CROSS_PERP_RISK_CONTEXT,
			});
		});

		expect(result).toEqual({ state: "blocked", reason: "stateUnavailable" });
		expect(mocks.mutateAsync).not.toHaveBeenCalled();
		expect(hasPendingTwapForAsset("Mainnet", USER, 12)).toBe(false);
	});

	it("fails before the SDK call when pending TWAP persistence cannot be verified", async () => {
		const nativeSetItem = Storage.prototype.setItem;
		const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
			if (key.startsWith("hl-pending-twaps-v1:submission:")) return;
			return nativeSetItem.call(this, key, value);
		});
		if (!hookValue) throw new Error("Expected tracked TWAP hook");

		try {
			await act(async () => {
				await expect(
					hookValue?.submitTwap(createParams(14), {
						coin: "BTC",
						riskContext: CROSS_PERP_RISK_CONTEXT,
					}),
				).rejects.toThrow("Safe order coordination across tabs is unavailable in this browser.");
			});
		} finally {
			setItemSpy.mockRestore();
		}

		expect(mocks.mutateAsync).not.toHaveBeenCalled();
		expect(hasPendingTwapForAsset("Mainnet", USER, 14)).toBe(false);
	});

	it("removes reconciliation state after an explicit exchange success", async () => {
		mocks.mutateAsync.mockResolvedValueOnce({
			status: "ok",
			response: { type: "twapOrder", data: { status: { running: { twapId: 42 } } } },
		});
		if (!hookValue) throw new Error("Expected tracked TWAP hook");

		let result: Awaited<ReturnType<typeof hookValue.submitTwap>> | undefined;
		await act(async () => {
			result = await hookValue?.submitTwap(createParams(8), {
				coin: "ETH",
				riskContext: CROSS_PERP_RISK_CONTEXT,
			});
		});

		expect(result?.state).toBe("confirmed");
		expect(hasPendingTwapForAsset("Mainnet", USER, 8)).toBe(false);
	});

	it("persists the TWAP intent before awaiting the exchange response", async () => {
		let resolveRequest: ((value: unknown) => void) | undefined;
		const request = new Promise<unknown>((resolve) => {
			resolveRequest = resolve;
		});
		mocks.mutateAsync.mockReturnValueOnce(request);
		if (!hookValue) throw new Error("Expected tracked TWAP hook");

		let submitPromise: ReturnType<typeof hookValue.submitTwap> | undefined;
		act(() => {
			submitPromise = hookValue?.submitTwap(createParams(9), {
				coin: "BTC",
				riskContext: CROSS_PERP_RISK_CONTEXT,
			});
		});
		expect(hasPendingTwapForAsset("Mainnet", USER, 9)).toBe(true);

		if (!resolveRequest) throw new Error("Expected pending exchange request");
		resolveRequest({ status: "ok", response: { type: "twapOrder", data: { status: { running: { twapId: 43 } } } } });
		await act(async () => {
			await submitPromise;
		});
		expect(hasPendingTwapForAsset("Mainnet", USER, 9)).toBe(false);
	});

	it("surfaces a definitive HTTP rejection without leaving the asset blocked", async () => {
		const error = new HttpRequestError({ response: new Response("bad request", { status: 400 }) });
		mocks.mutateAsync.mockRejectedValueOnce(error);
		if (!hookValue) throw new Error("Expected tracked TWAP hook");

		await act(async () => {
			await expect(
				hookValue?.submitTwap(createParams(10), { coin: "SOL", riskContext: CROSS_PERP_RISK_CONTEXT }),
			).rejects.toBe(error);
		});

		expect(hasPendingTwapForAsset("Mainnet", USER, 10)).toBe(false);
	});

	it("treats HTTP 429 as a definitive rejection without leaving the asset blocked", async () => {
		const error = new HttpRequestError({ response: new Response("rate limited", { status: 429 }) });
		mocks.mutateAsync.mockRejectedValueOnce(error);
		if (!hookValue) throw new Error("Expected tracked TWAP hook");

		await act(async () => {
			await expect(
				hookValue?.submitTwap(createParams(11), { coin: "HYPE", riskContext: CROSS_PERP_RISK_CONTEXT }),
			).rejects.toBe(error);
		});

		expect(hasPendingTwapForAsset("Mainnet", USER, 11)).toBe(false);
	});

	it("submits a non-reduce-only TWAP for a forced-isolated HIP-3 market", async () => {
		mocks.mutateAsync.mockResolvedValueOnce({
			status: "ok",
			response: { type: "twapOrder", data: { status: { running: { twapId: 44 } } } },
		});
		if (!hookValue) throw new Error("Expected tracked TWAP hook");

		let result: Awaited<ReturnType<typeof hookValue.submitTwap>> | undefined;
		await act(async () => {
			result = await hookValue?.submitTwap(createParams(120_031), {
				coin: "xyz:SMSN",
				riskContext: ISOLATED_RISK_CONTEXT,
			});
		});

		expect(result?.state).toBe("confirmed");
		expect(mocks.mutateAsync).toHaveBeenCalledWith(createParams(120_031));
		expect(hasPendingTwapForAsset("Mainnet", USER, 120_031)).toBe(false);
	});

	it("preserves reduce-only isolated TWAP submissions", async () => {
		mocks.mutateAsync.mockResolvedValueOnce({
			status: "ok",
			response: { type: "twapOrder", data: { status: { running: { twapId: 45 } } } },
		});
		if (!hookValue) throw new Error("Expected tracked TWAP hook");

		let result: Awaited<ReturnType<typeof hookValue.submitTwap>> | undefined;
		await act(async () => {
			result = await hookValue?.submitTwap(createParams(13, true), {
				coin: "BTC",
				riskContext: ISOLATED_RISK_CONTEXT,
			});
		});

		expect(result?.state).toBe("confirmed");
		expect(mocks.mutateAsync).toHaveBeenCalledOnce();
	});

	it("rejects a caller that labels a perp TWAP asset as spot", async () => {
		if (!hookValue) throw new Error("Expected tracked TWAP hook");

		await act(async () => {
			await expect(
				hookValue?.submitTwap(createParams(15), {
					coin: "BTC",
					riskContext: { marketKind: "spot" },
				}),
			).rejects.toThrow("Order market context does not match the submitted asset.");
		});

		expect(mocks.mutateAsync).not.toHaveBeenCalled();
		expect(hasPendingTwapForAsset("Mainnet", USER, 15)).toBe(false);
	});

	it("fails closed while another order owns the same asset lock", async () => {
		let releaseLock = () => {};
		const gate = new Promise<void>((resolve) => {
			releaseLock = resolve;
		});
		const holder = runWithOrderAssetLocks({ env: "Mainnet", owner: USER, assetIds: [16] }, async () => gate);
		await Promise.resolve();
		if (!hookValue) throw new Error("Expected tracked TWAP hook");

		let result: Awaited<ReturnType<typeof hookValue.submitTwap>> | undefined;
		await act(async () => {
			result = await hookValue?.submitTwap(createParams(16), {
				coin: "BTC",
				riskContext: CROSS_PERP_RISK_CONTEXT,
			});
		});

		expect(result).toEqual({ state: "blocked", reason: "pending" });
		expect(mocks.mutateAsync).not.toHaveBeenCalled();
		releaseLock();
		await holder;
	});

	it("blocks a TWAP when another tab has an exclusive reservation for the asset", async () => {
		await runWithOrderAssetLocks({ env: "Mainnet", owner: USER, assetIds: [17] }, async (lease) => {
			expect(
				reserveOrderAssets(lease, {
					submissionId: "exclusive-close",
					intentKey: "market-close",
					exclusiveAssetLock: true,
					isRiskReducing: true,
					createdAt: Date.now(),
				}),
			).toBe(true);
		});
		if (!hookValue) throw new Error("Expected tracked TWAP hook");

		let result: Awaited<ReturnType<typeof hookValue.submitTwap>> | undefined;
		await act(async () => {
			result = await hookValue?.submitTwap(createParams(17), {
				coin: "BTC",
				riskContext: CROSS_PERP_RISK_CONTEXT,
			});
		});

		expect(result).toEqual({ state: "blocked", reason: "pending" });
		expect(mocks.mutateAsync).not.toHaveBeenCalled();
	});

	it("keeps a confirmed running TWAP reserved for an exclusive market close", async () => {
		mocks.mutateAsync.mockResolvedValueOnce({
			status: "ok",
			response: { type: "twapOrder", data: { status: { running: { twapId: 77 } } } },
		});
		if (!hookValue) throw new Error("Expected tracked TWAP hook");

		let result: Awaited<ReturnType<typeof hookValue.submitTwap>> | undefined;
		await act(async () => {
			result = await hookValue?.submitTwap(createParams(18, true), {
				coin: "BTC",
				riskContext: CROSS_PERP_RISK_CONTEXT,
			});
		});
		expect(result?.state).toBe("confirmed");

		await runWithOrderAssetLocks({ env: "Mainnet", owner: USER, assetIds: [18] }, async (lease) => {
			expect(
				getOrderAssetReservationState(lease, {
					intentKey: "position-close",
					exclusiveAssetLock: true,
					isRiskReducing: true,
				}),
			).toBe("conflict");
			clearOrderAssetReservations(lease, getActiveTwapReservationId(77));
		});
	});

	it("keeps an accepted response reconciling when no valid active TWAP ID can be reserved", async () => {
		mocks.mutateAsync.mockResolvedValueOnce({
			status: "ok",
			response: { type: "twapOrder", data: { status: { running: { twapId: null } } } },
		});
		if (!hookValue) throw new Error("Expected tracked TWAP hook");

		let result: Awaited<ReturnType<typeof hookValue.submitTwap>> | undefined;
		await act(async () => {
			result = await hookValue?.submitTwap(createParams(20), {
				coin: "BTC",
				riskContext: CROSS_PERP_RISK_CONTEXT,
			});
		});

		expect(result?.state).toBe("reconciling");
		expect(hasPendingTwapForAsset("Mainnet", USER, 20)).toBe(true);
		await runWithOrderAssetLocks({ env: "Mainnet", owner: USER, assetIds: [20] }, async (lease) => {
			expect(
				getOrderAssetReservationState(lease, {
					intentKey: "position-close",
					exclusiveAssetLock: true,
					isRiskReducing: true,
				}),
			).toBe("conflict");
		});
	});

	it("keeps the pending reservation when active TWAP promotion cannot be persisted", async () => {
		const nativeSetItem = Storage.prototype.setItem;
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
			if (key.startsWith("gatu-order-asset-reservations") && value.includes("active-twap:79")) {
				throw new Error("storage unavailable");
			}
			return nativeSetItem.call(this, key, value);
		});
		mocks.mutateAsync.mockResolvedValueOnce({
			status: "ok",
			response: { type: "twapOrder", data: { status: { running: { twapId: 79 } } } },
		});
		if (!hookValue) throw new Error("Expected tracked TWAP hook");

		let result: Awaited<ReturnType<typeof hookValue.submitTwap>> | undefined;
		await act(async () => {
			result = await hookValue?.submitTwap(createParams(21), {
				coin: "BTC",
				riskContext: CROSS_PERP_RISK_CONTEXT,
			});
		});

		expect(result?.state).toBe("reconciling");
		expect(hasPendingTwapForAsset("Mainnet", USER, 21)).toBe(true);
	});

	it("blocks synchronous reentry before a TWAP exchange request settles", async () => {
		let resolveRequest: ((value: unknown) => void) | undefined;
		mocks.mutateAsync.mockReturnValueOnce(
			new Promise((resolve) => {
				resolveRequest = resolve;
			}),
		);
		if (!hookValue) throw new Error("Expected tracked TWAP hook");

		let first: ReturnType<typeof hookValue.submitTwap> | undefined;
		let second: ReturnType<typeof hookValue.submitTwap> | undefined;
		act(() => {
			first = hookValue?.submitTwap(createParams(19), {
				coin: "BTC",
				riskContext: CROSS_PERP_RISK_CONTEXT,
			});
			second = hookValue?.submitTwap(createParams(19), {
				coin: "BTC",
				riskContext: CROSS_PERP_RISK_CONTEXT,
			});
		});
		expect(await second).toEqual({ state: "blocked", reason: "pending" });
		expect(mocks.mutateAsync).toHaveBeenCalledOnce();

		resolveRequest?.({
			status: "ok",
			response: { type: "twapOrder", data: { status: { running: { twapId: 78 } } } },
		});
		await act(async () => {
			await first;
		});
	});
});
