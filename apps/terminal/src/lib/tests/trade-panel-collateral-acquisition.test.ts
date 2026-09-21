import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const TRADE_PANEL_SOURCE = readFileSync(
	resolve(__dirname, "../..", "components/trade/tradebox/trade-panel.tsx"),
	"utf8",
);
const TRADE_FORM_FIELDS_SOURCE = readFileSync(
	resolve(__dirname, "../..", "components/trade/tradebox/trade-form-fields.tsx"),
	"utf8",
);

describe("trade panel collateral acquisition wiring", () => {
	it("opens the existing spot swap with the resolved builder collateral route", () => {
		expect(TRADE_PANEL_SOURCE).toContain("getBuilderPerpSwapTargetToken(market, spotMarkets)");
		expect(TRADE_PANEL_SOURCE).toContain("isMarketCatalogLoading || marketCatalogError ? null");
		expect(TRADE_PANEL_SOURCE).toContain("openSwapModal(DEFAULT_QUOTE_TOKEN, swapTargetToken)");
	});

	it("hides the contextual action when balance availability is blocked", () => {
		expect(TRADE_FORM_FIELDS_SOURCE).toContain("isConnected && !isBalanceAvailabilityBlocked && swapTargetToken");
		expect(TRADE_FORM_FIELDS_SOURCE).toMatch(/aria-label=\{`\$\{t`Swap`\} \$\{swapTargetToken\}`\}/);
	});
});
