import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mobileTradeView = readFileSync(
	new URL("../../components/trade/mobile/mobile-trade-view.tsx", import.meta.url),
	"utf8",
);

describe("mobile order risk summary contract", () => {
	it("shows prospective liquidation only for ordinary leveraged orders", () => {
		expect(mobileTradeView).toMatch(
			/\{capabilities\.isLeveraged && \(orderType === "market" \|\| orderType === "limit"\) && \([\s\S]*?label=\{t`Liq\. Price`\}/,
		);
		expect(mobileTradeView).toContain("estimateProspectiveLiquidation({");
		expect(mobileTradeView).toContain("canEstimateProspectiveLiquidationDraft({");
		expect(mobileTradeView).toContain("liqWarning");
		expect(mobileTradeView).toContain("FALLBACK_VALUE_PLACEHOLDER");
	});

	it("combines estimated and editable maximum slippage for market orders", () => {
		expect(mobileTradeView).toContain("useMarketSlippageEstimate(");
		expect(mobileTradeView).toContain('orderType === "market"');
		expect(mobileTradeView).toContain("estimatedSlippageText");
		expect(mobileTradeView).toContain("t`Est. Slippage`");
		expect(mobileTradeView).toContain("t`Max`");
		expect(mobileTradeView).toMatch(
			/<button\s+type="button"\s+onClick=\{openSettingsDialog\}\s+aria-label=\{t`Slippage`\}/,
		);
	});
});
