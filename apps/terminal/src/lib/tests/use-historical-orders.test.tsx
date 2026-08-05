// @vitest-environment jsdom

import type { HistoricalOrdersResponse, UserHistoricalOrdersWsEvent } from "@nktkas/hyperliquid";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHistoricalOrders } from "@/hooks/trade/use-historical-orders";

type HistoricalOrderEntry = HistoricalOrdersResponse[number];

const mocks = vi.hoisted(() => ({
	address: "0x1111111111111111111111111111111111111111" as `0x${string}` | undefined,
	isConnected: true,
	query: {
		data: undefined as HistoricalOrdersResponse | undefined,
		error: null as unknown,
		isError: false,
	},
	subscription: {
		data: undefined as UserHistoricalOrdersWsEvent | undefined,
		error: undefined as unknown,
		status: "idle" as "idle" | "subscribing" | "active" | "error",
	},
	useInfo: vi.fn(),
	useSubscription: vi.fn(),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: mocks.address,
		isConnected: mocks.isConnected,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useInfo: (...args: unknown[]) => {
		mocks.useInfo(...args);
		return mocks.query;
	},
	useSubscription: (...args: unknown[]) => {
		mocks.useSubscription(...args);
		return mocks.subscription;
	},
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let hookValue: ReturnType<typeof useHistoricalOrders> | null = null;

function createOrderEntry(overrides: Partial<HistoricalOrderEntry> = {}): HistoricalOrderEntry {
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
			timestamp: 1000,
			triggerCondition: "N/A",
			triggerPx: "0.0",
		},
		status: "open",
		statusTimestamp: 1000,
		...overrides,
	};
}

function Probe() {
	hookValue = useHistoricalOrders();
	return null;
}

describe("useHistoricalOrders", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		hookValue = null;
		mocks.address = "0x1111111111111111111111111111111111111111";
		mocks.isConnected = true;
		mocks.query.data = undefined;
		mocks.query.error = null;
		mocks.query.isError = false;
		mocks.subscription.data = undefined;
		mocks.subscription.error = undefined;
		mocks.subscription.status = "idle";
		mocks.useInfo.mockReset();
		mocks.useSubscription.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderHook() {
		act(() => root.render(<Probe />));
		if (!hookValue) throw new Error("Missing historical orders hook value");
		return hookValue;
	}

	it("merges the documented REST snapshot with newer realtime order statuses", () => {
		const restOrder = createOrderEntry();
		const realtimeOrder = createOrderEntry({
			status: "filled",
			statusTimestamp: 2000,
		});
		mocks.query.data = [restOrder];
		mocks.subscription.data = {
			user: mocks.address as `0x${string}`,
			orderHistory: [realtimeOrder],
			isSnapshot: true,
		};
		mocks.subscription.status = "active";

		const result = renderHook();

		expect(result.status).toBe("ready");
		expect(result.orders).toEqual([realtimeOrder]);
		expect(mocks.useInfo).toHaveBeenCalledWith(
			"historicalOrders",
			{ user: mocks.address },
			expect.objectContaining({
				enabled: true,
				refetchOnReconnect: true,
				refetchOnWindowFocus: false,
			}),
		);
		expect(mocks.useSubscription).toHaveBeenCalledWith(
			"userHistoricalOrders",
			{ user: mocks.address },
			{ enabled: true },
		);
	});

	it("does not let an equal-timestamp open snapshot overwrite a filled order", () => {
		const openOrder = createOrderEntry();
		const filledOrder = createOrderEntry({
			order: {
				...openOrder.order,
				sz: "0",
			},
			status: "filled",
		});
		mocks.query.data = [filledOrder, openOrder];
		mocks.subscription.status = "subscribing";

		const result = renderHook();

		expect(result.status).toBe("ready");
		expect(result.orders).toEqual([filledOrder]);
	});

	it("renders a successful empty REST snapshot when the realtime channel fails", () => {
		mocks.query.data = [];
		mocks.subscription.status = "error";
		mocks.subscription.error = new Error("WebSocket unavailable");

		const result = renderHook();

		expect(result.status).toBe("ready");
		expect(result.error).toBeUndefined();
		expect(result.orders).toEqual([]);
	});

	it("reports an error when the REST snapshot fails", () => {
		const queryError = new Error("REST unavailable");
		mocks.query.error = queryError;
		mocks.query.isError = true;
		mocks.subscription.status = "error";
		mocks.subscription.error = new Error("WebSocket unavailable");

		const result = renderHook();

		expect(result.status).toBe("error");
		expect(result.error).toBe(queryError);
		expect(result.orders).toEqual([]);
	});

	it("does not let realtime order updates hide a failed REST snapshot", () => {
		const queryError = new Error("REST unavailable");
		mocks.query.error = queryError;
		mocks.query.isError = true;
		mocks.subscription.data = {
			user: mocks.address as `0x${string}`,
			orderHistory: [createOrderEntry()],
		};
		mocks.subscription.status = "active";

		const result = renderHook();

		expect(result.status).toBe("error");
		expect(result.error).toBe(queryError);
	});

	it("fails closed for malformed REST and realtime order identities", () => {
		mocks.query.data = [createOrderEntry({ order: { ...createOrderEntry().order, oid: Number.NaN } })];

		let result = renderHook();
		expect(result.status).toBe("error");
		expect(result.error).toMatchObject({ name: "MalformedHistoryPageError" });

		mocks.query.data = [];
		mocks.subscription.data = {
			user: mocks.address as `0x${string}`,
			orderHistory: [createOrderEntry({ statusTimestamp: Number.NaN })],
		};
		result = renderHook();
		expect(result.status).toBe("error");
	});

	it("fails closed instead of throwing when order history is not an array", () => {
		mocks.query.data = { orders: [] } as never;

		const result = renderHook();

		expect(result.status).toBe("error");
		expect(result.error).toMatchObject({ name: "MalformedHistoryPageError" });
	});

	it("keeps both data sources disabled while the wallet is disconnected", () => {
		mocks.address = undefined;
		mocks.isConnected = false;

		const result = renderHook();

		expect(result.status).toBe("idle");
		expect(result.isConnected).toBe(false);
		expect(mocks.useInfo).toHaveBeenCalledWith(
			"historicalOrders",
			{ user: "0x0000000000000000000000000000000000000000" },
			expect.objectContaining({ enabled: false }),
		);
		expect(mocks.useSubscription).toHaveBeenCalledWith(
			"userHistoricalOrders",
			{ user: "0x0000000000000000000000000000000000000000" },
			{ enabled: false },
		);
	});
});
