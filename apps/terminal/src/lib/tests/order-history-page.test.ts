import type { HistoricalOrdersResponse, InfoClient } from "@nktkas/hyperliquid";
import { describe, expect, it, vi } from "vitest";
import { fetchOrderHistorySnapshot } from "@/hooks/trade/use-order-history";
import { buildOrderHistoryEntries } from "@/lib/trade/order-history";
import {
	DEFAULT_ORDER_HISTORY_PAGE_SIZE,
	filterOrderHistory,
	getOrderHistoryMarkets,
	getOrderHistoryPage,
	getOrderHistorySide,
	getOrderHistoryTypes,
	isOrderHistoryAddress,
	isOrderHistoryPageSize,
	isOrderHistorySideFilter,
	isOrderHistoryStatusFilter,
	ORDER_HISTORY_API_LIMIT,
	type OrdinaryOrderHistoryEntry,
} from "@/lib/trade/order-history-page";

const ADDRESS = "0x1111111111111111111111111111111111111111" as const;

function createOrder(
	index: number,
	overrides: Partial<HistoricalOrdersResponse[number]> = {},
): HistoricalOrdersResponse[number] {
	return {
		order: {
			children: [],
			cloid: null,
			coin: index % 2 === 0 ? "BTC" : "ETH",
			isPositionTpsl: false,
			isTrigger: false,
			limitPx: "63000",
			oid: index,
			orderType: index % 2 === 0 ? "Limit" : "Market",
			origSz: "0.01",
			reduceOnly: false,
			side: index % 2 === 0 ? "B" : "A",
			sz: "0",
			tif: "Gtc",
			timestamp: 1_700_000_000_000 + index,
			triggerCondition: "N/A",
			triggerPx: "0",
		},
		status: index % 2 === 0 ? "filled" : "canceled",
		statusTimestamp: 1_700_000_001_000 + index,
		...overrides,
	};
}

function createEntries(count: number): OrdinaryOrderHistoryEntry[] {
	return buildOrderHistoryEntries(
		Array.from({ length: count }, (_, index) => createOrder(index)),
		[],
	).filter((entry): entry is OrdinaryOrderHistoryEntry => entry.kind === "order");
}

describe("order history page", () => {
	it("accepts only complete EVM addresses and documented filter values", () => {
		expect(isOrderHistoryAddress(ADDRESS)).toBe(true);
		expect(isOrderHistoryAddress("0x1234")).toBe(false);
		expect(isOrderHistoryAddress(null)).toBe(false);
		expect([5, 10, 25, 50].every(isOrderHistoryPageSize)).toBe(true);
		expect(isOrderHistoryPageSize(20)).toBe(false);
		expect(["all", "buy", "sell"].every(isOrderHistorySideFilter)).toBe(true);
		expect(isOrderHistorySideFilter("long")).toBe(false);
		expect(
			["all", "open", "filled", "triggered", "canceled", "rejected", "other"].every(isOrderHistoryStatusFilter),
		).toBe(true);
	});

	it("filters ordinary orders by market, direction, type, and status", () => {
		const entries = createEntries(4);

		expect(getOrderHistoryMarkets(entries)).toEqual(["BTC", "ETH"]);
		expect(getOrderHistoryTypes(entries)).toEqual(["Limit", "Market"]);
		expect(getOrderHistorySide(entries[0] as OrdinaryOrderHistoryEntry)).toBe("sell");
		expect(getOrderHistorySide(entries[1] as OrdinaryOrderHistoryEntry)).toBe("buy");
		expect(filterOrderHistory(entries, { market: "BTC", side: "buy", status: "filled", type: "Limit" })).toEqual(
			entries.filter((entry) => entry.coin === "BTC"),
		);
		expect(filterOrderHistory(entries, { market: "ETH", side: "buy", status: "all", type: null })).toEqual([]);
	});

	it("paginates locally at 25 rows and clamps an invalid requested page", () => {
		const entries = createEntries(63);
		const secondPage = getOrderHistoryPage(entries, 2, DEFAULT_ORDER_HISTORY_PAGE_SIZE);
		const lastPage = getOrderHistoryPage(entries, Number.POSITIVE_INFINITY, DEFAULT_ORDER_HISTORY_PAGE_SIZE);

		expect(secondPage).toMatchObject({ currentPage: 2, endIndex: 50, startIndex: 25, totalPages: 3 });
		expect(secondPage.rows).toEqual(entries.slice(25, 50));
		expect(lastPage).toMatchObject({ currentPage: 1, endIndex: 25, startIndex: 0, totalPages: 3 });
	});

	it("loads one documented historicalOrders snapshot, sorts it newest first, and reports the API boundary", async () => {
		const orders = Array.from({ length: ORDER_HISTORY_API_LIMIT }, (_, index) => createOrder(index));
		const historicalOrders = vi.fn().mockResolvedValue(orders);
		const info = { historicalOrders } as unknown as InfoClient;
		const signal = new AbortController().signal;

		const result = await fetchOrderHistorySnapshot(info, ADDRESS, signal);

		expect(result.reachedLimit).toBe(true);
		expect(result.orders).toHaveLength(ORDER_HISTORY_API_LIMIT);
		expect(result.orders[0]?.statusTimestamp).toBeGreaterThan(result.orders.at(-1)?.statusTimestamp ?? 0);
		expect(historicalOrders).toHaveBeenCalledOnce();
		expect(historicalOrders).toHaveBeenCalledWith({ user: ADDRESS }, signal);
	});

	it("fails closed for malformed items and responses beyond the documented boundary", async () => {
		const malformedInfo = {
			historicalOrders: vi.fn().mockResolvedValue([createOrder(1, { statusTimestamp: Number.NaN })]),
		} as unknown as InfoClient;
		const oversizedInfo = {
			historicalOrders: vi
				.fn()
				.mockResolvedValue(Array.from({ length: ORDER_HISTORY_API_LIMIT + 1 }, (_, index) => createOrder(index))),
		} as unknown as InfoClient;

		await expect(fetchOrderHistorySnapshot(malformedInfo, ADDRESS, new AbortController().signal)).rejects.toMatchObject(
			{ name: "MalformedHistoryPageError" },
		);
		await expect(fetchOrderHistorySnapshot(oversizedInfo, ADDRESS, new AbortController().signal)).rejects.toMatchObject(
			{ name: "MalformedHistoryPageError" },
		);
	});
});
