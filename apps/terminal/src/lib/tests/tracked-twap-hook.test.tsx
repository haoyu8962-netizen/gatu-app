// @vitest-environment jsdom

import { HttpRequestError } from "@nktkas/hyperliquid";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTrackedTwapOrder } from "@/hooks/trade/use-tracked-twap-order";
import { getPendingTwapActions, hasPendingTwapForAsset } from "@/stores/use-pending-twap-store";

const USER = "0x1111111111111111111111111111111111111111" as const;
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

function createParams(assetId = 7) {
	return {
		twap: {
			a: assetId,
			b: true,
			s: "1.25",
			r: false,
			m: 30,
			t: true,
		},
	};
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

	it("marks an HTTP timeout as reconciling and blocks another TWAP for the same asset", async () => {
		mocks.mutateAsync.mockRejectedValueOnce(new HttpRequestError({ detail: "Request timed out after 10000 ms" }));
		if (!hookValue) throw new Error("Expected tracked TWAP hook");

		let firstResult: Awaited<ReturnType<typeof hookValue.submitTwap>> | undefined;
		await act(async () => {
			firstResult = await hookValue?.submitTwap(createParams(), { coin: "xyz:GOLD" });
		});

		expect(firstResult?.state).toBe("reconciling");
		expect(hasPendingTwapForAsset("Mainnet", USER, 7)).toBe(true);
		expect(mocks.mutateAsync).toHaveBeenCalledWith(createParams());

		let secondResult: Awaited<ReturnType<typeof hookValue.submitTwap>> | undefined;
		await act(async () => {
			secondResult = await hookValue?.submitTwap(createParams(), { coin: "xyz:GOLD" });
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
			result = await hookValue?.submitTwap(createParams(12), { coin: "BTC" });
		});

		expect(result).toEqual({ state: "blocked", reason: "stateUnavailable" });
		expect(mocks.mutateAsync).not.toHaveBeenCalled();
		expect(hasPendingTwapForAsset("Mainnet", USER, 12)).toBe(false);
	});

	it("removes reconciliation state after an explicit exchange success", async () => {
		mocks.mutateAsync.mockResolvedValueOnce({
			status: "ok",
			response: { type: "twapOrder", data: { status: { running: { twapId: 42 } } } },
		});
		if (!hookValue) throw new Error("Expected tracked TWAP hook");

		let result: Awaited<ReturnType<typeof hookValue.submitTwap>> | undefined;
		await act(async () => {
			result = await hookValue?.submitTwap(createParams(8), { coin: "ETH" });
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

		const submitPromise = hookValue.submitTwap(createParams(9), { coin: "BTC" });
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
			await expect(hookValue?.submitTwap(createParams(10), { coin: "SOL" })).rejects.toBe(error);
		});

		expect(hasPendingTwapForAsset("Mainnet", USER, 10)).toBe(false);
	});
});
