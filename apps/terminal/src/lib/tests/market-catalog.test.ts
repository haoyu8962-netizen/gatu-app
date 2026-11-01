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

function createTestMarkets(
	spotMeta: SpotMetaResponse,
	allPerpMetas?: MetaResponse[],
	perpDexs?: PerpDexsResponse,
	env: "Mainnet" | "Testnet" = "Mainnet",
) {
	return createMarkets({
		env,
		perpMeta: allPerpMetas?.[0],
		spotMeta,
		allPerpMetas,
		perpDexs,
		isLoading: false,
		error: null,
	});
}

function usdcPair(index: number, baseIndex: number): SpotMetaResponse["universe"][number] {
	return { name: `@${index}`, tokens: [baseIndex, 0], index, isCanonical: false };
}

describe("market catalog identity", () => {
	it("uses HyperCore wei decimals rather than linked HyperEVM decimals for transfers", () => {
		const linkedToken = {
			...spotToken("PURR", 1),
			weiDecimals: 5,
			evmContract: {
				address: "0x0000000000000000000000000000000000000001" as const,
				evm_extra_wei_decimals: 13,
			},
		};
		const spotMeta = {
			tokens: [spotToken("USDC", 0), linkedToken],
			universe: [{ name: "PURR/USDC", tokens: [1, 0], index: 0, isCanonical: true }],
		} as SpotMetaResponse;

		const markets = createTestMarkets(spotMeta);

		expect(markets.getToken("PURR")?.transferDecimals).toBe(5);
	});

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

	it("attaches dex-scoped margin tiers to perp and builder perp markets", () => {
		const spotMeta = {
			tokens: [spotToken("USDC", 0), spotToken("USDH", 360)],
			universe: [],
		} as unknown as SpotMetaResponse;
		const mainTiers = [
			{ lowerBound: "0.0", maxLeverage: 40 },
			{ lowerBound: "150000000.0", maxLeverage: 20 },
		];
		const builderTiers = [
			{ lowerBound: "0.0", maxLeverage: 20 },
			{ lowerBound: "5000000.0", maxLeverage: 10 },
		];
		const mainMeta = {
			universe: [
				{ name: "BTC", szDecimals: 5, maxLeverage: 40, marginTableId: 56 },
				{ name: "IMPLICIT", szDecimals: 2, maxLeverage: 3, marginTableId: 3 },
				{ name: "MISMATCH", szDecimals: 2, maxLeverage: 10, marginTableId: 3 },
			],
			marginTables: [[56, { description: "tiered 40x", marginTiers: mainTiers }]],
			collateralToken: 0,
		} as unknown as MetaResponse;
		const builderMeta = {
			universe: [{ name: "xyz:TEST", szDecimals: 2, maxLeverage: 20, marginTableId: 56 }],
			marginTables: [[56, { description: "builder table", marginTiers: builderTiers }]],
			collateralToken: 360,
		} as unknown as MetaResponse;
		const perpDexs = [null, { name: "xyz" }] as unknown as PerpDexsResponse;

		const markets = createTestMarkets(spotMeta, [mainMeta, builderMeta], perpDexs);
		const perpByName = new Map(markets.perp.map((market) => [market.name, market]));

		expect(perpByName.get("BTC")?.marginTiers).toBe(mainTiers);
		expect(perpByName.get("IMPLICIT")?.marginTiers).toEqual([{ lowerBound: "0", maxLeverage: 3 }]);
		expect(perpByName.get("MISMATCH")?.marginTiers).toBeUndefined();
		expect(markets.builderPerp[0]?.marginTiers).toBe(builderTiers);
		expect(markets.builderPerp[0]?.quoteToken?.name).toBe("USDH");
	});

	it("derives stable pairs from quote-asset positions in the spot universe", () => {
		const spotMeta = {
			tokens: [spotToken("USDC", 0), spotToken("MOG", 43), spotToken("USDE", 235), spotToken("USDT0", 268)],
			universe: [
				{ name: "@43", tokens: [43, 0], index: 43, isCanonical: true },
				{ name: "@150", tokens: [235, 0], index: 150, isCanonical: true },
				{ name: "@166", tokens: [268, 0], index: 166, isCanonical: true },
				{ name: "@300", tokens: [43, 235], index: 300, isCanonical: true },
				{ name: "@301", tokens: [43, 268], index: 301, isCanonical: true },
			],
		} as SpotMetaResponse;

		const markets = createTestMarkets(spotMeta);
		const stableByName = new Map(markets.spot.map((market) => [market.name, market.isStablePair]));

		expect(stableByName.get("@150")).toBe(true);
		expect(stableByName.get("@166")).toBe(true);
		expect(stableByName.get("@43")).toBe(false);
		expect(stableByName.get("@300")).toBe(false);
		expect(stableByName.get("@301")).toBe(false);
	});

	it("falls back to canonical @index routes if two pairs ever share a display name", () => {
		const spotMeta = {
			tokens: [spotToken("USDC", 0), spotToken("MOG", 43), spotToken("MOG", 44)],
			universe: [usdcPair(43, 43), usdcPair(44, 44)],
		} as SpotMetaResponse;

		const markets = createTestMarkets(spotMeta);
		const lookup = createMarketLookup(markets.spot as UnifiedMarketInfo[]);

		expect(markets.spot.map((market) => market.routeName)).toEqual(["@43", "@44"]);
		expect(markets.getMarketByName("@43")?.assetId).toBe(10043);
		expect(markets.getMarketByName("MOG/USDC")).toBeUndefined();
		expect(lookup.byPairName.has("MOG/USDC")).toBe(false);
		expect(lookup.byName.get("@44")?.assetId).toBe(10044);
	});

	it("keeps canonical slash spot coins and names tokens outside the table by their protocol name", () => {
		const spotMeta = {
			tokens: [
				spotToken("USDC", 0),
				spotToken("PURR", 1),
				spotToken("UUUSPX", 319, "Unit SPX6900"),
				spotToken("UNIT", 3, "Unit"),
				spotToken("XAUT0", 297, "Tether Gold"),
				spotToken("UWLD", 358, "Unit Worldcoin"),
			],
			universe: [{ name: "PURR/USDC", tokens: [1, 0], index: 0, isCanonical: true }],
		} as SpotMetaResponse;
		const markets = createTestMarkets(spotMeta);

		expect(getSpotMarketApiCoin(markets.spot[0])).toBe("PURR/USDC");
		expect(getMarketKindFromName("PURR/USDC")).toBe("spot");
		expect(markets.getToken("UUUSPX")?.displayName).toBe("SPX");
		expect(markets.getToken("UNIT")?.displayName).toBe("UNIT");
		expect(markets.getToken("XAUT0")?.displayName).toBe("XAUT");
		expect(markets.getToken("UWLD")?.displayName).toBe("UWLD");
	});
});

describe("official spot display names", () => {
	const mainnetSpotMeta = {
		tokens: [
			spotToken("USDC", 0),
			spotToken("PUMP", 26),
			spotToken("MOG", 43),
			spotToken("PEAR", 71),
			spotToken("MON", 164),
			spotToken("UFART", 269, "Unit Fartcoin"),
			spotToken("PAIR", 293),
			spotToken("UPUMP", 299, "Unit Pump Fun"),
			spotToken("UMOG", 326, "Unit Mog"),
			spotToken("UMON", 383, "Unit Monad"),
		],
		universe: [
			usdcPair(20, 26),
			usdcPair(43, 43),
			usdcPair(114, 71),
			usdcPair(129, 164),
			usdcPair(162, 269),
			usdcPair(1118, 293),
			usdcPair(188, 299),
			usdcPair(200, 326),
			usdcPair(243, 383),
		],
	} as SpotMetaResponse;

	it("names mainnet pairs as the official terminal does and keeps every pair route unique", () => {
		const markets = createTestMarkets(mainnetSpotMeta);
		const pairNameByCoin = Object.fromEntries(markets.spot.map((market) => [market.name, market.pairName]));

		expect(pairNameByCoin).toEqual({
			"@20": "PUMP-26/USDC",
			"@43": "MOG/USDC",
			"@114": "PEAR-71/USDC",
			"@129": "MONPRO/USDC",
			"@162": "FARTCOIN/USDC",
			"@1118": "PEAR/USDC",
			"@188": "PUMP/USDC",
			"@200": "UMOG/USDC",
			"@243": "MON/USDC",
		});
		expect(markets.spot.every((market) => market.routeName === market.pairName)).toBe(true);
		expect(markets.spot.find((market) => market.name === "@188")?.shortName).toBe("PUMP");
		expect(markets.spot.find((market) => market.name === "@162")?.iconUrl).toMatch(/\/FARTCOIN_spot\.svg$/);
	});

	it("keeps protocol token names as the lookup key when a display name equals another token's name", () => {
		const markets = createTestMarkets(mainnetSpotMeta);

		expect(markets.getToken("PEAR")?.index).toBe(71);
		expect(markets.getToken("PEAR")?.displayName).toBe("PEAR-71");
		expect(markets.getToken("PAIR")?.displayName).toBe("PEAR");
		expect(markets.getToken("PUMP")?.displayName).toBe("PUMP-26");
		expect(markets.getToken("UPUMP")?.displayName).toBe("PUMP");
		expect(markets.getToken("FARTCOIN")?.name).toBe("UFART");
		expect(markets.getToken("PAIR")?.isWrapped).toBe(true);
		expect(markets.getToken("MOG")?.isWrapped).toBe(false);
	});

	it("applies a table entry only to the token that carries the recorded name at that index", () => {
		const spotMeta = {
			tokens: [spotToken("USDC", 0), spotToken("NEWCOIN", 299), spotToken("UPUMP", 300, "Unit Pump Fun")],
			universe: [usdcPair(188, 299), usdcPair(189, 300)],
		} as SpotMetaResponse;

		const markets = createTestMarkets(spotMeta);

		expect(markets.getToken("NEWCOIN")?.displayName).toBe("NEWCOIN");
		expect(markets.getToken("UPUMP")?.displayName).toBe("UPUMP");
	});

	it("gives a token outside the table whose name a table entry displays its index as a suffix", () => {
		const spotMeta = {
			tokens: [spotToken("USDC", 0), spotToken("UFART", 269, "Unit Fartcoin"), spotToken("FARTCOIN", 900)],
			universe: [usdcPair(162, 269), usdcPair(800, 900)],
		} as SpotMetaResponse;

		const markets = createTestMarkets(spotMeta);

		expect(markets.spot.map((market) => market.pairName)).toEqual(["FARTCOIN/USDC", "FARTCOIN-900/USDC"]);
		expect(markets.getToken("FARTCOIN")?.displayName).toBe("FARTCOIN-900");
	});

	it("uses the testnet table on testnet and never the mainnet one", () => {
		const spotMeta = {
			tokens: [
				spotToken("USDC", 0),
				spotToken("BTC", 69),
				spotToken("AG", 100),
				spotToken("UBTC", 197, "Unit Bitcoin"),
				spotToken("UNIT", 1129, "Test Unit"),
			],
			universe: [usdcPair(50, 69), usdcPair(80, 100), usdcPair(81, 197), usdcPair(1054, 1129)],
		} as SpotMetaResponse;

		const markets = createTestMarkets(spotMeta, undefined, undefined, "Testnet");
		const pairNameByCoin = Object.fromEntries(markets.spot.map((market) => [market.name, market.pairName]));

		expect(pairNameByCoin).toEqual({
			"@50": "BTC-69/USDC",
			"@80": "AG/USDC",
			"@81": "UBTC/USDC",
			"@1054": "BTC/USDC",
		});
	});
});
