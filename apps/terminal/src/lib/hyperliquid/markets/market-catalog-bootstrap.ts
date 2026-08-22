import type { QueryClient } from "@tanstack/react-query";
import { RQ_CACHE_BUSTER, STORAGE_KEYS } from "@/config/app";
import { RQ_CACHE_MAX_AGE_MS } from "@/config/time";
import { getNetwork } from "@/lib/network";
import {
	createMarketCatalogQueryOptions,
	getMarketCatalogQueryKeys,
	MARKET_CATALOG_DEXS_STALE_TIME_MS,
	MARKET_CATALOG_META_STALE_TIME_MS,
} from "./market-catalog-query";
import { hasCompleteMarketCatalogData } from "./market-catalog-state";

const activeBootstraps = new WeakMap<QueryClient, Promise<void>>();

type HyperliquidEnv = "Mainnet" | "Testnet";

interface PersistedQuery {
	queryKey?: unknown;
	state?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function seedPersistedMarketCatalog(queryClient: QueryClient, env: HyperliquidEnv): void {
	try {
		const now = Date.now();
		const serialized = window.localStorage.getItem(STORAGE_KEYS.RQ_CACHE);
		if (!serialized) return;

		const persisted: unknown = JSON.parse(serialized);
		if (!isRecord(persisted)) return;
		const timestamp = persisted.timestamp;
		if (
			typeof timestamp !== "number" ||
			!timestamp ||
			timestamp > now + MARKET_CATALOG_DEXS_STALE_TIME_MS ||
			now - timestamp > RQ_CACHE_MAX_AGE_MS ||
			persisted.buster !== RQ_CACHE_BUSTER ||
			!isRecord(persisted.clientState) ||
			!Array.isArray(persisted.clientState.queries)
		) {
			window.localStorage.removeItem(STORAGE_KEYS.RQ_CACHE);
			return;
		}

		const queryKeys = getMarketCatalogQueryKeys(env);
		const catalogKeys = new Map(queryKeys.map((queryKey) => [JSON.stringify(queryKey), queryKey]));
		const persistedByKey = new Map<
			string,
			{ data: unknown; dataUpdatedAt: number; queryKey: (typeof queryKeys)[number] }
		>();

		for (const query of persisted.clientState.queries as PersistedQuery[]) {
			if (!isRecord(query) || !isRecord(query.state)) continue;
			const queryKey = catalogKeys.get(JSON.stringify(query.queryKey));
			const { data, dataUpdatedAt, status } = query.state;
			if (
				!queryKey ||
				status !== "success" ||
				data === undefined ||
				typeof dataUpdatedAt !== "number" ||
				!Number.isFinite(dataUpdatedAt) ||
				dataUpdatedAt <= 0 ||
				dataUpdatedAt > now + MARKET_CATALOG_DEXS_STALE_TIME_MS
			) {
				continue;
			}
			persistedByKey.set(JSON.stringify(queryKey), { data, dataUpdatedAt, queryKey });
		}

		const candidateData = queryKeys.map((queryKey) => {
			const current = queryClient.getQueryState(queryKey);
			const persistedQuery = persistedByKey.get(JSON.stringify(queryKey));
			if (
				current?.status === "success" &&
				current.data !== undefined &&
				(current.fetchStatus === "fetching" || current.dataUpdatedAt >= (persistedQuery?.dataUpdatedAt ?? 0))
			) {
				return current.data;
			}
			return persistedQuery?.data;
		});

		if (
			!hasCompleteMarketCatalogData({
				spotMeta: candidateData[0],
				perpDexs: candidateData[1],
				allPerpMetas: candidateData[2],
			})
		) {
			persisted.clientState.queries = (persisted.clientState.queries as PersistedQuery[]).filter(
				(query) => isRecord(query) && !catalogKeys.has(JSON.stringify(query.queryKey)),
			);
			window.localStorage.setItem(STORAGE_KEYS.RQ_CACHE, JSON.stringify(persisted));
			return;
		}

		for (const persistedQuery of persistedByKey.values()) {
			const current = queryClient.getQueryState(persistedQuery.queryKey);
			if (current?.fetchStatus === "fetching" || (current?.dataUpdatedAt ?? 0) >= persistedQuery.dataUpdatedAt) {
				continue;
			}
			queryClient.setQueryData(persistedQuery.queryKey, persistedQuery.data, {
				updatedAt: persistedQuery.dataUpdatedAt,
			});
		}
	} catch {}
}

function hasFreshMarketCatalog(queryClient: QueryClient, env: HyperliquidEnv): boolean {
	const now = Date.now();
	const [spotMetaKey, perpDexsKey, allPerpMetasKey] = getMarketCatalogQueryKeys(env);
	const isFresh = (queryKey: readonly unknown[], staleTime: number) => {
		const state = queryClient.getQueryState(queryKey);
		return (
			state?.status === "success" &&
			state.data !== undefined &&
			state.dataUpdatedAt <= now + MARKET_CATALOG_DEXS_STALE_TIME_MS &&
			now - state.dataUpdatedAt < staleTime
		);
	};

	return (
		isFresh(spotMetaKey, MARKET_CATALOG_META_STALE_TIME_MS) &&
		isFresh(perpDexsKey, MARKET_CATALOG_DEXS_STALE_TIME_MS) &&
		isFresh(allPerpMetasKey, MARKET_CATALOG_META_STALE_TIME_MS) &&
		hasCompleteCachedMarketCatalog(queryClient, env)
	);
}

function hasCompleteCachedMarketCatalog(queryClient: QueryClient, env: HyperliquidEnv): boolean {
	const [spotMetaKey, perpDexsKey, allPerpMetasKey] = getMarketCatalogQueryKeys(env);
	return hasCompleteMarketCatalogData({
		spotMeta: queryClient.getQueryData(spotMetaKey),
		perpDexs: queryClient.getQueryData(perpDexsKey),
		allPerpMetas: queryClient.getQueryData(allPerpMetasKey),
	});
}

function hasUnacceptableFutureCatalogTimestamp(queryClient: QueryClient, env: HyperliquidEnv): boolean {
	const maximumTimestamp = Date.now() + MARKET_CATALOG_DEXS_STALE_TIME_MS;
	return getMarketCatalogQueryKeys(env).some((queryKey) => {
		const state = queryClient.getQueryState(queryKey);
		return state !== undefined && state.dataUpdatedAt > maximumTimestamp;
	});
}

function removeCachedMarketCatalog(queryClient: QueryClient, env: HyperliquidEnv): void {
	for (const queryKey of getMarketCatalogQueryKeys(env)) {
		queryClient.removeQueries({ queryKey, exact: true });
	}
}

export async function bootstrapMarketCatalog(queryClient: QueryClient): Promise<void> {
	if (typeof window === "undefined") return;

	const isTestnet = getNetwork() === "testnet";
	const env: HyperliquidEnv = isTestnet ? "Testnet" : "Mainnet";
	seedPersistedMarketCatalog(queryClient, env);
	if (hasUnacceptableFutureCatalogTimestamp(queryClient, env) || !hasCompleteCachedMarketCatalog(queryClient, env)) {
		removeCachedMarketCatalog(queryClient, env);
	}
	if (hasFreshMarketCatalog(queryClient, env)) return;

	const { getMarketCatalogInfoClient } = await import("./market-catalog-info-client");
	const info = getMarketCatalogInfoClient(isTestnet);
	const queries = createMarketCatalogQueryOptions(info, env);

	await Promise.all([
		queryClient.prefetchQuery(queries[0]),
		queryClient.prefetchQuery(queries[1]),
		queryClient.prefetchQuery(queries[2]),
	]);
}

export function startMarketCatalogBootstrap(queryClient: QueryClient): void {
	if (typeof window === "undefined" || activeBootstraps.has(queryClient)) return;

	const task = bootstrapMarketCatalog(queryClient)
		.catch(() => undefined)
		.finally(() => {
			if (activeBootstraps.get(queryClient) === task) activeBootstraps.delete(queryClient);
		});
	activeBootstraps.set(queryClient, task);
}
