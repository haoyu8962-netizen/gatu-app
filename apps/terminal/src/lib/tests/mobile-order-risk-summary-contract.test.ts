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
	it("estimates prospective liquidation only for ordinary leveraged orders", () => {
		expect(mobileTradeView).toMatch(
			/\{capabilities\.isLeveraged && \(\s*<MobileSummaryRowView\s+label=\{t`Liq\. Price`\}/,
		);
		expect(mobileTradeView).toMatch(/dataReady:\s*\(orderType === "market" \|\| orderType === "limit"\) &&/);
		expect(mobileTradeView).toContain("estimateProspectiveLiquidation({");
		expect(mobileTradeView).toContain("canEstimateProspectiveLiquidationDraft({");
		expect(mobileTradeView).toContain('valueClass={liqWarning ? "text-trading-panel-error" : undefined}');
	});

	it("shows N/A in the value colour for every empty summary value, as the official mobile form does", () => {
		const summaryBlock = mobileTradeView.slice(
			mobileTradeView.indexOf("<MobileTradeSummaryView"),
			mobileTradeView.indexOf("</MobileTradeSummaryView>"),
		);
		expect(summaryBlock).toContain("<MobileSummaryRowView");
		expect(mobileTradeView).toContain("const notApplicable = t`N/A`;");
		expect(mobileTradeView).not.toContain("FALLBACK_VALUE_PLACEHOLDER");
		expect(summaryBlock).not.toContain("text-trading-panel-muted");
		expect(mobileTradeView).toMatch(
			/label=\{t`Order Value`\}\s+value=\{formatSummaryAmount\(orderValue, priceUnitLabel, numberFormat, notApplicable\)\}/,
		);
		expect(mobileTradeView).toMatch(
			/label=\{t`Margin Req\.`\}\s+value=\{formatSummaryAmount\(marginRequired, priceUnitLabel, numberFormat, notApplicable\)\}/,
		);
	});

	it("writes amounts in the collateral unit and the liquidation price as a plain price", () => {
		expect(mobileTradeView).toContain("numberFormat.formatToken(value, { decimals: 2, symbol })");
		expect(mobileTradeView).toContain('numberFormat.formatPrice(value, { szDecimals, marketType, style: "decimal" })');
		expect(mobileTradeView).not.toContain("formatUSD(");
	});

	it("combines estimated and editable maximum slippage for market orders", () => {
		expect(mobileTradeView).toContain("useMarketSlippageEstimate(");
		expect(mobileTradeView).toContain('orderType === "market"');
		expect(mobileTradeView).toContain("estimatedSlippageText");
		expect(mobileTradeView).toContain("t`Est. Slippage`");
		expect(mobileTradeView).toContain("max: t(TRADE_PANEL_LABELS.max)");
		expect(tradeLabels).toContain("max: msg`Max`");
		expect(mobileTradeView).toMatch(
			/<MobileSlippageRowView[\s\S]*?value=\{formatEstimatedSlippage\(estimatedSlippageText, sizeValue, numberFormat, notApplicable\)\}[\s\S]*?onClick=\{openSlippageDialog\}/,
		);
		expect(mobileTradeView).toMatch(/return size > 0 \? emptyLabel : `\$\{numberFormat\.formatNumber\(0\)\}%`;/);
		expect(summaryView).toMatch(/<button\s+type="button"\s+onClick=\{onClick\}\s+aria-label=\{labels.slippage\}/);
		expect(summaryView).toContain('<span className="text-signal">{slippagePercent}%</span>');
		expect(summaryView).not.toContain("text-trading-panel-error");
		expect(summaryView).not.toContain("disabled=");
	});

	it("edits the max slippage on its own panel instead of the settings dialog", () => {
		expect(mobileTradeView).not.toContain("useSettingsDialogActions");
		expect(mobileTradeView).toMatch(
			/<LazyDialogHost open=\{showSlippageDialog\} onOpenChange=\{setShowSlippageDialog\} presentation="drawer">\s*<MaxSlippageModal/,
		);
	});

	it("leaves the fee estimate out of the mobile summary, as the official mobile form does", () => {
		expect(mobileTradeView).not.toContain("OrderFeeSummaryValue");
		expect(mobileTradeView).not.toContain("estimatedFee");
	});
});
