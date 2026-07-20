import type { FrontendOpenOrdersResponse } from "@nktkas/hyperliquid";
import { describe, expect, it } from "vitest";
import { areTpSlOrderInfosEqual, buildTpSlOrdersByCoin, type OpenOrder } from "@/lib/trade/open-orders";

function openOrder(overrides: Partial<OpenOrder>): OpenOrder {
	return {
		coin: "BTC",
		side: "A",
		limitPx: "90",
		sz: "0",
		oid: 1,
		timestamp: 1,
		origSz: "0",
		triggerCondition: "Price above 100",
		isTrigger: true,
		triggerPx: "100",
		children: [],
		isPositionTpsl: true,
		reduceOnly: true,
		orderType: "Take Profit Market",
		tif: null,
		cloid: null,
		...overrides,
	};
}

describe("buildTpSlOrdersByCoin", () => {
	it("collects only dynamic full-position TP/SL orders", () => {
		const orders: FrontendOpenOrdersResponse = [
			openOrder({ oid: 1, triggerPx: "110", orderType: "Take Profit Market" }),
			openOrder({ oid: 2, triggerPx: "90", orderType: "Stop Market" }),
			openOrder({ oid: 3, triggerPx: "120", isPositionTpsl: false }),
			openOrder({ oid: 4, triggerPx: "80", origSz: "1" }),
		];

		expect(buildTpSlOrdersByCoin(orders).get("BTC")).toEqual({
			tpPrice: 110,
			tpOrderId: 1,
			slPrice: 90,
			slOrderId: 2,
		});
	});
});

describe("areTpSlOrderInfosEqual", () => {
	it("treats equivalent prices and order ids as the same snapshot", () => {
		expect(
			areTpSlOrderInfosEqual(
				{ tpPrice: 110, tpOrderId: 1, slPrice: 90, slOrderId: 2 },
				{ tpPrice: 110.0, tpOrderId: 1, slPrice: 90.0, slOrderId: 2 },
			),
		).toBe(true);
	});

	it("detects price, order-id, and leg changes", () => {
		const snapshot = { tpPrice: 110, tpOrderId: 1, slPrice: 90, slOrderId: 2 };

		expect(areTpSlOrderInfosEqual(snapshot, { ...snapshot, tpPrice: 111 })).toBe(false);
		expect(areTpSlOrderInfosEqual(snapshot, { ...snapshot, slOrderId: 3 })).toBe(false);
		expect(areTpSlOrderInfosEqual(snapshot, { tpPrice: 110, tpOrderId: 1 })).toBe(false);
	});
});
