import { describe, expect, it } from "vitest";
import {
	getChartApiSymbol,
	getChartDisplayName,
	getChartMarketKeys,
	getChartSymbolInfo,
	getLegacyChartDisplaySymbol,
} from "@/lib/chart/market-symbol";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";

describe("chart market symbol helpers", () => {
	it("uses the spot @index as the TradingView API ticker while preserving the display pair", () => {
		const market = {
			kind: "spot",
			name: "@235",
			pairName: "ETH/USDH",
			szDecimals: 5,
		} as UnifiedMarketInfo;

		expect(getChartApiSymbol(market)).toBe("@235");
		expect(getChartDisplayName(market)).toBe("ETH/USDH");
		expect(getChartMarketKeys(market)).toEqual(["@235", "ETH/USDH"]);
		expect(getChartSymbolInfo(market)).toMatchObject({
			description: "ETH/USDH",
			name: "ETH/USDH",
			ticker: "@235",
		});
	});

	it("uses the HIP-3 dex-prefixed coin as the TradingView API ticker", () => {
		const market = {
			kind: "builderPerp",
			name: "xyz:SILVER",
			pairName: "SILVER-USDC",
			quoteToken: { displayName: "USDC", name: "USDC" },
			szDecimals: 2,
		} as UnifiedMarketInfo;

		expect(getChartApiSymbol(market)).toBe("xyz:SILVER");
		expect(getChartDisplayName(market)).toBe("SILVER-USDC");
		expect(getLegacyChartDisplaySymbol(market)).toBe("xyz:SILVER/USDC");
		expect(getChartMarketKeys(market)).toEqual(["xyz:SILVER", "SILVER-USDC", "xyz:SILVER/USDC"]);
		expect(getChartSymbolInfo(market)).toMatchObject({
			description: "SILVER-USDC",
			name: "SILVER-USDC",
			ticker: "xyz:SILVER",
		});
	});
});
