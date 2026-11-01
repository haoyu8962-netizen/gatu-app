import type { MetaResponse, PerpDexsResponse, SpotMetaResponse } from "@nktkas/hyperliquid";
import type { HyperliquidEnv } from "@sairn/hl-react";
import { describe, expect, it } from "vitest";
import { SPOT_TOKEN_DISPLAY_NAMES } from "@/config/spot-token-display-names";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import {
	findCanonicalMarketForRoute,
	getTradePathForMarket,
	getTradeRouteMarketFromPath,
} from "@/lib/hyperliquid/market-route";
import { createMarkets } from "@/lib/hyperliquid/markets/use-markets";
import { SPOT_META_SNAPSHOT } from "./fixtures/spot-meta-snapshot";

const NETWORKS: HyperliquidEnv[] = ["Mainnet", "Testnet"];

/** Official testnet entries this terminal leaves out: the token at the index carries another name. */
const OFFICIAL_TESTNET_ENTRIES_LEFT_OUT = [
	[100, "PUMP", "PUMP-26"],
	[1474, "UENA", "ENA"],
	[1397, "UUENA", "ENA"],
] as const;

function parseTokens(snapshot: string) {
	return snapshot.split(" ").map((entry) => {
		const separator = entry.indexOf(":");
		return { index: Number(entry.slice(0, separator)), name: entry.slice(separator + 1) };
	});
}

function parsePairs(snapshot: string) {
	return snapshot.split(" ").map((entry) => {
		const [index, base, quote] = entry.split(":").map(Number);
		return { index, name: index === 0 ? "PURR/USDC" : `@${index}`, tokens: [base, quote], isCanonical: false };
	});
}

function snapshotSpotMeta(env: HyperliquidEnv): SpotMetaResponse {
	const tokens = env === "Mainnet" ? SPOT_META_SNAPSHOT.mainnetTokens : SPOT_META_SNAPSHOT.testnetTokens;
	const pairs = env === "Mainnet" ? SPOT_META_SNAPSHOT.mainnetPairs : SPOT_META_SNAPSHOT.testnetPairs;
	return {
		tokens: parseTokens(tokens).map((token) => ({
			...token,
			szDecimals: 2,
			weiDecimals: 8,
			tokenId: `0x${token.index.toString(16).padStart(32, "0")}`,
			isCanonical: false,
			evmContract: null,
			fullName: null,
			deployerTradingFeeShare: "0",
		})),
		universe: parsePairs(pairs),
	} as SpotMetaResponse;
}

function snapshotMarkets(env: HyperliquidEnv) {
	const perpMeta = {
		universe:
			env === "Mainnet"
				? SPOT_META_SNAPSHOT.mainnetPerps.split(" ").map((name) => ({ name, szDecimals: 2, maxLeverage: 3 }))
				: [],
		marginTables: [],
		collateralToken: 0,
	} as unknown as MetaResponse;
	return createMarkets({
		env,
		perpMeta,
		spotMeta: snapshotSpotMeta(env),
		allPerpMetas: [perpMeta],
		perpDexs: [null] as unknown as PerpDexsResponse,
		isLoading: false,
		error: null,
	});
}

function duplicates(values: readonly string[]): string[] {
	return values.filter((value, index) => values.indexOf(value) !== index);
}

describe("spot display-name table contract", () => {
	it.each(NETWORKS)("keeps one entry per token index and one token per display name on %s", (env) => {
		const entries = SPOT_TOKEN_DISPLAY_NAMES[env];
		expect(duplicates(entries.map(([index]) => String(index)))).toEqual([]);
		expect(duplicates(entries.map(([, , displayName]) => displayName))).toEqual([]);
		expect(entries.every(([index]) => Number.isSafeInteger(index) && index >= 0)).toBe(true);
	});

	it.each(NETWORKS)("keys every %s entry to the token that index carries in the snapshot", (env) => {
		const tokens = snapshotSpotMeta(env).tokens;
		const tokenNameByIndex = new Map(tokens.map((token) => [token.index, token.name]));
		const mismatches = SPOT_TOKEN_DISPLAY_NAMES[env].filter(
			([index, tokenName]) => tokenNameByIndex.get(index) !== tokenName,
		);
		expect(mismatches).toEqual([]);
	});

	it("leaves out the official testnet entries that would mislabel a token or name two tokens ENA", () => {
		const tokenNameByIndex = new Map(snapshotSpotMeta("Testnet").tokens.map((token) => [token.index, token.name]));
		const testnetIndexes = new Set(SPOT_TOKEN_DISPLAY_NAMES.Testnet.map(([index]) => index));
		for (const [index, tokenName] of OFFICIAL_TESTNET_ENTRIES_LEFT_OUT) {
			expect(testnetIndexes.has(index)).toBe(false);
			expect(tokenNameByIndex.get(index)).not.toBe(tokenName);
		}
	});

	it("names every mainnet token with a unique name taken from the table or the protocol, never suffixed", () => {
		const markets = snapshotMarkets("Mainnet");
		const tableNames = new Map(SPOT_TOKEN_DISPLAY_NAMES.Mainnet.map(([index, , displayName]) => [index, displayName]));

		expect(duplicates(markets.tokens.map((token) => token.displayName))).toEqual([]);
		expect(markets.tokens.filter((token) => token.displayName !== (tableNames.get(token.index) ?? token.name))).toEqual(
			[],
		);
	});

	it("suffixes only the testnet tokens whose protocol name a testnet table entry shows", () => {
		const markets = snapshotMarkets("Testnet");
		const suffixed = markets.tokens
			.filter((token) => token.displayName === `${token.name}-${token.index}`)
			.map((token) => token.displayName);

		expect(duplicates(markets.tokens.map((token) => token.displayName))).toEqual([]);
		expect(suffixed).toEqual(["BTC-69", "SPX-1020", "MON-1127"]);
	});

	it.each(NETWORKS)("gives every %s market one route that resolves back to it", (env) => {
		const markets = snapshotMarkets(env);
		const all = markets.all as UnifiedMarketInfo[];
		const paths = all.map((market) => getTradePathForMarket(market));

		expect(duplicates(paths)).toEqual([]);
		expect(markets.spot.every((market) => market.routeName === market.pairName)).toBe(true);
		for (const market of all) {
			const routeName = getTradeRouteMarketFromPath(getTradePathForMarket(market))?.name;
			expect(routeName).toBeDefined();
			expect(findCanonicalMarketForRoute(all, routeName ?? "", markets.tokens)?.name).toBe(market.name);
		}
		for (const token of markets.tokens) {
			expect(token.displayName).not.toMatch(/[/:]|^@|^0x/);
		}
	});

	it("opens the mainnet pairs the official terminal opened for these addresses on 2026-11-01", () => {
		const markets = snapshotMarkets("Mainnet");
		const all = markets.all as UnifiedMarketInfo[];
		const resolve = (path: string) =>
			findCanonicalMarketForRoute(all, getTradeRouteMarketFromPath(path)?.name ?? "", markets.tokens)?.name;

		expect(resolve("/trade/PEAR/USDC")).toBe("@1118");
		expect(resolve("/trade/PEAR-71/USDC")).toBe("@114");
		expect(resolve("/trade/PUMP/USDC")).toBe("@188");
		expect(resolve("/trade/BTC/USDC")).toBe("@142");
		expect(resolve("/trade/hype/usdc")).toBe("@107");
		expect(resolve("/trade/HYPE/FOO")).toBe("@107");
		expect(resolve("/trade/UBTC/USDC")).toBeUndefined();
		expect(resolve("/trade/FART/USDC")).toBeUndefined();
	});
});
