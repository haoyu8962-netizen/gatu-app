// @vitest-environment jsdom

import type {
	TwapHistoryResponse,
	UserFillsResponse,
	UserTwapHistoryWsEvent,
	UserTwapSliceFillsResponse,
	UserTwapSliceFillsWsEvent,
} from "@nktkas/hyperliquid";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTwapHistory } from "@/hooks/trade/use-twap-history";
import { useTwapSliceFills } from "@/hooks/trade/use-twap-slice-fills";

const ADDRESS_A = "0x1111111111111111111111111111111111111111" as const;
const ADDRESS_B = "0x2222222222222222222222222222222222222222" as const;

const mocks = vi.hoisted(() => ({
	address: "0x1111111111111111111111111111111111111111" as `0x${string}` | undefined,
	isConnected: true,
	historyQuery: {
		data: [] as TwapHistoryResponse | undefined,
		error: null as unknown,
		isError: false,
		refetch: vi.fn(),
	},
	fillsQuery: {
		data: [] as UserTwapSliceFillsResponse | undefined,
		error: null as unknown,
		isError: false,
		refetch: vi.fn(),
	},
	historySubscription: {
		data: undefined as UserTwapHistoryWsEvent | undefined,
		error: undefined as unknown,
		status: "active" as "idle" | "subscribing" | "active" | "error",
	},
	fillsSubscription: {
		data: undefined as UserTwapSliceFillsWsEvent | undefined,
		error: undefined as unknown,
		status: "active" as "idle" | "subscribing" | "active" | "error",
	},
	useInfo: vi.fn(),
	useSubscription: vi.fn(),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: mocks.address, isConnected: mocks.isConnected }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useInfo: (method: string, ...args: unknown[]) => {
		mocks.useInfo(method, ...args);
		return method === "twapHistory" ? mocks.historyQuery : mocks.fillsQuery;
	},
	useSubscription: (method: string, ...args: unknown[]) => {
		mocks.useSubscription(method, ...args);
		return method === "userTwapHistory" ? mocks.historySubscription : mocks.fillsSubscription;
	},
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let historyResult: ReturnType<typeof useTwapHistory> | null = null;
let fillsResult: ReturnType<typeof useTwapSliceFills> | null = null;

function createTwapHistory(index: number): TwapHistoryResponse[number] {
	return {
		state: {
			coin: "BTC",
			executedNtl: "0",
			executedSz: "0",
			minutes: 10,
			randomize: false,
			reduceOnly: false,
			side: "B",
			stopPx: null,
			sz: "0.01",
			timestamp: 1_000_000 + index,
			trigger: null,
			user: ADDRESS_A,
		},
		status: { status: "finished" },
		time: 2_000_000 + index,
		twapId: index,
	};
}

function createTwapFill(index: number): UserTwapSliceFillsResponse[number] {
	const fill: UserFillsResponse[number] = {
		closedPnl: "0",
		coin: "BTC",
		crossed: true,
		dir: "Open Long",
		fee: "0.01",
		feeToken: "USDC",
		hash: `0x${"0".repeat(64)}`,
		oid: index,
		px: "60000",
		side: "B",
		startPosition: "0",
		sz: "0.01",
		tid: index,
		time: 2_000_000 + index,
		twapId: index,
	};
	return { fill, twapId: index };
}

function Probe() {
	historyResult = useTwapHistory();
	fillsResult = useTwapSliceFills();
	return null;
}

describe("TWAP activity hooks", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		historyResult = null;
		fillsResult = null;
		mocks.address = ADDRESS_A;
		mocks.isConnected = true;
		mocks.historyQuery.data = [];
		mocks.historyQuery.error = null;
		mocks.historyQuery.isError = false;
		mocks.historyQuery.refetch.mockReset();
		mocks.fillsQuery.data = [];
		mocks.fillsQuery.error = null;
		mocks.fillsQuery.isError = false;
		mocks.fillsQuery.refetch.mockReset();
		mocks.historySubscription.data = undefined;
		mocks.historySubscription.error = undefined;
		mocks.historySubscription.status = "active";
		mocks.fillsSubscription.data = undefined;
		mocks.fillsSubscription.error = undefined;
		mocks.fillsSubscription.status = "active";
		mocks.useInfo.mockReset();
		mocks.useSubscription.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderHooks() {
		act(() => root.render(<Probe />));
		if (!historyResult || !fillsResult) throw new Error("Missing TWAP hook results");
		return { history: historyResult, fills: fillsResult };
	}

	it("keeps valid REST data visible and exposes realtime subscription failures", () => {
		const historyError = new Error("TWAP history WebSocket unavailable");
		const fillsError = new Error("TWAP fills WebSocket unavailable");
		mocks.historySubscription.status = "error";
		mocks.historySubscription.error = historyError;
		mocks.fillsSubscription.status = "error";
		mocks.fillsSubscription.error = fillsError;

		const result = renderHooks();

		expect(result.history.status).toBe("ready");
		expect(result.history.isRealtimeDegraded).toBe(true);
		expect(result.history.realtimeError).toBe(historyError);
		expect(result.fills.status).toBe("ready");
		expect(result.fills.isRealtimeDegraded).toBe(true);
		expect(result.fills.realtimeError).toBe(fillsError);
	});

	it("refreshes the REST snapshot and creates fresh subscription identities on retry", () => {
		mocks.historySubscription.status = "error";
		mocks.fillsSubscription.status = "error";
		const result = renderHooks();

		act(() => {
			result.history.retryRealtime();
			result.fills.retryRealtime();
		});

		expect(mocks.historyQuery.refetch).toHaveBeenCalledTimes(1);
		expect(mocks.fillsQuery.refetch).toHaveBeenCalledTimes(1);
		expect(mocks.useSubscription).toHaveBeenCalledWith(
			"userTwapHistory",
			{ user: ADDRESS_A },
			{ enabled: true, refreshKey: 1 },
		);
		expect(mocks.useSubscription).toHaveBeenCalledWith(
			"userTwapSliceFills",
			{ user: ADDRESS_A },
			{ enabled: true, refreshKey: 1 },
		);
	});

	it("loads the documented 2000-row TWAP result incrementally", () => {
		mocks.historyQuery.data = Array.from({ length: 250 }, (_, index) => createTwapHistory(index));
		mocks.fillsQuery.data = Array.from({ length: 250 }, (_, index) => createTwapFill(index));
		const initial = renderHooks();

		expect(initial.history.history).toHaveLength(200);
		expect(initial.history.hasMore).toBe(true);
		expect(initial.fills.fills).toHaveLength(200);
		expect(initial.fills.hasMore).toBe(true);

		act(() => {
			initial.history.loadMore();
			initial.fills.loadMore();
		});

		expect(historyResult?.history).toHaveLength(250);
		expect(historyResult?.hasMore).toBe(false);
		expect(fillsResult?.fills).toHaveLength(250);
		expect(fillsResult?.hasMore).toBe(false);
	});

	it("resets the visible window when the connected user changes", () => {
		mocks.historyQuery.data = Array.from({ length: 250 }, (_, index) => createTwapHistory(index));
		mocks.fillsQuery.data = Array.from({ length: 250 }, (_, index) => createTwapFill(index));
		const initial = renderHooks();
		act(() => {
			initial.history.loadMore();
			initial.fills.loadMore();
		});

		mocks.address = ADDRESS_B;
		renderHooks();

		expect(historyResult?.history).toHaveLength(200);
		expect(fillsResult?.fills).toHaveLength(200);
	});
});
