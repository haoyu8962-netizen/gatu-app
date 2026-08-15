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

describe("mobile order safety contract", () => {
	it("normalizes unsupported algorithmic intents and blocks them at submit", () => {
		expect(mobileTradeView).toContain(
			"const isUnsupportedMobileAlgoOrder = isTwapOrderType(orderType) || isScaleOrderType(orderType)",
		);
		expect(mobileTradeView).toContain('if (active && isUnsupportedMobileAlgoOrder) setOrderType("market")');
		expect(mobileTradeView).toContain("if (isUnsupportedMobileAlgoOrder) return");
	});

	it("clears reduce-only together with the other inputs after a submitted order", () => {
		expect(mobileTradeView).toMatch(
			/function resetSubmittedForm\(\) \{\s*setSizeInput\(""\);\s*setLimitPriceInput\(""\);\s*setReduceOnly\(false\);\s*setTpPrice\(""\);\s*setSlPrice\(""\);\s*setTriggerPrice\(""\);\s*\}/,
		);
		expect(mobileTradeView).toMatch(/submission\.state === "reconciling"\) \{\s*resetSubmittedForm\(\);/);
		expect(mobileTradeView).toMatch(
			/status: "success", outcome: deriveOrderOutcome\(statuses\) \}\);\s*resetSubmittedForm\(\);/,
		);
		expect(mobileTradeView).toMatch(/status: "partial",[\s\S]*?\}\);\s*resetSubmittedForm\(\);/);
		expect(mobileTradeView).not.toMatch(/setSizeInput\(""\);\s*setLimitPriceInput\(""\);\s*setTpPrice/);
	});

	it("does not advertise a create action that the mobile signer cannot encode", () => {
		expect(mobileTwapTab).not.toContain('setOrderType("twap")');
		expect(mobileTwapTab).not.toContain("Create TWAP");
	});
});
