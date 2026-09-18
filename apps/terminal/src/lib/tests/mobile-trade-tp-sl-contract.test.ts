import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MOBILE_TRADE_VIEW = readFileSync(
	resolve(__dirname, "../..", "components/trade/mobile/mobile-trade-view.tsx"),
	"utf8",
);

describe("mobile pre-entry TP/SL contract", () => {
	it("uses the parent order price as the estimated entry reference", () => {
		const element = MOBILE_TRADE_VIEW.match(/<TradeFormTpSl\b[\s\S]*?\/>/)?.[0] ?? "";
		expect(element).toContain("referencePrice={price}");
		expect(element).not.toContain("referencePrice={markPx}");
	});

	it("passes fail-closed collateral metadata without adding a request path", () => {
		expect(MOBILE_TRADE_VIEW).toContain("quoteSymbol={getTpSlCollateralSymbol(market)}");
	});
});
