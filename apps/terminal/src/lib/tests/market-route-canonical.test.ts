import { describe, expect, it } from "vitest";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import { findCanonicalMarketForRoute } from "@/lib/hyperliquid/market-route";

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

describe("market route canonicalization", () => {
	const markets = [market("ETH", "ETH-USDC"), market("xyz:GOLD", "GOLD-USDC"), market("cash:GOLD", "GOLD-USDC")];

	it("keeps exact API coin identity", () => {
		expect(findCanonicalMarketForRoute(markets, "xyz:GOLD")?.name).toBe("xyz:GOLD");
	});

	it("normalizes a uniquely matched route without changing the market", () => {
		expect(findCanonicalMarketForRoute(markets, "eth")?.name).toBe("ETH");
		expect(findCanonicalMarketForRoute(markets, "XYZ:gold")?.name).toBe("xyz:GOLD");
	});

	it("rejects unknown and ambiguous display routes", () => {
		expect(findCanonicalMarketForRoute(markets, "FAKECOIN")).toBeUndefined();
		expect(findCanonicalMarketForRoute(markets, "gold-usdc")).toBeUndefined();
	});
});
