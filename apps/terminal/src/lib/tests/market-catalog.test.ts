import type { MetaResponse, PerpDexsResponse, SpotMetaResponse } from "@nktkas/hyperliquid";
import { describe, expect, it } from "vitest";
import { createMarketLookup, type UnifiedMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";
import { getSpotMarketApiCoin } from "@/lib/hyperliquid/market-identity";
import { getMarketKindFromName } from "@/lib/hyperliquid/markets/helper";
import { createMarkets } from "@/lib/hyperliquid/markets/use-markets";

function spotToken(name: string, index: number, fullName: string | null = name) {
	return {
		name,
		szDecimals: 2,
		weiDecimals: 6,
		index,
		tokenId: "0x00000000000000000000000000000000" as const,
		isCanonical: true,
		evmContract: null,
		fullName,
		deployerTradingFeeShare: "0",
	};
}

function createTestMarkets(spotMeta: SpotMetaResponse, allPerpMetas?: MetaResponse[], perpDexs?: PerpDexsResponse) {
	return createMarkets({
		perpMeta: allPerpMetas?.[0],
		spotMeta,
		allPerpMetas,
		perpDexs,
		isLoading: false,
		error: null,
	});
}

describe("market catalog identity", () => {
	it("resolves sparse token indices and builder collateral by token index", () => {
		const spotMeta = {
			tokens: [spotToken("USDC", 0), spotToken("SPARSE", 845)],
			universe: [{ name: "@702", tokens: [845, 0], index: 702, isCanonical: true }],
		} as SpotMetaResponse;
		const mainMeta = { universe: [], marginTables: [], collateralToken: 0 } as MetaResponse;
		const builderMeta = {
			universe: [{ name: "xyz:TEST", szDecimals: 2, maxLeverage: 10, marginTableId: 0 }],
			marginTables: [],
			collateralToken: 845,
		} as MetaResponse;
		const perpDexs = [null, { name: "xyz" }] as unknown as PerpDexsResponse;

		const markets = createTestMarkets(spotMeta, [mainMeta, builderMeta], perpDexs);

		expect(markets.spot[0]?.tokensInfo.map((token) => token.name)).toEqual(["SPARSE", "USDC"]);
		expect(markets.builderPerp[0]?.quoteToken?.name).toBe("SPARSE");
	});

	it("uses canonical @index routes and rejects ambiguous display-name lookup", () => {
		const spotMeta = {
			tokens: [spotToken("USDC", 0), spotToken("MOG", 43), spotToken("UMOG", 200, "Unit Mog")],
			universe: [
				{ name: "@43", tokens: [43, 0], index: 43, isCanonical: true },
				{ name: "@200", tokens: [200, 0], index: 200, isCanonical: true },
			],
		} as SpotMetaResponse;

		const markets = createTestMarkets(spotMeta);
		const lookup = createMarketLookup(markets.spot as UnifiedMarketInfo[]);

		expect(markets.spot.map((market) => market.routeName)).toEqual(["@43", "@200"]);
		expect(lookup.byPairName.has("MOG/USDC")).toBe(false);
		expect(lookup.byName.get("@43")?.assetId).toBe(10043);
		expect(lookup.byName.get("@200")?.assetId).toBe(10200);
		expect(markets.getToken("MOG")?.name).toBe("MOG");
		expect(markets.getToken("UMOG")?.name).toBe("UMOG");
	});

	it("keeps canonical slash spot coins and handles Unit display edge cases", () => {
		const spotMeta = {
			tokens: [
				spotToken("USDC", 0),
				spotToken("PURR", 1),
				spotToken("UUUSPX", 2, "Unit SPX6900"),
				spotToken("UNIT", 3, "Unit"),
				spotToken("XAUT0", 4, "Tether Gold"),
			],
			universe: [{ name: "PURR/USDC", tokens: [1, 0], index: 0, isCanonical: true }],
		} as SpotMetaResponse;
		const markets = createTestMarkets(spotMeta);

		expect(getSpotMarketApiCoin(markets.spot[0])).toBe("PURR/USDC");
		expect(getMarketKindFromName("PURR/USDC")).toBe("spot");
		expect(markets.getToken("UUUSPX")?.displayName).toBe("SPX");
		expect(markets.getToken("UNIT")?.displayName).toBe("UNIT");
		expect(markets.getToken("XAUT0")?.displayName).toBe("XAUT");
	});
});
