import type { HistoricalOrdersResponse } from "@nktkas/hyperliquid";
import { describe, expect, it } from "vitest";
import {
	getHistoricalOrderPriceDisplay,
	isValidHistoricalOrderHistoryItem,
	mergeHistoricalOrderSources,
} from "@/lib/trade/historical-orders";

type HistoricalOrderEntry = HistoricalOrdersResponse[number];

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

describe("historical order validation", () => {
	it("accepts every SDK order type and any other order type the exchange sends", () => {
		const entry = createOrderEntry();
		const supportedTypes = [
			"Market",
			"Limit",
			"Stop Market",
			"Stop Limit",
			"Take Profit Market",
			"Take Profit Limit",
			"Twap Slice",
			"Vault Close",
			"Spot Dust Conversion",
		] as const satisfies readonly HistoricalOrderEntry["order"]["orderType"][];

		for (const orderType of supportedTypes) {
			expect(isValidHistoricalOrderHistoryItem({ ...entry, order: { ...entry.order, orderType } })).toBe(true);
		}
		for (const orderType of ["Trailing Stop Market", "Unexpected Type"]) {
			expect(isValidHistoricalOrderHistoryItem({ ...entry, order: { ...entry.order, orderType } })).toBe(true);
		}
		for (const orderType of ["", 7, null]) {
			expect(isValidHistoricalOrderHistoryItem({ ...entry, order: { ...entry.order, orderType } })).toBe(false);
		}
	});
});

describe("historical order price display", () => {
	it("uses the limit price for a regular order", () => {
		expect(
			getHistoricalOrderPriceDisplay({
				isTrigger: false,
				limitPx: "7.4",
				orderType: "Limit",
				triggerPx: "0.0",
			}),
		).toEqual({
			kind: "limit",
			price: "7.4",
		});
	});

	it("identifies the protection bound of a regular market order", () => {
		expect(
			getHistoricalOrderPriceDisplay({
				isTrigger: false,
				limitPx: "6.66",
				orderType: "Market",
				triggerPx: "0.0",
			}),
		).toEqual({
			kind: "market",
			protectionPrice: "6.66",
		});
	});

	it("separates a market trigger price from its execution protection price", () => {
		expect(
			getHistoricalOrderPriceDisplay({
				isTrigger: false,
				limitPx: "6.66",
				orderType: "Stop Market",
				triggerPx: "7.4",
			}),
		).toEqual({
			kind: "trigger",
			triggerPrice: "7.4",
			execution: {
				kind: "market",
				protectionPrice: "6.66",
			},
		});
	});

	it("does not present a cleared trigger price as zero", () => {
		expect(
			getHistoricalOrderPriceDisplay({
				isTrigger: false,
				limitPx: "6.66",
				orderType: "Stop Market",
				triggerPx: "0.0",
			}),
		).toEqual({
			kind: "trigger",
			triggerPrice: null,
			execution: {
				kind: "market",
				protectionPrice: "6.66",
			},
		});
	});

	it("shows both prices for a trigger-limit order", () => {
		expect(
			getHistoricalOrderPriceDisplay({
				isTrigger: true,
				limitPx: "7.2",
				orderType: "Stop Limit",
				triggerPx: "7.4",
			}),
		).toEqual({
			kind: "trigger",
			triggerPrice: "7.4",
			execution: {
				kind: "limit",
				price: "7.2",
			},
		});
	});
});

describe("historical order source merge", () => {
	it("keeps the newest status for an order shared by REST and WebSocket sources", () => {
		const restOrder = createOrderEntry();
		const realtimeOrder = createOrderEntry({
			status: "filled",
			statusTimestamp: 2000,
		});

		expect(mergeHistoricalOrderSources([restOrder], [realtimeOrder])).toEqual([realtimeOrder]);
		expect(mergeHistoricalOrderSources([realtimeOrder], [restOrder])).toEqual([realtimeOrder]);
	});

	it("prefers the later source when equal timestamps contain a refreshed payload", () => {
		const restOrder = createOrderEntry();
		const realtimeOrder = createOrderEntry({
			order: {
				...restOrder.order,
				sz: "0.005",
			},
		});

		expect(mergeHistoricalOrderSources([restOrder], [realtimeOrder])).toEqual([realtimeOrder]);
	});

	it("keeps a filled status over an open snapshot with the same timestamp", () => {
		const openOrder = createOrderEntry();
		const filledOrder = createOrderEntry({
			order: {
				...openOrder.order,
				sz: "0.0008",
			},
			status: "filled",
		});

		expect(mergeHistoricalOrderSources([filledOrder, openOrder])).toEqual([filledOrder]);
		expect(mergeHistoricalOrderSources([openOrder, filledOrder])).toEqual([filledOrder]);
	});

	it("keeps a filled status over a triggered snapshot with the same timestamp", () => {
		const triggeredOrder = createOrderEntry({ status: "triggered" });
		const filledOrder = createOrderEntry({ status: "filled" });

		expect(mergeHistoricalOrderSources([filledOrder, triggeredOrder])).toEqual([filledOrder]);
		expect(mergeHistoricalOrderSources([triggeredOrder, filledOrder])).toEqual([filledOrder]);
	});

	it("sorts unique orders by their latest status timestamp without mutating the sources", () => {
		const olderOrder = createOrderEntry();
		const newerOrder = createOrderEntry({
			order: {
				...olderOrder.order,
				oid: 43,
			},
			status: "canceled",
			statusTimestamp: 3000,
		});
		const restOrders = [olderOrder];
		const realtimeOrders = [newerOrder];

		expect(mergeHistoricalOrderSources(restOrders, realtimeOrders)).toEqual([newerOrder, olderOrder]);
		expect(restOrders).toEqual([olderOrder]);
		expect(realtimeOrders).toEqual([newerOrder]);
	});
});
