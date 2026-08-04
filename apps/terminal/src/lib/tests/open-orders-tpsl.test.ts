import type { FrontendOpenOrdersResponse } from "@nktkas/hyperliquid";
import { describe, expect, it } from "vitest";
import {
	areTpSlOrderInfosEqual,
	buildTpSlOrdersByCoin,
	isClosePositionOrder,
	type OpenOrder,
} from "@/lib/trade/open-orders";

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
	it("collects dynamic whole-position market and fixed-size limit TP/SL orders", () => {
		const orders: FrontendOpenOrdersResponse = [
			openOrder({ oid: 1, triggerPx: "110", orderType: "Take Profit Market" }),
			openOrder({
				coin: "ETH",
				side: "B",
				oid: 2,
				triggerPx: "90",
				limitPx: "91",
				sz: "1.250",
				origSz: "1.250",
				orderType: "Stop Limit",
			}),
			openOrder({ oid: 3, triggerPx: "120", isPositionTpsl: false }),
		];

		expect(buildTpSlOrdersByCoin(orders).get("BTC")).toEqual({
			tpPrice: "110",
			tpOrderId: 1,
			tpSize: "0",
			tpIsMarket: true,
			tpLimitPrice: "90",
			tpSide: "A",
			ambiguous: false,
			incompatible: false,
		});
		expect(buildTpSlOrdersByCoin(orders).get("ETH")).toEqual({
			slPrice: "90",
			slOrderId: 2,
			slSize: "1.25",
			slIsMarket: false,
			slLimitPrice: "91",
			slSide: "B",
			ambiguous: false,
			incompatible: false,
		});
	});

	it("flags duplicate legs as ambiguous without silently replacing the first order", () => {
		const info = buildTpSlOrdersByCoin([
			openOrder({ oid: 1, triggerPx: "110", limitPx: "99" }),
			openOrder({ oid: 2, triggerPx: "111", limitPx: "99.9" }),
		]).get("BTC");

		expect(info).toMatchObject({
			tpPrice: "110",
			tpOrderId: 1,
			ambiguous: true,
			incompatible: true,
		});
	});

	it("flags mismatched TP/SL sizes or execution modes as incompatible", () => {
		const info = buildTpSlOrdersByCoin([
			openOrder({ oid: 1, triggerPx: "110", limitPx: "99", sz: "1", origSz: "1" }),
			openOrder({
				oid: 2,
				triggerPx: "90",
				limitPx: "89",
				sz: "2",
				origSz: "2",
				orderType: "Stop Limit",
			}),
		]).get("BTC");

		expect(info).toMatchObject({
			tpSize: "1",
			tpIsMarket: true,
			slSize: "2",
			slIsMarket: false,
			ambiguous: false,
			incompatible: true,
		});
	});

	it("flags opposite close sides across TP/SL legs as incompatible", () => {
		const info = buildTpSlOrdersByCoin([
			openOrder({ oid: 1, side: "A", triggerPx: "110", limitPx: "99" }),
			openOrder({ oid: 2, side: "B", triggerPx: "90", limitPx: "99", orderType: "Stop Market" }),
		]).get("BTC");

		expect(info).toMatchObject({ ambiguous: false, incompatible: true });
	});

	it("keeps isClosePositionOrder limited to dynamic whole-position orders", () => {
		expect(isClosePositionOrder(openOrder({ origSz: "0" }))).toBe(true);
		expect(isClosePositionOrder(openOrder({ origSz: "1", sz: "1" }))).toBe(false);
	});
});

describe("areTpSlOrderInfosEqual", () => {
	it("treats equivalent prices and order ids as the same snapshot", () => {
		expect(
			areTpSlOrderInfosEqual(
				{
					tpPrice: "110",
					tpOrderId: 1,
					tpSize: "1.2",
					tpIsMarket: false,
					tpLimitPrice: "109",
					tpSide: "A",
					slPrice: "90",
					slOrderId: 2,
					slSize: "1.2",
					slIsMarket: false,
					slLimitPrice: "89",
					slSide: "A",
				},
				{
					tpPrice: "110.0",
					tpOrderId: 1,
					tpSize: "1.200",
					tpIsMarket: false,
					tpLimitPrice: "109.0",
					tpSide: "A",
					slPrice: "90.0",
					slOrderId: 2,
					slSize: "1.200",
					slIsMarket: false,
					slLimitPrice: "89.0",
					slSide: "A",
					ambiguous: false,
					incompatible: false,
				},
			),
		).toBe(true);
	});

	it("detects trigger, order-id, size, execution, limit-price, and conflict changes", () => {
		const snapshot = {
			tpPrice: "110",
			tpOrderId: 1,
			tpSize: "1",
			tpIsMarket: false,
			tpLimitPrice: "109",
			tpSide: "A" as const,
			slPrice: "90",
			slOrderId: 2,
			slSize: "1",
			slIsMarket: false,
			slLimitPrice: "89",
			slSide: "A" as const,
		};

		expect(areTpSlOrderInfosEqual(snapshot, { ...snapshot, tpPrice: "111" })).toBe(false);
		expect(areTpSlOrderInfosEqual(snapshot, { ...snapshot, slOrderId: 3 })).toBe(false);
		expect(areTpSlOrderInfosEqual(snapshot, { ...snapshot, tpSize: "2" })).toBe(false);
		expect(areTpSlOrderInfosEqual(snapshot, { ...snapshot, tpIsMarket: true })).toBe(false);
		expect(areTpSlOrderInfosEqual(snapshot, { ...snapshot, slLimitPrice: "88" })).toBe(false);
		expect(areTpSlOrderInfosEqual(snapshot, { ...snapshot, tpSide: "B" })).toBe(false);
		expect(areTpSlOrderInfosEqual(snapshot, { ...snapshot, ambiguous: true })).toBe(false);
		expect(areTpSlOrderInfosEqual(snapshot, { ...snapshot, incompatible: true })).toBe(false);
	});
});
