import { describe, expect, it, vi } from "vitest";
import {
	buildOrderPlan,
	buildPositionTpSlUpdatePlan,
	type EntryOrderIntent,
	hasPositionTpSlTriggerMutation,
	type LimitCloseIntent,
	type MarketCloseIntent,
	type PositionTpSlIntent,
} from "@/domain/trade/order-intent";
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

function positionTpSl(overrides: Partial<PositionTpSlIntent> = {}): PositionTpSlIntent {
	return {
		kind: "positionTpsl",
		assetId: 0,
		szDecimals: 2,
		isLong: true,
		tpPriceNum: 110,
		slPriceNum: 90,
		...overrides,
	};
}

function marketClose(overrides: Partial<MarketCloseIntent> = {}): MarketCloseIntent {
	return {
		kind: "marketClose",
		assetId: 0,
		signedPositionSize: "1.234",
		closeSize: "1.234",
		szDecimals: 3,
		referencePx: "100",
		slippageBps: "50",
		...overrides,
	};
}

function limitClose(overrides: Partial<LimitCloseIntent> = {}): LimitCloseIntent {
	return {
		kind: "limitClose",
		assetId: 0,
		size: "1.239",
		szDecimals: 2,
		isLong: true,
		price: "100",
		...overrides,
	};
}

describe("buildOrderPlan entry trigger guard", () => {
	it("submits a GOOGL base quantity without leverage scaling", () => {
		const plan = buildOrderPlan(
			entry({
				assetId: 110001,
				orderType: "market",
				sizeValue: 5,
				szDecimals: 3,
				markPx: 341,
				price: 341,
			}),
		);

		expect(plan.orders[0]).toMatchObject({
			a: 110001,
			b: true,
			s: "5",
		});
	});

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

	it("keeps a market trigger separate from its documented execution tolerance", () => {
		const { orders } = buildOrders(
			buildParams({
				orderType: "stopMarket",
				triggerPriceInput: "95",
				limitPriceInput: "",
				usesLimitPriceForOrder: false,
			}),
		);

		expect(orders[0]?.p).toBe("104.5");
		expect(orders[0]?.t).toEqual({ trigger: { isMarket: true, triggerPx: "95", tpsl: "sl" } });
	});

	it("uses the explicit execution price for limit triggers", () => {
		const { orders } = buildOrders(buildParams({ triggerPriceInput: "95", limitPriceInput: "94" }));

		expect(orders[0]?.p).toBe("94");
		expect(orders[0]?.t).toEqual({ trigger: { isMarket: false, triggerPx: "95", tpsl: "sl" } });
	});
});

describe("attached TP/SL order planning", () => {
	it("applies the market execution tolerance without changing the trigger prices", () => {
		const plan = buildOrderPlan(
			entry({
				tpSlEnabled: true,
				tpPriceNum: 110,
				slPriceNum: 90,
			}),
		);

		expect(plan.grouping).toBe("normalTpsl");
		expect(plan.orders.slice(1)).toEqual([
			{
				a: 0,
				b: false,
				p: "99",
				s: "1",
				r: true,
				t: { trigger: { isMarket: true, triggerPx: "110", tpsl: "tp" } },
			},
			{
				a: 0,
				b: false,
				p: "81",
				s: "1",
				r: true,
				t: { trigger: { isMarket: true, triggerPx: "90", tpsl: "sl" } },
			},
		]);
	});
});

describe("position TP/SL order planning", () => {
	it("builds full-position close triggers with the documented market slippage tolerance", () => {
		const plan = buildOrderPlan(positionTpSl());

		expect(plan.grouping).toBe("positionTpsl");
		expect(plan.orders).toEqual([
			{
				a: 0,
				b: false,
				p: "99",
				s: "0",
				r: true,
				t: { trigger: { isMarket: true, triggerPx: "110", tpsl: "tp" } },
			},
			{
				a: 0,
				b: false,
				p: "81",
				s: "0",
				r: true,
				t: { trigger: { isMarket: true, triggerPx: "90", tpsl: "sl" } },
			},
		]);
	});

	it("uses the opposite close direction for a short position", () => {
		const plan = buildOrderPlan(positionTpSl({ isLong: false, tpPriceNum: 90, slPriceNum: null }));

		expect(plan.orders[0]).toEqual({
			a: 0,
			b: true,
			p: "99",
			s: "0",
			r: true,
			t: { trigger: { isMarket: true, triggerPx: "90", tpsl: "tp" } },
		});
	});

	it("modifies an existing leg and creates a missing leg", () => {
		const plan = buildPositionTpSlUpdatePlan({
			...positionTpSl({ tpPriceNum: 115 }),
			existingTpPrice: 110,
			existingTpOrderId: 7,
		});

		expect(plan.modifies).toEqual([
			{
				oid: 7,
				order: {
					a: 0,
					b: false,
					p: "103.5",
					s: "0",
					r: true,
					t: { trigger: { isMarket: true, triggerPx: "115", tpsl: "tp" } },
				},
			},
		]);
		expect(plan.orders).toHaveLength(1);
		expect(plan.cancels).toHaveLength(0);
		expect(plan.hasChanges).toBe(true);
	});

	it("cancels a cleared existing leg", () => {
		const plan = buildPositionTpSlUpdatePlan({
			...positionTpSl({ tpPriceNum: null, slPriceNum: null }),
			existingTpPrice: 110,
			existingTpOrderId: 7,
		});

		expect(plan.orders).toHaveLength(0);
		expect(plan.modifies).toHaveLength(0);
		expect(plan.cancels).toEqual([{ a: 0, o: 7 }]);
		expect(plan.hasChanges).toBe(true);
	});

	it("does not submit an unchanged existing leg", () => {
		const plan = buildPositionTpSlUpdatePlan({
			...positionTpSl({ slPriceNum: null }),
			existingTpPrice: 110,
			existingTpOrderId: 7,
		});

		expect(plan.orders).toHaveLength(0);
		expect(plan.modifies).toHaveLength(0);
		expect(plan.cancels).toHaveLength(0);
		expect(plan.hasChanges).toBe(false);
	});

	it("requires a mark-price check for created and modified trigger legs", () => {
		const created = buildPositionTpSlUpdatePlan(positionTpSl({ slPriceNum: null }));
		const modified = buildPositionTpSlUpdatePlan({
			...positionTpSl({ tpPriceNum: 115, slPriceNum: null }),
			existingTpPrice: 110,
			existingTpOrderId: 7,
		});

		expect(hasPositionTpSlTriggerMutation(created, "tp")).toBe(true);
		expect(hasPositionTpSlTriggerMutation(created, "sl")).toBe(false);
		expect(hasPositionTpSlTriggerMutation(modified, "tp")).toBe(true);
	});

	it("does not require a mark-price check for a cancel-only plan", () => {
		const cancelled = buildPositionTpSlUpdatePlan({
			...positionTpSl({ tpPriceNum: null, slPriceNum: null }),
			existingTpPrice: 110,
			existingTpOrderId: 7,
		});

		expect(cancelled.cancels).toEqual([{ a: 0, o: 7 }]);
		expect(hasPositionTpSlTriggerMutation(cancelled, "tp")).toBe(false);
		expect(hasPositionTpSlTriggerMutation(cancelled, "sl")).toBe(false);
	});
});

describe("market close order planning", () => {
	it("builds a reduce-only FrontendMarket sell from a positive signed position", () => {
		const plan = buildOrderPlan(marketClose());

		expect(plan).toEqual({
			orders: [
				{
					a: 0,
					b: false,
					p: "99.5",
					s: "1.234",
					r: true,
					t: { limit: { tif: "FrontendMarket" } },
				},
			],
			grouping: "na",
			errors: [],
			warnings: [],
		});
	});

	it("derives a buy close from a negative signed position without losing string precision", () => {
		const plan = buildOrderPlan(
			marketClose({
				signedPositionSize: "-12345678901234567890.123456",
				closeSize: "12345678901234567890.123456",
				szDecimals: 6,
			}),
		);

		expect(plan.orders[0]).toMatchObject({
			b: true,
			p: "100",
			s: "12345678901234567890.123456",
			r: true,
			t: { limit: { tif: "FrontendMarket" } },
		});
	});

	it("floors a partial manual close to size precision", () => {
		const plan = buildOrderPlan(
			marketClose({
				signedPositionSize: "2",
				closeSize: "1.239",
				szDecimals: 2,
			}),
		);

		expect(plan.orders[0]?.s).toBe("1.23");
		expect(plan.errors).toEqual([]);
	});

	it.each([
		[marketClose({ signedPositionSize: "invalid" }), "Position size must be a non-zero number"],
		[marketClose({ closeSize: "invalid" }), "Close size must be a decimal number"],
		[marketClose({ closeSize: "1e-3" }), "Close size must be a decimal number"],
		[marketClose({ signedPositionSize: "1", closeSize: "1.1" }), "Close size exceeds current position"],
		[
			marketClose({ signedPositionSize: "1", closeSize: "0.0009", szDecimals: 3 }),
			"Close size is below market precision",
		],
		[marketClose({ referencePx: "0" }), "Market reference price must be greater than zero"],
		[marketClose({ slippageBps: "501" }), "Slippage must be between 0 and 500 basis points"],
	] as const)("fails closed for an invalid market-close intent", (intent, error) => {
		const plan = buildOrderPlan(intent);

		expect(plan.orders).toEqual([]);
		expect(plan.grouping).toBe("na");
		expect(plan.errors).toContain(error);
	});
});

describe("limit close order planning", () => {
	it("builds an opposite-side reduce-only GTC order", () => {
		const longClose = buildOrderPlan(limitClose());
		const shortClose = buildOrderPlan(limitClose({ isLong: false }));

		expect(longClose).toEqual({
			orders: [
				{
					a: 0,
					b: false,
					p: "100",
					s: "1.23",
					r: true,
					t: { limit: { tif: "Gtc" } },
				},
			],
			grouping: "na",
			errors: [],
			warnings: [],
		});
		expect(shortClose.orders[0]?.b).toBe(true);
	});

	it("preserves string precision before applying protocol formatting", () => {
		const plan = buildOrderPlan(
			limitClose({
				assetId: 10001,
				size: "12345678901234567890.123",
				szDecimals: 3,
				price: "0.1234567890123456789",
			}),
		);

		expect(plan.errors).toEqual([]);
		expect(plan.orders[0]).toMatchObject({
			a: 10001,
			p: "0.12346",
			s: "12345678901234567890.123",
		});
	});

	it.each([
		[limitClose({ assetId: -1 }), "Asset id must be a non-negative integer"],
		[limitClose({ assetId: Number.MAX_SAFE_INTEGER + 1 }), "Asset id must be a non-negative integer"],
		[limitClose({ szDecimals: -1 }), "Size decimals must be an integer between 0 and 6"],
		[limitClose({ szDecimals: 1.5 }), "Size decimals must be an integer between 0 and 6"],
		[limitClose({ szDecimals: 7 }), "Size decimals must be an integer between 0 and 6"],
		[limitClose({ assetId: 10001, szDecimals: 9 }), "Size decimals must be an integer between 0 and 8"],
		[limitClose({ price: "invalid" }), "Limit price must be greater than zero"],
		[limitClose({ price: "0" }), "Limit price must be greater than zero"],
		[limitClose({ price: "-1" }), "Limit price must be greater than zero"],
		[limitClose({ size: "invalid" }), "Close size must be greater than zero"],
		[limitClose({ size: "0" }), "Close size must be greater than zero"],
		[limitClose({ size: "-1" }), "Close size must be greater than zero"],
		[limitClose({ price: "0.1", szDecimals: 6 }), "Limit price is below market precision"],
		[limitClose({ size: "0.0009", szDecimals: 3 }), "Close size is below market precision"],
	] as const)("fails closed for an invalid limit-close intent", (intent, error) => {
		const plan = buildOrderPlan(intent);

		expect(plan.orders).toEqual([]);
		expect(plan.grouping).toBe("na");
		expect(plan.errors).toContain(error);
	});
});
