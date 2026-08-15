import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getInputClassName, mobileSafeInputStyles } from "@/components/ui/input";

const TEST_DIR = __dirname;
const MOBILE_TRADE_VIEW = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/mobile/mobile-trade-view.tsx"),
	"utf8",
);
const MOBILE_TRADE_SIZE_CONTROL = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/mobile/mobile-trade-size-control.tsx"),
	"utf8",
);
const MOBILE_TRADE_PRICE_FIELD = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/mobile/mobile-trade-price-field.tsx"),
	"utf8",
);
const TRADE_FORM_SCALE = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/tradebox/trade-form-scale.tsx"),
	"utf8",
);
const TRADE_FORM_TWAP = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/tradebox/trade-form-twap.tsx"),
	"utf8",
);
const TP_SL_SECTION = readFileSync(resolve(TEST_DIR, "../..", "components/trade/tradebox/tp-sl-section.tsx"), "utf8");
const SPOT_SWAP_MODAL = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/components/spot-swap-modal.tsx"),
	"utf8",
);

function countMobileSafeInputs(source: string): number {
	return source.match(/\bmobileSafe\b/g)?.length ?? 0;
}

function countTradeInputs(source: string): number {
	return source.match(/<(NumberInput|PriceInput)\b/g)?.length ?? 0;
}

function countForwardedMobileSafe(source: string): number {
	return source.match(/mobileSafe=\{mobileSafe\}/g)?.length ?? 0;
}

describe("mobile input zoom contract", () => {
	it("raises only mobile input text to the iOS-safe size", () => {
		const className = getInputClassName("lg", undefined, true);

		expect(className).toContain("h-9 text-sm");
		expect(className).toContain(mobileSafeInputStyles);
	});

	it("covers every mobile order-entry price and size input", () => {
		expect(countMobileSafeInputs(MOBILE_TRADE_SIZE_CONTROL)).toBe(2);
		expect(countMobileSafeInputs(MOBILE_TRADE_PRICE_FIELD)).toBe(1);
		expect(MOBILE_TRADE_VIEW).toContain("<MobileTradeSizeControl");
		expect(MOBILE_TRADE_VIEW).toContain("<MobileTradePriceField");
		expect(MOBILE_TRADE_VIEW).not.toContain("<NumberInput");
		expect(MOBILE_TRADE_VIEW).not.toContain("<PriceInput");
		expect(MOBILE_TRADE_VIEW).toContain("disabled={isFormDisabled || maxSize <= 0}");
		expect(countMobileSafeInputs(TP_SL_SECTION)).toBe(15);
	});

	it("covers the shared scale and twap fields the mobile panel reuses", () => {
		expect(countTradeInputs(TRADE_FORM_SCALE)).toBe(4);
		expect(countForwardedMobileSafe(TRADE_FORM_SCALE)).toBe(countTradeInputs(TRADE_FORM_SCALE));
		expect(countTradeInputs(TRADE_FORM_TWAP)).toBe(4);
		expect(countForwardedMobileSafe(TRADE_FORM_TWAP)).toBe(countTradeInputs(TRADE_FORM_TWAP));
		expect(MOBILE_TRADE_VIEW).toMatch(/<TradeFormTwap[\s\S]{0,300}mobileSafe/);
		expect(MOBILE_TRADE_VIEW).toMatch(/<TradeFormScale[\s\S]{0,300}mobileSafe/);
	});

	it("covers the responsive spot swap amount input", () => {
		expect(countMobileSafeInputs(SPOT_SWAP_MODAL)).toBe(1);
	});
});
