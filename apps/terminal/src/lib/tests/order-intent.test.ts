import { describe, expect, it, vi } from "vitest";
import { buildOrderPlan, type EntryOrderIntent } from "@/domain/trade/order-intent";
import { buildOrders, type OrderBuildParams } from "@/domain/trade/orders";

vi.mock("@lingui/core/macro", () => ({
	msg: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
		if (typeof strings === "string") return strings;
		return strings.reduce((message, part, index) => `${message}${part}${values[index] ?? ""}`, "");
	},
	t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
		if (typeof strings === "string") return strings;
		return strings.reduce((message, part, index) => `${message}${part}${values[index] ?? ""}`, "");
	},
}));

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

function buildParams(overrides: Partial<OrderBuildParams>): OrderBuildParams {
	return {
		assetId: 0,
		side: "buy",
		orderType: "stopLimit",
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
		isStopOrder: true,
		isTriggerOrder: true,
		isScaleOrder: false,
		usesLimitPriceForOrder: true,
		...overrides,
	};
}

describe("buildOrderPlan entry trigger guard", () => {
	it("rejects a stop-limit order with an empty trigger price instead of building triggerPx 0", () => {
		const plan = buildOrderPlan(entry({ orderType: "stopLimit", limitPriceInput: "100", triggerPriceInput: "" }));
		expect(plan.orders).toHaveLength(0);
		expect(plan.errors).toContain("Enter trigger price");
	});

	it("rejects a stop-market order with a zero trigger price", () => {
		const plan = buildOrderPlan(entry({ orderType: "stopMarket", triggerPriceInput: "0" }));
		expect(plan.orders).toHaveLength(0);
		expect(plan.errors).toContain("Enter trigger price");
	});

	it("rejects a take-profit-limit order with an empty trigger price", () => {
		const plan = buildOrderPlan(entry({ orderType: "takeProfitLimit", limitPriceInput: "100", triggerPriceInput: "" }));
		expect(plan.orders).toHaveLength(0);
		expect(plan.errors).toContain("Enter trigger price");
	});

	it("rejects a take-profit-market order with an empty trigger price", () => {
		const plan = buildOrderPlan(entry({ orderType: "takeProfitMarket", triggerPriceInput: "" }));
		expect(plan.orders).toHaveLength(0);
		expect(plan.errors).toContain("Enter trigger price");
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

describe("buildOrders low-level trigger guard", () => {
	it("throws instead of formatting an empty trigger price to 0", () => {
		expect(() => buildOrders(buildParams({ triggerPriceInput: "" }))).toThrow();
	});

	it("throws on a zero or negative trigger price", () => {
		expect(() => buildOrders(buildParams({ triggerPriceInput: "0" }))).toThrow();
		expect(() => buildOrders(buildParams({ triggerPriceInput: "-5" }))).toThrow();
	});

	it("throws when a stop-limit order is missing its limit price", () => {
		expect(() => buildOrders(buildParams({ triggerPriceInput: "95", limitPriceInput: "" }))).toThrow();
	});

	it("builds a valid trigger order with a positive trigger price", () => {
		const { orders } = buildOrders(buildParams({ triggerPriceInput: "95" }));
		expect(orders.length).toBeGreaterThan(0);
		expect(orders[0]?.p).not.toBe("0");
	});
});
