import { describe, expect, it } from "vitest";
import { getHistoricalOrderPriceDisplay } from "@/lib/trade/historical-orders";

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
			kind: "price",
			price: "7.4",
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
