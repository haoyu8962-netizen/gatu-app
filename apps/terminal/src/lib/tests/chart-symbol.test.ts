import { describe, expect, it } from "vitest";
import { coinFromSymbolName, isChartDisplaySymbolName, normalizeChartSymbolKey } from "@/lib/chart/symbol";

describe("chart symbol helpers", () => {
	it.each([
		["BTC/USDC", "BTC"],
		["HYPERLIQUID:SOL/USDC", "SOL"],
		["ETH/USDH", "ETH"],
		["@235", "@235"],
		["xyz:KR200/USDC", "xyz:KR200"],
		["HYPERLIQUID:xyz:KR200/USDC", "xyz:KR200"],
		["hyna:XPL/USDC", "hyna:XPL"],
		["XYZ:CXMT", "XYZ:CXMT"],
	])("maps %s to API coin %s", (symbolName, coin) => {
		expect(coinFromSymbolName(symbolName)).toBe(coin);
	});

	it("normalizes lookup keys without changing API symbol casing", () => {
		expect(normalizeChartSymbolKey(" Hyperliquid:xyz:CXMT ")).toBe("HYPERLIQUID:XYZ:CXMT");
		expect(coinFromSymbolName("XYZ:CXMT")).toBe("XYZ:CXMT");
	});

	it.each(["CXMT-USDC", "HYPERLIQUID:CXMT-USDC", "ETH/USDH"])("identifies %s as a display symbol", (symbol) => {
		expect(isChartDisplaySymbolName(symbol)).toBe(true);
	});

	it.each(["BTC", "@235", "xyz:CXMT", "HYPERLIQUID:BTC"])("does not treat %s as a display symbol", (symbol) => {
		expect(isChartDisplaySymbolName(symbol)).toBe(false);
	});
});
