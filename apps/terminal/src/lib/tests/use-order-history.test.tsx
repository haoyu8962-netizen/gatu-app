// @vitest-environment jsdom

import type { HistoricalOrdersResponse } from "@nktkas/hyperliquid";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOrderHistory } from "@/hooks/trade/use-order-history";

const ADDRESS = "0x1111111111111111111111111111111111111111";

const mocks = vi.hoisted(() => ({
	isOnline: true,
	options: null as Record<string, unknown> | null,
	query: {
		data: undefined as { orders: HistoricalOrdersResponse; reachedLimit: boolean } | undefined,
		error: null as unknown,
		fetchStatus: "idle" as "idle" | "fetching" | "paused",
		isError: false,
		isFetching: false,
		refetch: vi.fn(),
	},
}));

vi.mock("@tanstack/react-query", () => ({
	useQuery: (options: Record<string, unknown>) => {
		mocks.options = options;
		return mocks.query;
	},
}));

vi.mock("@/hooks/use-mobile", () => ({ useOnlineStatus: () => mocks.isOnline }));
vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ env: "mainnet", info: { historicalOrders: vi.fn() } }),
}));

function createOrder(): HistoricalOrdersResponse[number] {
	return {
		order: {
			children: [],
			cloid: null,
			coin: "BTC",
			isPositionTpsl: false,
			isTrigger: false,
			limitPx: "63000",
			oid: 42,
			orderType: "Limit",
			origSz: "0.01",
			reduceOnly: false,
			side: "B",
			sz: "0",
			tif: "Gtc",
			timestamp: 1_700_000_000_000,
			triggerCondition: "N/A",
			triggerPx: "0",
		},
		status: "filled",
		statusTimestamp: 1_700_000_001_000,
	};
}

let hookValue: ReturnType<typeof useOrderHistory> | null = null;

function Probe({ address }: { address: string }) {
	hookValue = useOrderHistory(address);
	return null;
}

describe("useOrderHistory", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		hookValue = null;
		mocks.isOnline = true;
		mocks.options = null;
		mocks.query.data = undefined;
		mocks.query.error = null;
		mocks.query.fetchStatus = "idle";
		mocks.query.isError = false;
		mocks.query.isFetching = false;
		mocks.query.refetch.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderHook(address = ADDRESS) {
		act(() => root.render(<Probe address={address} />));
		if (!hookValue) throw new Error("Missing order history hook value");
		return hookValue;
	}

	it("uses an address-scoped cached query with reconnect refresh", () => {
		const result = renderHook();

		expect(result.status).toBe("loading");
		expect(mocks.options).toMatchObject({
			enabled: true,
			queryKey: ["hl", "order-history", "historicalOrders", "mainnet", ADDRESS],
			refetchOnReconnect: true,
			refetchOnWindowFocus: false,
			retry: false,
		});
	});

	it("keeps cached ordinary orders ready during a failed background refresh", () => {
		const refreshError = new Error("Refresh failed");
		mocks.query.data = { orders: [createOrder()], reachedLimit: true };
		mocks.query.error = refreshError;
		mocks.query.isError = true;

		const result = renderHook();

		expect(result.status).toBe("ready");
		expect(result.error).toBe(refreshError);
		expect(result.reachedLimit).toBe(true);
		expect(result.entries).toEqual([expect.objectContaining({ kind: "order", key: "order:42" })]);
		expect(result.entries.some((entry) => entry.kind !== "order")).toBe(false);
	});

	it("distinguishes disabled and offline initial states", () => {
		let result = renderHook("invalid");
		expect(result.status).toBe("disabled");
		expect(mocks.options).toMatchObject({ enabled: false });

		mocks.isOnline = false;
		result = renderHook();
		expect(result.status).toBe("offline");
		expect(result.isOffline).toBe(true);
	});

	it("reports cached refresh state and exposes an explicit refresh action", () => {
		mocks.query.data = { orders: [createOrder()], reachedLimit: false };
		mocks.query.fetchStatus = "fetching";
		mocks.query.isFetching = true;

		const result = renderHook();

		expect(result.status).toBe("ready");
		expect(result.isRefreshing).toBe(true);
		result.refresh();
		expect(mocks.query.refetch).toHaveBeenCalledOnce();
	});
});
