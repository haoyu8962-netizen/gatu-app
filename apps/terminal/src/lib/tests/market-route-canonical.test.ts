import { describe, expect, it } from "vitest";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import {
	findCanonicalMarketForRoute,
	getTradeRouteRedirectPath,
	type TradeRouteToken,
} from "@/lib/hyperliquid/market-route";

function market(name: string, pairName: string): UnifiedMarketInfo {
	return {
		kind: "perp",
		name,
		shortName: name,
		pairName,
		routeName: name,
		assetId: 0,
		ctxIndex: 0,
		szDecimals: 3,
		maxLeverage: 10,
		marginTableId: 0,
	} as UnifiedMarketInfo;
}

const USDC: TradeRouteToken = { displayName: "USDC", tokenId: "0x6d1e7cde53ba9467b783cb7c530ce054" };
const USDH: TradeRouteToken = { displayName: "USDH", tokenId: "0x54e00a5988577cb0b0c9ab0cb6ef7f4b" };
const HYPE: TradeRouteToken = { displayName: "HYPE", tokenId: "0x0d01dc56dcaaca66ad901c959b4011ec" };
const PURR: TradeRouteToken = { displayName: "PURR", tokenId: "0xc1fb593aeffbeb02f85e0308e9956a90" };
const PUMP_26: TradeRouteToken = { displayName: "PUMP-26", tokenId: "0xefa7e286b99ea49ce6a21d21bb41636f" };
const UNLISTED: TradeRouteToken = { displayName: "UNLISTED", tokenId: "0x11111111111111111111111111111111" };
const TOKENS = [USDC, USDH, HYPE, PURR, PUMP_26, UNLISTED];

function spotMarket(name: string, base: TradeRouteToken, quote: TradeRouteToken): UnifiedMarketInfo {
	const pairName = `${base.displayName}/${quote.displayName}`;
	return {
		kind: "spot",
		name,
		shortName: base.displayName,
		pairName,
		routeName: pairName,
		tokensInfo: [base, quote],
	} as unknown as UnifiedMarketInfo;
}

const HYPE_USDC = spotMarket("@107", HYPE, USDC);
const HYPE_USDH = spotMarket("@232", HYPE, USDH);
const PURR_USDC = spotMarket("PURR/USDC", PURR, USDC);
const PUMP_26_USDC = spotMarket("@20", PUMP_26, USDC);

describe("market route canonicalization", () => {
	const markets = [
		market("ETH", "ETH-USDC"),
		market("xyz:GOLD", "GOLD-USDC"),
		market("cash:GOLD", "GOLD-USDC"),
		HYPE_USDC,
		HYPE_USDH,
		PURR_USDC,
		PUMP_26_USDC,
	];

	it("keeps exact API coin identity", () => {
		expect(findCanonicalMarketForRoute(markets, "xyz:GOLD", TOKENS)?.name).toBe("xyz:GOLD");
		expect(findCanonicalMarketForRoute(markets, "@107", TOKENS)).toBe(HYPE_USDC);
	});

	it("normalizes a uniquely matched route without changing the market", () => {
		expect(findCanonicalMarketForRoute(markets, "eth", TOKENS)?.name).toBe("ETH");
		expect(findCanonicalMarketForRoute(markets, "XYZ:gold", TOKENS)?.name).toBe("xyz:GOLD");
		expect(findCanonicalMarketForRoute(markets, "hype/usdc", TOKENS)).toBe(HYPE_USDC);
		expect(findCanonicalMarketForRoute(markets, "pump-26/usdc", TOKENS)).toBe(PUMP_26_USDC);
	});

	it("rejects unknown and ambiguous display routes", () => {
		expect(findCanonicalMarketForRoute(markets, "FAKECOIN", TOKENS)).toBeUndefined();
		expect(findCanonicalMarketForRoute(markets, "gold-usdc", TOKENS)).toBeUndefined();
	});

	it("opens a display pair whose quote names no token against USDC, as the official terminal does", () => {
		expect(findCanonicalMarketForRoute(markets, "HYPE/FOO", TOKENS)).toBe(HYPE_USDC);
		expect(findCanonicalMarketForRoute(markets, "hype/foo", TOKENS)).toBe(HYPE_USDC);
	});

	it("does not fall back when the quote is a known token without that pair, or the base is unknown", () => {
		expect(findCanonicalMarketForRoute(markets, "HYPE/PURR", TOKENS)).toBeUndefined();
		expect(findCanonicalMarketForRoute(markets, "HYPE/UNLISTED", TOKENS)).toBeUndefined();
		expect(findCanonicalMarketForRoute(markets, "FOO/USDC", TOKENS)).toBeUndefined();
		expect(findCanonicalMarketForRoute(markets, "FOO/BAR", TOKENS)).toBeUndefined();
	});

	it("never resolves protocol token names that the display table renames", () => {
		const ubtcMarkets = [
			spotMarket("@142", { displayName: "BTC", tokenId: "0x8f254b963e8468305d409b33aa137c67" }, USDC),
		];
		expect(findCanonicalMarketForRoute(ubtcMarkets, "UBTC/USDC", TOKENS)).toBeUndefined();
		expect(findCanonicalMarketForRoute(ubtcMarkets, "BTC/USDC", TOKENS)?.name).toBe("@142");
	});

	it.each([
		["0x0d01dc56dcaaca66ad901c959b4011ec", HYPE_USDC],
		["0x0d01dc56dcaaca66ad901c959b4011ec/0x6d1e7cde53ba9467b783cb7c530ce054", HYPE_USDC],
		["0x0d01dc56dcaaca66ad901c959b4011ec/0x54e00a5988577cb0b0c9ab0cb6ef7f4b", HYPE_USDH],
		["0x0d01dc56dcaaca66ad901c959b4011ec/USDC", HYPE_USDC],
		["0x0d01dc56dcaaca66ad901c959b4011ec/USDH", HYPE_USDC],
		["0x0d01dc56dcaaca66ad901c959b4011ec/0xffffffffffffffffffffffffffffffff", HYPE_USDC],
	])("resolves the token-ID address %s by token ID, an unknown quote meaning USDC", (address, expected) => {
		expect(findCanonicalMarketForRoute(markets, address, TOKENS)).toBe(expected);
	});

	it.each([
		"0x0D01DC56DCAACA66AD901C959B4011EC",
		"0xffffffffffffffffffffffffffffffff",
		"0x0d01dc56dcaaca66ad901c959b4011ec/0x11111111111111111111111111111111",
		"0x0d01dc56dcaaca66ad901c959b4011ec/0x6d1e7cde53ba9467b783cb7c530ce054/x",
	])("rejects the token-ID address %s", (address) => {
		expect(findCanonicalMarketForRoute(markets, address, TOKENS)).toBeUndefined();
	});
});

describe("trade route redirects", () => {
	it("replaces a resolved spot address with the pair's display path", () => {
		expect(getTradeRouteRedirectPath("@107", HYPE_USDC, false)).toBe("/trade/HYPE/USDC");
		expect(getTradeRouteRedirectPath("0x0d01dc56dcaaca66ad901c959b4011ec", HYPE_USDC, false)).toBe("/trade/HYPE/USDC");
		expect(getTradeRouteRedirectPath("hype/usdc", HYPE_USDC, false)).toBe("/trade/HYPE/USDC");
		expect(getTradeRouteRedirectPath("PUMP-26/USDC", PUMP_26_USDC, false)).toBeUndefined();
		expect(getTradeRouteRedirectPath("PURR/USDC", PURR_USDC, false)).toBeUndefined();
	});

	it("replaces an address that names no market with the default market, except the default itself", () => {
		expect(getTradeRouteRedirectPath("FOO/USDC", undefined, true)).toBe("/trade/BTC");
		expect(getTradeRouteRedirectPath(undefined, undefined, true)).toBe("/trade/BTC");
		expect(getTradeRouteRedirectPath("BTC", undefined, true)).toBeUndefined();
		expect(getTradeRouteRedirectPath("FOO/USDC", undefined, false)).toBeUndefined();
	});
});
