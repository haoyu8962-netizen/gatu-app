import type { InfoClient } from "@nktkas/hyperliquid";
import { infoPersistedKey, infoQueryOptions } from "@sairn/hl-react/query/info";
import { RQ_CACHE_MAX_AGE_MS } from "@/config/time";

export const MARKET_CATALOG_META_STALE_TIME_MS = 30 * 60 * 1_000;
export const MARKET_CATALOG_DEXS_STALE_TIME_MS = 5 * 60 * 1_000;
export const MARKET_CATALOG_REQUEST_TIMEOUT_MS = 6_000;

type HyperliquidEnv = "Mainnet" | "Testnet";
export type MarketCatalogInfoClient = Pick<InfoClient, "spotMeta" | "perpDexs" | "allPerpMetas">;

export function getMarketCatalogQueryKeys(env: HyperliquidEnv) {
	return [
		infoPersistedKey("spotMeta", undefined, env),
		infoPersistedKey("perpDexs", undefined, env),
		infoPersistedKey("allPerpMetas", undefined, env),
	] as const;
}

export function createMarketCatalogQueryOptions(info: MarketCatalogInfoClient, env: HyperliquidEnv) {
	const requestOptions = {
		persist: true,
		requestTimeoutMs: MARKET_CATALOG_REQUEST_TIMEOUT_MS,
	} as const;
	const queryOptions = {
		gcTime: RQ_CACHE_MAX_AGE_MS,
		retry: false,
		retryOnMount: false,
	} as const;

	return [
		{
			...infoQueryOptions(info, "spotMeta", undefined, env, requestOptions),
			...queryOptions,
			staleTime: MARKET_CATALOG_META_STALE_TIME_MS,
		},
		{
			...infoQueryOptions(info, "perpDexs", undefined, env, requestOptions),
			...queryOptions,
			staleTime: MARKET_CATALOG_DEXS_STALE_TIME_MS,
		},
		{
			...infoQueryOptions(info, "allPerpMetas", undefined, env, requestOptions),
			...queryOptions,
			staleTime: MARKET_CATALOG_META_STALE_TIME_MS,
		},
	] as const;
}
