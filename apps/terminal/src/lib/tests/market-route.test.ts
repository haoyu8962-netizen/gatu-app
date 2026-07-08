import { describe, expect, it } from "vitest";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import {
	getTradePathForMarket,
	getTradePathForMarketName,
	getTradeRouteMarketFromPath,
} from "@/lib/hyperliquid/market-route";

describe("trade route market parsing", () => {
	it.each([
		["/trade/BTC", { name: "BTC", scope: "perp", dex: undefined }],
		["/trade/HYPE", { name: "HYPE", scope: "perp", dex: undefined }],
		["/trade/xyz:SILVER", { name: "xyz:SILVER", scope: "builders-perp", dex: "xyz" }],
		["/trade/hyna:XPL", { name: "hyna:XPL", scope: "builders-perp", dex: "hyna" }],
		["/trade/%40107", { name: "@107", scope: "spot", dex: undefined }],
		["/trade/ETH/USDH", { name: "ETH/USDH", scope: "spot", dex: undefined }],
	])("parses %s", (path, expected) => {
		expect(getTradeRouteMarketFromPath(path)).toEqual(expected);
	});

	it("ignores non-trade paths", () => {
		expect(getTradeRouteMarketFromPath("/perp")).toBeUndefined();
		expect(getTradeRouteMarketFromPath("/builders-perp/xyz")).toBeUndefined();
	});

	it.each([
		"/trade",
		"/trade/",
		"/trade//BTC",
		"/trade/BTC/USDC/junk",
		"/trade/@107/USDC",
		"/trade/xyz:SILVER/USDC",
		"/trade/ETH/@107",
		"/trade/ETH/xyz:USDC",
	])("rejects malformed trade path %s", (path) => {
		expect(getTradeRouteMarketFromPath(path)).toBeUndefined();
	});

	it("accepts a trailing slash on symbol paths", () => {
		expect(getTradeRouteMarketFromPath("/trade/BTC/")).toEqual({
			name: "BTC",
			scope: "perp",
			dex: undefined,
		});
	});

	it("keeps malformed encoded segments fail-soft without throwing", () => {
		expect(() => getTradeRouteMarketFromPath("/trade/%E0%A4%A")).not.toThrow();
		expect(getTradeRouteMarketFromPath("/trade/%E0%A4%A")).toEqual({
			name: "%E0%A4%A",
			scope: "perp",
			dex: undefined,
		});
	});

	it.each([
		[{ kind: "perp", name: "BTC", pairName: "BTC-USDC" } as UnifiedMarketInfo, "/trade/BTC"],
		[{ kind: "builderPerp", name: "xyz:SILVER", pairName: "SILVER-USDC" } as UnifiedMarketInfo, "/trade/xyz:SILVER"],
		[{ kind: "spot", name: "@107", pairName: "ETH/USDC" } as UnifiedMarketInfo, "/trade/ETH/USDC"],
	])("builds trade path %#", (market, expected) => {
		expect(getTradePathForMarket(market)).toBe(expected);
	});

	it.each([
		["BTC", "/trade/BTC"],
		["xyz:SILVER", "/trade/xyz:SILVER"],
		["@107", "/trade/@107"],
		["ETH/USDC", "/trade/ETH/USDC"],
	])("builds fallback trade path for %s", (marketName, expected) => {
		expect(getTradePathForMarketName(marketName)).toBe(expected);
	});
});
