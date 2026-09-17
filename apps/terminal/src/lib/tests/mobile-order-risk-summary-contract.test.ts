import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mobileTradeView = readFileSync(
	new URL("../../components/trade/mobile/mobile-trade-view.tsx", import.meta.url),
	"utf8",
);

const summaryView = readFileSync(
	new URL("../../components/trade/mobile/mobile-trade-summary-view.tsx", import.meta.url),
	"utf8",
);
const tradeLabels = readFileSync(new URL("../../config/trade-panel-labels.ts", import.meta.url), "utf8");

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
		expect(mobileTradeView).toContain("max: t(TRADE_PANEL_LABELS.max)");
		expect(tradeLabels).toContain("max: msg`Max`");
		expect(mobileTradeView).toMatch(
			/<MobileSlippageRowView[\s\S]*?value=\{estimatedSlippageText \?\? FALLBACK_VALUE_PLACEHOLDER\}[\s\S]*?onClick=\{openSettingsDialog\}/,
		);
		expect(summaryView).toMatch(/<button\s+type="button"\s+onClick=\{onClick\}\s+aria-label=\{labels.slippage\}/);
		expect(summaryView).toContain("{slippagePercent}%");
		expect(summaryView).not.toContain("disabled=");
	});
});
