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

	it("keeps spot TWAP reachable through the guarded mobile order-entry path", () => {
		expect(tradeHeader).not.toContain("hideSpotTwap");
		expect(mobileTradeView).not.toContain("hideSpotTwap");
		expect(mobileTradeView).toContain('if (active && isSpotMarket && isTriggerOrder) setOrderType("market")');
		expect(mobileTradeView).not.toContain("isSpotMarket && (isTriggerOrder || twapOrder)");
	});

	it("clears local inputs only when the submitted session and shared draft still match", () => {
		expect(mobileTradeView).toMatch(
			/function resetSubmittedForm\(\) \{\s*setLocalSizeInput\(""\);\s*setLocalReduceOnly\(false\);\s*\}/,
		);
		expect(mobileTradeView).toMatch(/useOrderSubmit\(\{[\s\S]*?onReset: resetSubmittedForm,/);
		expect(orderSubmit).toMatch(
			/function resetSubmittedForm\(token: OrderSubmitDraftResetToken\) \{\s*if \(isExchangeSessionCurrent\(token\) && resetFormIfCurrent\(token\.orderEntry\)\) options\.onReset\?\.\(\);\s*\}/,
		);
		expect(orderSubmit).not.toMatch(/\bresetForm\(\)/);
		expect(orderSubmit.match(/\bresetSubmittedForm\(draftResetToken\);/g)).toHaveLength(4);
		expect(mobileTradeView).toMatch(
			/function setSizeInput\(value: string\) \{\s*if \(value !== sizeInput\) markDraftEdited\(\);\s*setLocalSizeInput\(value\);/,
		);
		expect(mobileTradeView).toMatch(
			/function setReduceOnlyChecked\(value: boolean\) \{\s*if \(value !== reduceOnlyChecked\) markDraftEdited\(\);\s*setLocalReduceOnly\(value\);/,
		);
	});

	it("resets the whole shared form atomically only for its matching market and revision", () => {
		const conditionalReset = orderEntryStore.match(/resetFormIfCurrent: \(token\) => \{[\s\S]*?\n\s*resetPrices:/)?.[0];
		expect(conditionalReset).toBeDefined();
		expect(conditionalReset).toMatch(
			/if \(state\.marketIdentity !== token\.marketIdentity \|\| state\.draftRevision !== token\.draftRevision\)\s*return state;/,
		);
		expect(conditionalReset).toContain("return { ...DEFAULT_FORM, draftRevision: state.draftRevision + 1 };");
		expect(conditionalReset).toContain("return reset;");

		const defaultForm = orderEntryStore.match(/const DEFAULT_FORM: FormState = \{[\s\S]*?\n\};/)?.[0] ?? "";
		for (const field of ['tif: "Gtc"', "tpSlEnabled: false", "twapMinutes: 30", "scaleLevels: 4"]) {
			expect(defaultForm).toContain(field);
		}
	});

	it("renders the shared scale and twap fields in the panel's compact field language", () => {
		expect(mobileTradeView).toMatch(/<TradeFormTwap[\s\S]*?compact\s*\n\s*mobileSafe\s*\/>/);
		expect(mobileTradeView).toMatch(/<TradeFormScale[\s\S]*?compact\s*\n\s*mobileSafe\s*\/>/);
	});

	it("does not advertise a create action that the mobile signer cannot encode", () => {
		expect(mobileTwapTab).not.toContain('setOrderType("twap")');
		expect(mobileTwapTab).not.toContain("Create TWAP");
	});

	it("keeps the slippage settings control interactive before wallet connection", () => {
		expect(mobileTradeView).not.toContain("embedded && !isConnected ?");
		expect(mobileTradeView).toMatch(
			/<button\s+type="button"\s+onClick=\{openSettingsDialog\}\s+aria-label=\{t`Slippage`\}/,
		);
	});

	it("restores mobile risk context without reviving a separate builder-fee row", () => {
		expect(mobileTradeView).toContain("t`Liq. Price`");
		expect(mobileTradeView).toContain("t`Est. Slippage`");
		expect(mobileTradeView).not.toContain("t`Builder Fee`");
		expect(mobileTradeView).toContain("t`Order Value`");
		expect(mobileTradeView).toContain("t`Margin Req.`");
		expect(mobileTradeView).toContain("t`Slippage`");
		expect(mobileTradeView).toContain("t`Est. Fee`");
	});
});
