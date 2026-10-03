import { describe, expect, it, vi } from "vitest";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import {
	buildOrderConfirmationRows,
	type OrderConfirmationDraft,
	type OrderConfirmationRow,
} from "@/domain/trade/order-confirmation";
import { buildOrderFeeQuote } from "@/domain/trade/order-fee-quote";
import { getNumberFormatters } from "@/lib/format";

const numberFormatSetting = vi.hoisted(() => ({ locale: "en-US" }));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	getResolvedFormatLocale: () => numberFormatSetting.locale,
}));

const numberFormat = getNumberFormatters();

const BASE_DRAFT: OrderConfirmationDraft = {
	assetId: 0,
	marketLabel: "BTC-USD",
	marketKind: "perp",
	isLeveraged: true,
	side: "buy",
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
	it.each([
		["stopMarket", "Stop Market"],
		["stopLimit", "Stop Limit"],
		["takeProfitMarket", "Take Profit Market"],
		["takeProfitLimit", "Take Profit Limit"],
		["twap", "TWAP"],
		["scale", "Scale"],
	] as const)("uses the supplied translator for the %s order type", (orderType, label) => {
		const rows = buildOrderConfirmationRows(
			draft({ orderType }),
			numberFormat,
			(message) => `translated:${message.message}`,
		);

		expect(byKey(rows, "orderType")?.value).toBe(`translated:${label}`);
	});

	it("limits a perp market order to the action, size, price and estimated liquidation price", () => {
		const rows = buildOrderConfirmationRows(BASE_DRAFT, numberFormat);

		expect(rows.map((row) => row.key)).toEqual(["action", "size", "price", "liqPrice"]);
		expect(byKey(rows, "price")?.value).toBe("Market");
		expect(byKey(rows, "size")?.value).toBe("0.5000 BTC");
		expect(byKey(rows, "liqPrice")?.label).toBe("Estimated Liquidation Price");
	});

	it("limits a good-till-cancelled limit order to the same four rows", () => {
		const rows = buildOrderConfirmationRows(
			draft({ orderType: "limit", tif: "Gtc", limitPrice: 99_000 }),
			numberFormat,
		);

		expect(rows.map((row) => row.key)).toEqual(["action", "size", "price", "liqPrice"]);
	});

	it("colors the action and the size by direction", () => {
		const long = buildOrderConfirmationRows(BASE_DRAFT, numberFormat);
		const short = buildOrderConfirmationRows(draft({ side: "sell" }), numberFormat);

		expect(byKey(long, "action")?.tone).toBe("up");
		expect(byKey(long, "size")?.tone).toBe("up");
		expect(byKey(short, "action")).toEqual({ key: "action", label: "Action", value: "Short", tone: "down" });
		expect(byKey(short, "size")?.tone).toBe("down");
	});

	it("keeps the time in force of a limit order that is not good-till-cancelled", () => {
		const rows = buildOrderConfirmationRows(
			draft({ orderType: "limit", tif: "Alo", limitPrice: 99_000 }),
			numberFormat,
		);

		expect(byKey(rows, "orderType")?.value).toBe("Limit · Post Only");
		expect(byKey(rows, "price")?.value).toBe("$99,000");
	});

	it("shows the trigger price plus the resting limit price for stop-limit orders", () => {
		const rows = buildOrderConfirmationRows(
			draft({ orderType: "stopLimit", triggerPrice: 95_000, limitPrice: 94_500 }),
			numberFormat,
		);

		expect(byKey(rows, "orderType")?.value).toBe("Stop Limit");
		expect(byKey(rows, "trigger")?.value).toBe("$95,000");
		expect(byKey(rows, "price")?.value).toBe("$94,500");
	});

	it("marks trigger-market orders as executing at market", () => {
		const rows = buildOrderConfirmationRows(
			draft({ orderType: "takeProfitMarket", triggerPrice: 105_000 }),
			numberFormat,
		);

		expect(byKey(rows, "orderType")?.value).toBe("Take Profit Market");
		expect(byKey(rows, "trigger")?.value).toBe("$105,000");
		expect(byKey(rows, "price")?.value).toBe("Market");
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
			numberFormat,
		);

		expect(byKey(rows, "scaleStart")?.value).toBe("$90,000");
		expect(byKey(rows, "scaleEnd")?.value).toBe("$100,000");
		expect(byKey(rows, "scaleLevels")?.value).toBe("5");
		expect(byKey(rows, "scaleSkew")?.value).toBe("2");
		expect(byKey(rows, "price")).toBeUndefined();
	});

	it("writes the scale size skew with every allowed decimal and the number-format separators", () => {
		const scale = draft({
			orderType: "scale",
			scaleStartPrice: 95,
			scaleEndPrice: 105,
			scaleLevels: 12,
			scaleSkew: 1.2345,
		});
		expect(byKey(buildOrderConfirmationRows(scale, numberFormat), "scaleSkew")?.value).toBe("1.2345");

		numberFormatSetting.locale = "de-DE";
		try {
			expect(byKey(buildOrderConfirmationRows(scale, numberFormat), "scaleSkew")?.value).toBe("1,2345");
			expect(byKey(buildOrderConfirmationRows(scale, numberFormat), "scaleLevels")?.value).toBe("12");
		} finally {
			numberFormatSetting.locale = "en-US";
		}
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
			numberFormat,
		);

		expect(byKey(rows, "price")?.value).toBe("Market");
		expect(byKey(rows, "twapRuntime")?.value).toBe("1h 30m");
		expect(byKey(rows, "twapRandomize")?.value).toBe("Yes");
		expect(byKey(rows, "twapTrigger")?.value).toBe("$101,000");
		expect(byKey(rows, "twapStop")).toEqual({ key: "twapStop", label: "Max Price", value: "$102,000" });
	});

	it.each([
		{ side: "buy", label: "Max Price" },
		{ side: "sell", label: "Min Price" },
	] as const)("uses the supplied translator for a $side TWAP stop label", ({ side, label }) => {
		const rows = buildOrderConfirmationRows(
			draft({ orderType: "twap", side, twapStopPrice: 102_000 }),
			numberFormat,
			(message) => `translated:${message.message}`,
		);

		expect(byKey(rows, "twapStop")?.label).toBe(`translated:${label}`);
	});

	it("adds take-profit and stop-loss rows only when they carry prices", () => {
		const withBoth = buildOrderConfirmationRows(
			draft({ tpSlEnabled: true, tpPrice: 110_000, slPrice: 90_000 }),
			numberFormat,
		);
		const withNeither = buildOrderConfirmationRows(draft({ tpSlEnabled: true }), numberFormat);
		const disabled = buildOrderConfirmationRows(
			draft({ tpSlEnabled: false, tpPrice: 110_000, slPrice: 90_000 }),
			numberFormat,
		);

		expect(byKey(withBoth, "takeProfit")?.value).toBe("$110,000");
		expect(byKey(withBoth, "stopLoss")?.value).toBe("$90,000");
		expect(byKey(withNeither, "takeProfit")).toBeUndefined();
		expect(byKey(disabled, "takeProfit")).toBeUndefined();
		expect(byKey(disabled, "stopLoss")).toBeUndefined();
	});

	it("surfaces reduce-only only when the order carries the flag", () => {
		expect(byKey(buildOrderConfirmationRows(draft({ reduceOnly: true }), numberFormat), "reduceOnly")?.value).toBe(
			"Yes",
		);
		expect(byKey(buildOrderConfirmationRows(BASE_DRAFT, numberFormat), "reduceOnly")).toBeUndefined();
	});

	it("drops the liquidation row on spot markets", () => {
		const rows = buildOrderConfirmationRows(
			draft({ marketKind: "spot", isLeveraged: false, leverage: null }),
			numberFormat,
		);

		expect(rows.map((row) => row.key)).toEqual(["action", "size", "price"]);
		expect(byKey(rows, "action")?.value).toBe("Buy");
	});

	it("flags a liquidation price that sits too close to the entry", () => {
		expect(byKey(buildOrderConfirmationRows(draft({ liqWarning: true }), numberFormat), "liqPrice")?.tone).toBe("down");
		expect(
			byKey(buildOrderConfirmationRows(draft({ liqWarning: true, liqPrice: null }), numberFormat), "liqPrice"),
		).toEqual({
			key: "liqPrice",
			label: "Estimated Liquidation Price",
			value: FALLBACK_VALUE_PLACEHOLDER,
			tone: undefined,
		});
	});

	it("shows the price the exchange will receive, not the display rounding", () => {
		const rows = buildOrderConfirmationRows(
			draft({ orderType: "limit", szDecimals: 3, limitPrice: 60_123.456, tpSlEnabled: true, tpPrice: 61_234.567 }),
			numberFormat,
		);

		expect(byKey(rows, "price")?.value).toBe("$60,123");
		expect(byKey(rows, "takeProfit")?.value).toBe("$61,235");
	});

	it("shows the size the exchange will receive, rounded down to szDecimals", () => {
		const rows = buildOrderConfirmationRows(draft({ sizeValue: 0.11119, orderValue: 0 }), numberFormat);

		expect(byKey(rows, "size")?.value).toBe("0.1111 BTC");
	});

	it("falls back to a placeholder for an empty size", () => {
		const rows = buildOrderConfirmationRows(draft({ sizeValue: 0, orderValue: 0 }), numberFormat);

		expect(byKey(rows, "size")?.value).toBe(FALLBACK_VALUE_PLACEHOLDER);
	});
});
