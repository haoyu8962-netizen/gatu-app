import { describe, expect, it } from "vitest";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import {
	buildOrderConfirmationRows,
	type OrderConfirmationDraft,
	type OrderConfirmationRow,
} from "@/domain/trade/order-confirmation";
import { buildOrderFeeQuote } from "@/domain/trade/order-fee-quote";

const BASE_DRAFT: OrderConfirmationDraft = {
	assetId: 0,
	marketLabel: "BTC-USD",
	marketKind: "perp",
	isLeveraged: true,
	side: "buy",
	sideLabel: "Buy / Long",
	orderType: "market",
	tif: "Gtc",
	baseToken: "BTC",
	szDecimals: 4,
	sizeValue: 0.5,
	orderValue: 50_000,
	limitPrice: null,
	triggerPrice: null,
	scaleStartPrice: null,
	scaleEndPrice: null,
	scaleLevels: null,
	scaleSkew: null,
	twapMinutes: null,
	twapRandomize: false,
	twapTriggerPrice: null,
	twapStopPrice: null,
	tpSlEnabled: false,
	tpPrice: null,
	slPrice: null,
	reduceOnly: false,
	leverage: 10,
	marginMode: "cross",
	marginRequired: 5_000,
	feeQuote: buildOrderFeeQuote({
		orderValue: 50_000,
		protocolRate: 0.00045,
		builderFeeTenthsBps: 10,
		marketKind: "perp",
		side: "buy",
		execution: "order",
	}),
	liqPrice: 90_000,
	liqWarning: false,
	slippagePercent: 2.5,
};

function draft(overrides: Partial<OrderConfirmationDraft>): OrderConfirmationDraft {
	return { ...BASE_DRAFT, ...overrides };
}

function byKey(rows: OrderConfirmationRow[], key: string): OrderConfirmationRow | undefined {
	return rows.find((row) => row.key === key);
}

describe("buildOrderConfirmationRows", () => {
	it("describes a perp market order with slippage and the leveraged cost block", () => {
		const rows = buildOrderConfirmationRows(BASE_DRAFT);

		expect(rows.map((row) => row.key)).toEqual([
			"market",
			"side",
			"orderType",
			"size",
			"price",
			"slippage",
			"leverage",
			"orderValue",
			"marginRequired",
			"liqPrice",
			"fee",
		]);
		expect(byKey(rows, "market")?.value).toBe("BTC-USD");
		expect(byKey(rows, "orderType")?.value).toBe("Market");
		expect(byKey(rows, "price")?.value).toBe("Market");
		expect(byKey(rows, "slippage")?.value).toBe("2.5%");
		expect(byKey(rows, "size")?.value).toBe("0.5000 BTC ($50,000.00)");
		expect(byKey(rows, "leverage")?.value).toBe("Cross · 10x");
		expect(byKey(rows, "marginRequired")?.value).toBe("$5,000.00");
		expect(byKey(rows, "fee")?.value).toBe("0.0550% ($27.50)");
		expect(byKey(rows, "protocolFee")).toBeUndefined();
		expect(byKey(rows, "gatuFee")).toBeUndefined();
	});

	it("colors the side row by direction", () => {
		expect(byKey(buildOrderConfirmationRows(BASE_DRAFT), "side")?.tone).toBe("up");
		expect(byKey(buildOrderConfirmationRows(draft({ side: "sell", sideLabel: "Sell / Short" })), "side")).toEqual({
			key: "side",
			label: "Side",
			value: "Sell / Short",
			tone: "down",
		});
	});

	it("shows the limit price with its time in force and no slippage", () => {
		const rows = buildOrderConfirmationRows(draft({ orderType: "limit", tif: "Alo", limitPrice: 99_000 }));

		expect(byKey(rows, "orderType")?.value).toBe("Limit · Post Only");
		expect(byKey(rows, "price")?.value).toBe("$99,000");
		expect(byKey(rows, "slippage")).toBeUndefined();
	});

	it("shows the trigger price plus the resting limit price for stop-limit orders", () => {
		const rows = buildOrderConfirmationRows(
			draft({ orderType: "stopLimit", triggerPrice: 95_000, limitPrice: 94_500 }),
		);

		expect(byKey(rows, "orderType")?.value).toBe("Stop Limit");
		expect(byKey(rows, "trigger")?.value).toBe("$95,000");
		expect(byKey(rows, "price")?.value).toBe("$94,500");
	});

	it("marks trigger-market orders as executing at market", () => {
		const rows = buildOrderConfirmationRows(draft({ orderType: "takeProfitMarket", triggerPrice: 105_000 }));

		expect(byKey(rows, "orderType")?.value).toBe("Take Profit Market");
		expect(byKey(rows, "trigger")?.value).toBe("$105,000");
		expect(byKey(rows, "price")?.value).toBe("Market");
		expect(byKey(rows, "slippage")).toBeUndefined();
	});

	it("describes the scale ladder instead of a single price", () => {
		const rows = buildOrderConfirmationRows(
			draft({
				orderType: "scale",
				scaleStartPrice: 90_000,
				scaleEndPrice: 100_000,
				scaleLevels: 5,
				scaleSkew: 2,
			}),
		);

		expect(byKey(rows, "scaleStart")?.value).toBe("$90,000");
		expect(byKey(rows, "scaleEnd")?.value).toBe("$100,000");
		expect(byKey(rows, "scaleLevels")?.value).toBe("5");
		expect(byKey(rows, "scaleSkew")?.value).toBe("2");
		expect(byKey(rows, "price")).toBeUndefined();
	});

	it("describes the twap schedule including its optional trigger and stop prices", () => {
		const rows = buildOrderConfirmationRows(
			draft({
				orderType: "twap",
				twapMinutes: 90,
				twapRandomize: true,
				twapTriggerPrice: 101_000,
				twapStopPrice: 102_000,
			}),
		);

		expect(byKey(rows, "price")?.value).toBe("Market");
		expect(byKey(rows, "twapRuntime")?.value).toBe("1h 30m");
		expect(byKey(rows, "twapRandomize")?.value).toBe("Yes");
		expect(byKey(rows, "twapTrigger")?.value).toBe("$101,000");
		expect(byKey(rows, "twapStop")).toEqual({ key: "twapStop", label: "Max Price", value: "$102,000" });
	});

	it("adds take-profit and stop-loss rows only when they carry prices", () => {
		const withBoth = buildOrderConfirmationRows(draft({ tpSlEnabled: true, tpPrice: 110_000, slPrice: 90_000 }));
		const withNeither = buildOrderConfirmationRows(draft({ tpSlEnabled: true }));
		const disabled = buildOrderConfirmationRows(draft({ tpSlEnabled: false, tpPrice: 110_000, slPrice: 90_000 }));

		expect(byKey(withBoth, "takeProfit")?.value).toBe("$110,000");
		expect(byKey(withBoth, "stopLoss")?.value).toBe("$90,000");
		expect(byKey(withNeither, "takeProfit")).toBeUndefined();
		expect(byKey(disabled, "takeProfit")).toBeUndefined();
		expect(byKey(disabled, "stopLoss")).toBeUndefined();
	});

	it("surfaces reduce-only only when the order carries the flag", () => {
		expect(byKey(buildOrderConfirmationRows(draft({ reduceOnly: true })), "reduceOnly")?.value).toBe("Yes");
		expect(byKey(buildOrderConfirmationRows(BASE_DRAFT), "reduceOnly")).toBeUndefined();
	});

	it("drops leverage and margin rows on spot markets", () => {
		const rows = buildOrderConfirmationRows(draft({ marketKind: "spot", isLeveraged: false, leverage: null }));

		expect(byKey(rows, "leverage")).toBeUndefined();
		expect(byKey(rows, "marginRequired")).toBeUndefined();
		expect(byKey(rows, "liqPrice")).toBeUndefined();
		expect(byKey(rows, "orderValue")?.value).toBe("$50,000.00");
	});

	it("flags a liquidation price that sits too close to the entry", () => {
		expect(byKey(buildOrderConfirmationRows(draft({ liqWarning: true })), "liqPrice")?.tone).toBe("down");
		expect(byKey(buildOrderConfirmationRows(draft({ liqWarning: true, liqPrice: null })), "liqPrice")).toEqual({
			key: "liqPrice",
			label: "Liq. Price",
			value: FALLBACK_VALUE_PLACEHOLDER,
			tone: undefined,
		});
	});

	it("shows the price the exchange will receive, not the display rounding", () => {
		const rows = buildOrderConfirmationRows(
			draft({ orderType: "limit", szDecimals: 3, limitPrice: 60_123.456, tpSlEnabled: true, tpPrice: 61_234.567 }),
		);

		expect(byKey(rows, "price")?.value).toBe("$60,123");
		expect(byKey(rows, "takeProfit")?.value).toBe("$61,235");
	});

	it("shows the size the exchange will receive, rounded down to szDecimals", () => {
		const rows = buildOrderConfirmationRows(draft({ sizeValue: 0.11119, orderValue: 0 }));

		expect(byKey(rows, "size")?.value).toBe("0.1111 BTC");
	});

	it("falls back to placeholders and the bare fee rate for an empty draft", () => {
		const rows = buildOrderConfirmationRows(
			draft({
				sizeValue: 0,
				orderValue: 0,
				marginRequired: 0,
				leverage: 0,
				feeQuote: buildOrderFeeQuote({
					orderValue: 0,
					protocolRate: 0.00045,
					builderFeeTenthsBps: 10,
					marketKind: "perp",
					side: "buy",
					execution: "order",
				}),
			}),
		);

		expect(byKey(rows, "size")?.value).toBe(FALLBACK_VALUE_PLACEHOLDER);
		expect(byKey(rows, "orderValue")?.value).toBe(FALLBACK_VALUE_PLACEHOLDER);
		expect(byKey(rows, "marginRequired")?.value).toBe(FALLBACK_VALUE_PLACEHOLDER);
		expect(byKey(rows, "leverage")?.value).toBe(`Cross · ${FALLBACK_VALUE_PLACEHOLDER}`);
		expect(byKey(rows, "fee")?.value).toBe("0.0550%");
		expect(byKey(rows, "protocolFee")).toBeUndefined();
		expect(byKey(rows, "gatuFee")).toBeUndefined();
	});
});
