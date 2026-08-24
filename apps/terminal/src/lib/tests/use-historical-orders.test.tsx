// @vitest-environment jsdom

import type { HistoricalOrdersResponse, UserHistoricalOrdersWsEvent } from "@nktkas/hyperliquid";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECENT_ACCOUNT_HISTORY_ROWS } from "@/config/trade";
import { useHistoricalOrders } from "@/hooks/trade/use-historical-orders";

type HistoricalOrderEntry = HistoricalOrdersResponse[number];

const mocks = vi.hoisted(() => ({
	address: "0x1111111111111111111111111111111111111111" as `0x${string}` | undefined,
	isConnected: true,
	isOnline: true,
	subscription: {
		data: undefined as UserHistoricalOrdersWsEvent | undefined,
		error: undefined as unknown,
		isStale: false,
		status: "idle" as "idle" | "subscribing" | "active" | "error",
	},
	useSubscription: vi.fn(),
}));

vi.mock("@/hooks/use-mobile", () => ({
	useOnlineStatus: () => mocks.isOnline,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: mocks.address,
		isConnected: mocks.isConnected,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useSubscription: (method: string, ...args: unknown[]) => {
		mocks.useSubscription(method, ...args);
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
		mocks.isOnline = true;
		mocks.subscription.data = undefined;
		mocks.subscription.error = undefined;
		mocks.subscription.isStale = false;
		mocks.subscription.status = "idle";
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

	it("uses only the historical-orders WebSocket snapshot for toolbar history", () => {
		mocks.subscription.data = {
			isSnapshot: true,
			orderHistory: [],
			user: mocks.address as `0x${string}`,
		};
		mocks.subscription.status = "active";
		mocks.subscription.status = "active";

		const result = renderHook();

		expect(result.status).toBe("ready");
		expect(result.orders).toEqual([]);
		expect(result.entries).toEqual([]);
		expect(mocks.useSubscription).toHaveBeenCalledTimes(1);
		expect(mocks.useSubscription).toHaveBeenCalledWith(
			"userHistoricalOrders",
			{ user: mocks.address },
			{ enabled: true },
		);
	});

	it("sorts statuses newest first and keeps only the latest 30 ordinary orders", () => {
		const orders = Array.from({ length: 35 }, (_, index) => {
			const base = createOrderEntry();
			return createOrderEntry({
				order: { ...base.order, oid: index + 1, timestamp: index + 1 },
				statusTimestamp: index + 1,
			});
		});
		mocks.subscription.data = {
			isSnapshot: true,
			orderHistory: orders,
			user: mocks.address as `0x${string}`,
		};

		const result = renderHook();

		expect(result.status).toBe("ready");
		expect(result.orders).toHaveLength(RECENT_ACCOUNT_HISTORY_ROWS);
		expect(result.orders[0]?.statusTimestamp).toBe(35);
		expect(result.orders.at(-1)?.statusTimestamp).toBe(6);
		expect(result.entries.every((entry) => entry.kind === "order")).toBe(true);
	});

	it("keeps the newest lifecycle status for a repeated order id", () => {
		const openOrder = createOrderEntry();
		const filledOrder = createOrderEntry({ status: "filled", statusTimestamp: 2000 });
		mocks.subscription.data = {
			orderHistory: [openOrder, filledOrder],
			user: mocks.address as `0x${string}`,
		};

		const result = renderHook();

		expect(result.orders).toEqual([filledOrder]);
	});

	it("fails closed for a mismatched user or malformed order", () => {
		mocks.subscription.data = {
			orderHistory: [createOrderEntry()],
			user: "0x2222222222222222222222222222222222222222",
		};

		let result = renderHook();
		expect(result.status).toBe("error");
		expect(result.error).toMatchObject({ name: "MalformedHistoryPageError" });
		expect(result.orders).toEqual([]);

		mocks.subscription.data = {
			orderHistory: [createOrderEntry({ statusTimestamp: Number.NaN })],
			user: mocks.address as `0x${string}`,
		};
		result = renderHook();
		expect(result.status).toBe("error");
		expect(result.orders).toEqual([]);

		const order = createOrderEntry();
		mocks.subscription.data = {
			orderHistory: [{ ...order, order: { ...order.order, side: "X" as never } }],
			user: mocks.address as `0x${string}`,
		};
		result = renderHook();
		expect(result.status).toBe("error");
		expect(result.orders).toEqual([]);
	});

	it("keeps a valid snapshot visible when realtime updates later fail", () => {
		const error = new Error("WebSocket unavailable");
		mocks.subscription.data = {
			isSnapshot: true,
			orderHistory: [createOrderEntry()],
			user: mocks.address as `0x${string}`,
		};
		mocks.subscription.error = error;
		mocks.subscription.status = "error";

		const result = renderHook();

		expect(result.status).toBe("ready");
		expect(result.error).toBe(error);
		expect(result.orders).toHaveLength(1);
		expect(result.isStale).toBe(true);
	});

	it("keeps retained orders stale until a reconnect delivers a fresh snapshot", () => {
		mocks.subscription.data = {
			isSnapshot: true,
			orderHistory: [createOrderEntry()],
			user: mocks.address as `0x${string}`,
		};
		mocks.subscription.status = "subscribing";
		mocks.subscription.isStale = true;

		let result = renderHook();
		expect(result.status).toBe("ready");
		expect(result.isStale).toBe(true);

		mocks.subscription.status = "active";
		result = renderHook();
		expect(result.isStale).toBe(true);

		mocks.subscription.isStale = false;
		result = renderHook();
		expect(result.isStale).toBe(false);
	});

	it("distinguishes offline, initial subscription failure, and disconnected states", () => {
		mocks.isOnline = false;
		let result = renderHook();
		expect(result.status).toBe("offline");
		expect(result.isOffline).toBe(true);

		mocks.isOnline = true;
		mocks.subscription.status = "error";
		mocks.subscription.error = new Error("WebSocket unavailable");
		result = renderHook();
		expect(result.status).toBe("error");

		mocks.address = undefined;
		mocks.isConnected = false;
		result = renderHook();
		expect(result.status).toBe("idle");
		expect(result.isConnected).toBe(false);
		expect(mocks.useSubscription).toHaveBeenLastCalledWith(
			"userHistoricalOrders",
			{ user: "0x0000000000000000000000000000000000000000" },
			{ enabled: false },
		);
	});
});
