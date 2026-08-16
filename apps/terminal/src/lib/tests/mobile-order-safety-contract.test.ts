import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mobileTradeView = readFileSync(
	new URL("../../components/trade/mobile/mobile-trade-view.tsx", import.meta.url),
	"utf8",
);
const mobileTwapTab = readFileSync(
	new URL("../../components/trade/mobile/mobile-twap-tab.tsx", import.meta.url),
	"utf8",
);
const tradeHeader = readFileSync(new URL("../../components/trade/tradebox/trade-header.tsx", import.meta.url), "utf8");
const tradeFormTwap = readFileSync(
	new URL("../../components/trade/tradebox/trade-form-twap.tsx", import.meta.url),
	"utf8",
);
const tradeFormScale = readFileSync(
	new URL("../../components/trade/tradebox/trade-form-scale.tsx", import.meta.url),
	"utf8",
);
const orderSubmit = readFileSync(new URL("../../hooks/trade/use-order-submit.ts", import.meta.url), "utf8");
const orderEntryStore = readFileSync(new URL("../../stores/use-order-entry-store.ts", import.meta.url), "utf8");

describe("mobile order safety contract", () => {
	it("submits algorithmic intents through the guarded shared submitter instead of blocking them", () => {
		expect(mobileTradeView).not.toContain("isUnsupportedMobileAlgoOrder");
		expect(mobileTradeView).toContain("assertEntryTwapExecutionAllowed(params, orderExecutionStateRef.current)");
		expect(mobileTradeView).toMatch(/useOrderSubmit\(\{\s*executionGuard,\s*twapExecutionGuard,/);
		expect(mobileTradeView).toContain("<TradeFormTwap");
		expect(mobileTradeView).toContain("<TradeFormScale");
	});

	it("validates and submits the real scale and twap fields", () => {
		expect(mobileTradeView).toMatch(/triggerPriceNum: toNumber\(triggerPrice\),\s*scaleOrder,\s*twapOrder,/);
		expect(mobileTradeView).not.toMatch(/scaleOrder: false|twapOrder: false/);
		expect(mobileTradeView).not.toMatch(/scaleStartPriceInput: ""|scaleEndPriceInput: ""|scaleSkewInput: ""/);
		expect(mobileTradeView).toMatch(
			/await confirmation\.requestSubmit\(\s*\{[\s\S]*?scaleLevelsNum,[\s\S]*?twapMinutesNum,[\s\S]*?twapTriggerPx,\s*twapStopPx,/,
		);
	});

	it("keeps the existing mobile spot TWAP product gate while desktop Spot TWAP remains supported", () => {
		expect(tradeHeader).toContain('if (isSpot && hideSpotTwap && type === "twap") return false;');
		expect(mobileTradeView).toContain("hideSpotTwap");
		expect(mobileTradeView).toContain(
			'if (active && isSpotMarket && (isTriggerOrder || twapOrder)) setOrderType("market")',
		);
	});

	it("clears reduce-only together with the other locally held inputs after a submitted order", () => {
		expect(mobileTradeView).toMatch(
			/function resetSubmittedForm\(\) \{\s*setSizeInput\(""\);\s*setLimitPriceInput\(""\);\s*setReduceOnlyChecked\(false\);\s*setTpPrice\(""\);\s*setSlPrice\(""\);\s*setTriggerPrice\(""\);\s*\}/,
		);
		expect(mobileTradeView).toMatch(/useOrderSubmit\(\{[\s\S]*?onReset: resetSubmittedForm,/);
		expect(orderSubmit).toMatch(/function resetSubmittedForm\(\) \{\s*resetForm\(\);\s*options\.onReset\?\.\(\);\s*\}/);
		expect(orderSubmit.match(/\bresetForm\(\);/g)).toHaveLength(1);
		expect(orderSubmit.match(/\bresetSubmittedForm\(\);/g)).toHaveLength(4);
	});

	it("resets the whole shared order-entry form on mobile, matching desktop parity", () => {
		expect(orderEntryStore).toContain("resetForm: () => set({ ...DEFAULT_FORM })");

		const defaultForm = orderEntryStore.match(/const DEFAULT_FORM: FormState = \{[\s\S]*?\n\};/)?.[0] ?? "";
		for (const field of ['tif: "Gtc"', "tpSlEnabled: false", "twapMinutes: 30", "scaleLevels: 4"]) {
			expect(defaultForm).toContain(field);
		}
	});

	it("renders the shared scale and twap fields in the panel's compact field language", () => {
		expect(mobileTradeView).toMatch(/<TradeFormTwap[\s\S]*?compact\s*\n\s*mobileSafe\s*\/>/);
		expect(mobileTradeView).toMatch(/<TradeFormScale[\s\S]*?compact\s*\n\s*mobileSafe\s*\/>/);
		expect(tradeFormTwap).toContain('const compactFrameClass = "h-8 px-2.5";');
		expect(tradeFormTwap).toContain("const fieldInputClass = cn(inputClass, compact && compactInputClass);");
		expect(tradeFormScale).toContain('cn(tradingInputFrameClass, "h-8 px-2.5", disabled && "opacity-50")');
		expect(tradeFormScale).toContain("onMidClick={compact ? undefined : setScaleStart}");
		expect(tradeFormScale).toContain("onMidClick={compact ? undefined : setScaleEnd}");
		expect(tradeFormScale).toContain("text-trading-panel-success");
	});

	it("does not advertise a create action that the mobile signer cannot encode", () => {
		expect(mobileTwapTab).not.toContain('setOrderType("twap")');
		expect(mobileTwapTab).not.toContain("Create TWAP");
	});
});
