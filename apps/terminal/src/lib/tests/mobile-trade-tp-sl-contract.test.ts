import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MOBILE_TRADE_VIEW = readFileSync(
	resolve(__dirname, "../..", "components/trade/mobile/mobile-trade-view.tsx"),
	"utf8",
);

describe("mobile pre-entry TP/SL contract", () => {
	it("uses the parent order price as the estimated entry reference", () => {
		expect(MOBILE_TRADE_VIEW).toMatch(/<TradeFormTpSl[\s\S]{0,160}referencePrice=\{price\}/);
		expect(MOBILE_TRADE_VIEW).not.toMatch(/<TradeFormTpSl[\s\S]{0,160}referencePrice=\{markPx\}/);
	});

	it("passes fail-closed collateral metadata without adding a request path", () => {
		expect(MOBILE_TRADE_VIEW).toContain("quoteSymbol={getTpSlCollateralSymbol(market)}");
	});
});
