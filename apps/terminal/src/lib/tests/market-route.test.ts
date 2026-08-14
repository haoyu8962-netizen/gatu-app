import { describe, expect, it } from "vitest";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import {
	getTradePathForMarket,
	getTradePathForMarketName,
	getTradeRouteMarketFromPath,
	isMalformedTradeMarketPath,
	isSafeTradeRouteMarketName,
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

	it("distinguishes the empty trade route from malformed market paths", () => {
		expect(isMalformedTradeMarketPath("/trade")).toBe(false);
		expect(isMalformedTradeMarketPath("/trade/")).toBe(false);
		expect(isMalformedTradeMarketPath("/portfolio")).toBe(false);
		expect(isMalformedTradeMarketPath("/trade/%E0%A4%A")).toBe(true);
		expect(isMalformedTradeMarketPath("/trade/BTC/USDC/junk")).toBe(true);
	});

	it("accepts a trailing slash on symbol paths", () => {
		expect(getTradeRouteMarketFromPath("/trade/BTC/")).toEqual({
			name: "BTC",
			scope: "perp",
			dex: undefined,
		});
	});

	it("rejects malformed encoded segments without throwing", () => {
		expect(() => getTradeRouteMarketFromPath("/trade/%E0%A4%A")).not.toThrow();
		expect(getTradeRouteMarketFromPath("/trade/%E0%A4%A")).toBeUndefined();
	});

	it.each([".", "..", "BTC/USDC/EXTRA", "BTC\\USDC", " BTC", "BTC\u0000", "xyz:", ":BTC", "xyz:BTC:USD"])(
		"rejects unsafe market name %j",
		(marketName) => {
			expect(isSafeTradeRouteMarketName(marketName)).toBe(false);
			expect(getTradePathForMarketName(marketName)).toBe("/trade/BTC");
		},
	);

	it("rejects non-well-formed Unicode before URL encoding", () => {
		const unpairedSurrogate = String.fromCharCode(0xd800);
		expect(isSafeTradeRouteMarketName(unpairedSurrogate)).toBe(false);
		expect(() => getTradePathForMarketName(unpairedSurrogate)).not.toThrow();
		expect(getTradePathForMarketName(unpairedSurrogate)).toBe("/trade/BTC");
	});

	it.each(["BTC", "xyz:SILVER", "@107", "ETH/USDC", "ΤOKEN"])("accepts URL-safe market name %s", (marketName) => {
		expect(isSafeTradeRouteMarketName(marketName)).toBe(true);
	});

	it.each([
		[{ kind: "perp", name: "BTC", pairName: "BTC-USDC" } as UnifiedMarketInfo, "/trade/BTC"],
		[{ kind: "builderPerp", name: "xyz:SILVER", pairName: "SILVER-USDC" } as UnifiedMarketInfo, "/trade/xyz:SILVER"],
		[{ kind: "spot", name: "@107", pairName: "ETH/USDC" } as UnifiedMarketInfo, "/trade/ETH/USDC"],
	])("builds trade path %#", (market, expected) => {
		expect(getTradePathForMarket(market)).toBe(expected);
	});

	it("uses the canonical spot coin when a display pair is ambiguous", () => {
		const market = {
			kind: "spot",
			name: "@43",
			pairName: "MOG/USDC",
			routeName: "@43",
		} as UnifiedMarketInfo;

		expect(getTradePathForMarket(market)).toBe("/trade/@43");
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
