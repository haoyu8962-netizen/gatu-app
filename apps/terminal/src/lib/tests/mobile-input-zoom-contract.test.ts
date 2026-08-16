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
const GLOBAL_SETTINGS_MODAL = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/components/global-settings-modal.tsx"),
	"utf8",
);
const TRANSFER_MODAL = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/positions/transfer-modal.tsx"),
	"utf8",
);
const SEND_MODAL = readFileSync(resolve(TEST_DIR, "../..", "components/trade/positions/send-modal.tsx"), "utf8");
const STAKING_ACTION_MODAL = readFileSync(
	resolve(TEST_DIR, "../..", "components/staking/staking-action-modal.tsx"),
	"utf8",
);
const VAULT_ACTION_MODAL = readFileSync(resolve(TEST_DIR, "../..", "components/vaults/vault-action-modal.tsx"), "utf8");
const MOBILE_ORDER_MODIFICATION_MODAL = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/mobile/mobile-order-modification-modal.tsx"),
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

	it("covers mobile settings and funds-action inputs without changing desktop typography", () => {
		expect(countMobileSafeInputs(GLOBAL_SETTINGS_MODAL)).toBe(1);
		expect(countMobileSafeInputs(TRANSFER_MODAL)).toBe(1);
		expect(countMobileSafeInputs(SEND_MODAL)).toBe(2);
		expect(countMobileSafeInputs(STAKING_ACTION_MODAL)).toBe(1);
		expect(countMobileSafeInputs(VAULT_ACTION_MODAL)).toBe(1);
		expect(GLOBAL_SETTINGS_MODAL).toContain("max-[1000px]:h-8");
		expect(TRANSFER_MODAL).toContain("max-[1000px]:h-11");
		expect(SEND_MODAL).toContain("max-[1000px]:min-h-11");
		expect(STAKING_ACTION_MODAL).toContain("max-[1000px]:min-h-11");
		expect(VAULT_ACTION_MODAL).toContain("max-[1000px]:min-h-11");
	});

	it("uses iOS-safe text for the native mobile order modification inputs", () => {
		expect(MOBILE_ORDER_MODIFICATION_MODAL.match(/<input/g)).toHaveLength(2);
		expect(
			MOBILE_ORDER_MODIFICATION_MODAL.match(
				/className="min-w-0 flex-1 border-0 bg-transparent py-2\.5 text-right text-base/g,
			),
		).toHaveLength(2);
		expect(MOBILE_ORDER_MODIFICATION_MODAL).not.toMatch(/<input[\s\S]{0,500}text-sm/);
	});
});
