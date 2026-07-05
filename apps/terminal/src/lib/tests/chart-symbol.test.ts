import { describe, expect, it } from "vitest";
import { coinFromSymbolName } from "@/lib/chart/symbol";

describe("chart symbol helpers", () => {
	it.each([
		["BTC/USDC", "BTC"],
		["HYPERLIQUID:SOL/USDC", "SOL"],
		["ETH/USDH", "ETH"],
		["@235", "@235"],
		["xyz:KR200/USDC", "xyz:KR200"],
		["HYPERLIQUID:xyz:KR200/USDC", "xyz:KR200"],
		["hyna:XPL/USDC", "hyna:XPL"],
	])("maps %s to API coin %s", (symbolName, coin) => {
		expect(coinFromSymbolName(symbolName)).toBe(coin);
	});
});
