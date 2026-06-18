import { describe, expect, it } from "vitest";
import { buildOrderPlan, type EntryOrderIntent } from "@/domain/trade/order-intent";

function entry(overrides: Partial<EntryOrderIntent>): EntryOrderIntent {
	return {
		kind: "entry",
		assetId: 0,
		side: "buy",
		orderType: "limit",
		sizeValue: 1,
		szDecimals: 2,
		markPx: 100,
		price: 100,
		slippageBps: 50,
		reduceOnly: false,
		tif: "Gtc",
		limitPriceInput: "100",
		triggerPriceInput: "",
		scaleStartPriceInput: "",
		scaleEndPriceInput: "",
		scaleLevelsNum: null,
		tpSlEnabled: false,
		canUseTpSl: true,
		tpPriceNum: null,
		slPriceNum: null,
		...overrides,
	};
}

describe("buildOrderPlan entry trigger guard", () => {
	it("rejects a stop-limit order with an empty trigger price instead of building triggerPx 0", () => {
		const plan = buildOrderPlan(entry({ orderType: "stopLimit", limitPriceInput: "100", triggerPriceInput: "" }));
		expect(plan.orders).toHaveLength(0);
		expect(plan.errors.length).toBeGreaterThan(0);
	});

	it("rejects a stop-market order with a zero trigger price", () => {
		const plan = buildOrderPlan(entry({ orderType: "stopMarket", triggerPriceInput: "0" }));
		expect(plan.orders).toHaveLength(0);
		expect(plan.errors.length).toBeGreaterThan(0);
	});

	it("builds a stop-limit order when the trigger price is provided", () => {
		const plan = buildOrderPlan(entry({ orderType: "stopLimit", limitPriceInput: "100", triggerPriceInput: "95" }));
		expect(plan.orders.length).toBeGreaterThan(0);
		expect(plan.errors).toHaveLength(0);
	});

	it("does not require a trigger price for plain limit orders", () => {
		const plan = buildOrderPlan(entry({ orderType: "limit", triggerPriceInput: "" }));
		expect(plan.orders.length).toBeGreaterThan(0);
		expect(plan.errors).toHaveLength(0);
	});
});
