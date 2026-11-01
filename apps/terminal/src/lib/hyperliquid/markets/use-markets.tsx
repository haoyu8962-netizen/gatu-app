import type { MetaResponse, PerpDexsResponse, SpotMetaResponse } from "@nktkas/hyperliquid";
import {
	type BuilderPerpMarket,
	type HyperliquidEnv,
	type Markets,
	type PerpMarket,
	type SpotMarket,
	type MarketSpotToken as SpotToken,
	type UnifiedMarket,
	useHyperliquidTransport,
	useInfo,
} from "@sairn/hl-react";
import { useIsRestoring } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext, useMemo } from "react";
import { RQ_CACHE_MAX_AGE_MS } from "@/config/time";
import { getIconUrlFromMarketName, getSpotTokenDisplayNames } from "@/domain/market/tokens";
import { resolveMarketMarginTiers } from "@/domain/trade/order/liquidation";
import {
	getBuilderPerpAssetId,
	getBuilderPerpDisplayName,
	getBuilderPerpShortName,
	getPerpAssetId,
	getPerpDisplayName,
	getSpotAssetId,
	getSpotDisplayName,
} from "./helper";
import {
	MARKET_CATALOG_DEXS_STALE_TIME_MS,
	MARKET_CATALOG_META_STALE_TIME_MS,
	MARKET_CATALOG_REQUEST_TIMEOUT_MS,
} from "./market-catalog-query";
import {
	areAllPerpMetasValid,
	arePerpDexsValid,
	createMarketCatalogState,
	getRetryableMarketCatalogQueries,
	isSpotMetaValid,
	type MarketCatalogQueries,
	type MarketCatalogState,
} from "./market-catalog-state";

export interface MarketsWithExactLookup extends Markets {
	getMarketByName(name: string): UnifiedMarket | undefined;
	/** The display name of a token named as the protocol names it (balances, fee and ledger tokens). */
	getTokenDisplayName(name: string): string;
}

export interface MarketsContextValue extends MarketsWithExactLookup {
	readonly catalogState: MarketCatalogState;
	readonly catalogQueries: MarketCatalogQueries;
	retryMarketCatalog(): Promise<void>;
}

export interface CreateMarketsParams {
	env: HyperliquidEnv;
	perpMeta: MetaResponse | undefined;
	spotMeta: SpotMetaResponse | undefined;
	allPerpMetas: MetaResponse[] | undefined;
	perpDexs: PerpDexsResponse | undefined;
	isLoading: boolean;
	error: Error | null;
}

export function createMarkets(params: CreateMarketsParams): MarketsWithExactLookup {
	const { env, perpMeta, spotMeta, allPerpMetas, perpDexs, isLoading, error } = params;

	const perpMarkets: PerpMarket[] = [];
	if (perpMeta?.universe) {
		for (let i = 0; i < perpMeta.universe.length; i++) {
			const market = perpMeta.universe[i];
			if (market.isDelisted) continue;
			const marginTiers = resolveMarketMarginTiers({
				marginTableId: market.marginTableId,
				maxLeverage: market.maxLeverage,
				marginTables: perpMeta.marginTables,
			});
			perpMarkets.push({
				...market,
				...(marginTiers ? { marginTiers } : null),
				kind: "perp",
				shortName: market.name,
				pairName: getPerpDisplayName(market.name),
				routeName: market.name,
				assetId: getPerpAssetId(i),
				ctxIndex: i,
				iconUrl: getIconUrlFromMarketName(market.name, "perp"),
			});
		}
	}

	const spotMarkets: SpotMarket[] = [];
	const spotTokenDisplayNames = getSpotTokenDisplayNames(spotMeta?.tokens ?? [], env);
	const spotTokens: SpotToken[] = (spotMeta?.tokens ?? []).map((token) => {
		const displayName = spotTokenDisplayNames.get(token.index) ?? token.name;
		return {
			...token,
			displayName,
			iconUrl: getIconUrlFromMarketName(displayName, "spot"),
			transferDecimals: token.weiDecimals,
			isWrapped: displayName !== token.name,
		};
	});
	const spotTokenByIndex = new Map(spotTokens.map((token) => [token.index, token]));

	if (spotMeta?.universe && spotTokens.length > 0) {
		const quoteTokenIndexes = new Set(spotMeta.universe.map((pair) => pair.tokens[1]));

		for (const pair of spotMeta.universe) {
			const tokensInfo = pair.tokens.map((idx) => spotTokenByIndex.get(idx)).filter((t): t is SpotToken => !!t);

			if (tokensInfo.length < 2) continue;

			const [baseToken, quoteToken] = tokensInfo;
			const displayName = getSpotDisplayName(baseToken.displayName, quoteToken.displayName);

			spotMarkets.push({
				...pair,
				kind: "spot",
				shortName: baseToken.displayName,
				pairName: displayName,
				routeName: displayName,
				assetId: getSpotAssetId(pair.index),
				ctxIndex: pair.index,
				tokensInfo,
				szDecimals: baseToken.szDecimals,
				isStablePair: quoteTokenIndexes.has(pair.tokens[0]),
				iconUrl: baseToken.iconUrl,
			});
		}
	}

	const spotPairNameCounts = new Map<string, number>();
	for (const market of spotMarkets) {
		spotPairNameCounts.set(market.pairName, (spotPairNameCounts.get(market.pairName) ?? 0) + 1);
	}
	for (const market of spotMarkets) {
		if ((spotPairNameCounts.get(market.pairName) ?? 0) > 1) {
			market.routeName = market.name;
		}
	}

	const builderPerpMarkets: BuilderPerpMarket[] = [];
	if (allPerpMetas && perpDexs && allPerpMetas.length > 1) {
		for (let dexIndex = 1; dexIndex < allPerpMetas.length; dexIndex++) {
			const meta = allPerpMetas[dexIndex];
			const dexInfo = perpDexs[dexIndex];
			if (!meta || !dexInfo) continue;

			const dexName = dexInfo.name;
			const quoteToken = spotTokenByIndex.get(meta.collateralToken);

			for (let assetIndex = 0; assetIndex < meta.universe.length; assetIndex++) {
				const asset = meta.universe[assetIndex];
				if (asset.isDelisted) continue;
				const marginTiers = resolveMarketMarginTiers({
					marginTableId: asset.marginTableId,
					maxLeverage: asset.maxLeverage,
					marginTables: meta.marginTables,
				});

				builderPerpMarkets.push({
					...asset,
					...(marginTiers ? { marginTiers } : null),
					kind: "builderPerp",
					shortName: getBuilderPerpShortName(asset.name),
					pairName: getBuilderPerpDisplayName(asset.name, quoteToken?.displayName),
					routeName: asset.name,
					assetId: getBuilderPerpAssetId(dexIndex, assetIndex),
					dex: dexName,
					dexIndex,
					deployerFeeScale: dexInfo.deployerFeeScale ?? "1",
					ctxIndex: assetIndex,
					quoteToken,
					iconUrl: getIconUrlFromMarketName(asset.name, "builderPerp"),
				});
			}
		}
	}

	const allMarkets: UnifiedMarket[] = [...perpMarkets, ...spotMarkets, ...builderPerpMarkets];

	const marketByName = new Map<string, UnifiedMarket>();
	for (const market of allMarkets) {
		marketByName.set(market.name, market);
	}

	const tokenByProtocolName = new Map(spotTokens.map((token) => [token.name, token]));
	const tokenByName = new Map(tokenByProtocolName);
	const tokenDisplayNameCounts = new Map<string, number>();
	for (const token of spotTokens) {
		tokenDisplayNameCounts.set(token.displayName, (tokenDisplayNameCounts.get(token.displayName) ?? 0) + 1);
	}
	for (const token of spotTokens) {
		if (
			token.displayName !== token.name &&
			!tokenByName.has(token.displayName) &&
			tokenDisplayNameCounts.get(token.displayName) === 1
		) {
			tokenByName.set(token.displayName, token);
		}
	}

	return {
		all: allMarkets,
		perp: perpMarkets,
		spot: spotMarkets,
		builderPerp: builderPerpMarkets,
		tokens: spotTokens,
		isLoading,
		error,

		getMarket(coin: string): UnifiedMarket | undefined {
			return marketByName.get(coin);
		},

		getMarketByName(name: string): UnifiedMarket | undefined {
			return marketByName.get(name);
		},

		getToken(name: string): SpotToken | undefined {
			return tokenByName.get(name);
		},

		getTokenDisplayName(name: string): string {
			return tokenByProtocolName.get(name)?.displayName ?? name;
		},

		getSzDecimals(coin: string): number {
			return marketByName.get(coin)?.szDecimals ?? 4;
		},

		getAssetId(coin: string): number | undefined {
			return marketByName.get(coin)?.assetId;
		},
	};
}

function createEmptyMarkets(): MarketsWithExactLookup {
	return createMarkets({
		env: "Mainnet",
		perpMeta: undefined,
		spotMeta: undefined,
		allPerpMetas: undefined,
		perpDexs: undefined,
		isLoading: true,
		error: null,
	});
}

const MarketsContext = createContext<MarketsContextValue | null>(null);

interface Props {
	children: ReactNode;
}

export function MarketsProvider({ children }: Props) {
	const isRestoring = useIsRestoring();
	const { env } = useHyperliquidTransport();
	const spotMetaQuery = useInfo("spotMeta", undefined, {
		refetchInterval: Infinity,
		staleTime: MARKET_CATALOG_META_STALE_TIME_MS,
		gcTime: RQ_CACHE_MAX_AGE_MS,
		persist: true,
		requestTimeoutMs: MARKET_CATALOG_REQUEST_TIMEOUT_MS,
		retry: false,
		retryOnMount: false,
	});
	const perpDexsQuery = useInfo("perpDexs", undefined, {
		refetchInterval: Infinity,
		staleTime: MARKET_CATALOG_DEXS_STALE_TIME_MS,
		gcTime: RQ_CACHE_MAX_AGE_MS,
		persist: true,
		requestTimeoutMs: MARKET_CATALOG_REQUEST_TIMEOUT_MS,
		retry: false,
		retryOnMount: false,
	});
	const allPerpMetasQuery = useInfo("allPerpMetas", undefined, {
		refetchInterval: Infinity,
		staleTime: MARKET_CATALOG_META_STALE_TIME_MS,
		gcTime: RQ_CACHE_MAX_AGE_MS,
		persist: true,
		requestTimeoutMs: MARKET_CATALOG_REQUEST_TIMEOUT_MS,
		retry: false,
		retryOnMount: false,
	});

	const { isLoading: spotLoading, error: spotError } = spotMetaQuery;
	const { isLoading: dexsLoading, error: dexsError } = perpDexsQuery;
	const { isLoading: allMetasLoading, error: allMetasError } = allPerpMetasQuery;
	const spotMeta = isSpotMetaValid(spotMetaQuery.data) ? spotMetaQuery.data : undefined;
	const perpDexs = arePerpDexsValid(perpDexsQuery.data) ? perpDexsQuery.data : undefined;
	const allPerpMetas = areAllPerpMetasValid(allPerpMetasQuery.data) ? allPerpMetasQuery.data : undefined;

	const perpMeta = allPerpMetas?.[0];

	const isLoading = spotLoading || dexsLoading || allMetasLoading;
	const error = spotError ?? dexsError ?? allMetasError ?? null;

	const baseMarkets = useMemo(
		() =>
			createMarkets({
				env,
				perpMeta,
				spotMeta,
				allPerpMetas,
				perpDexs,
				isLoading,
				error,
			}),
		[env, perpMeta, spotMeta, allPerpMetas, perpDexs, isLoading, error],
	);
	const catalogQueries = useMemo<MarketCatalogQueries>(
		() => ({
			spotMeta: {
				data: spotMetaQuery.data,
				status: spotMetaQuery.status,
				fetchStatus: spotMetaQuery.fetchStatus,
				error: spotMetaQuery.error,
				isStale: spotMetaQuery.isStale,
				refetch: spotMetaQuery.refetch,
			},
			perpDexs: {
				data: perpDexsQuery.data,
				status: perpDexsQuery.status,
				fetchStatus: perpDexsQuery.fetchStatus,
				error: perpDexsQuery.error,
				isStale: perpDexsQuery.isStale,
				refetch: perpDexsQuery.refetch,
			},
			allPerpMetas: {
				data: allPerpMetasQuery.data,
				status: allPerpMetasQuery.status,
				fetchStatus: allPerpMetasQuery.fetchStatus,
				error: allPerpMetasQuery.error,
				isStale: allPerpMetasQuery.isStale,
				refetch: allPerpMetasQuery.refetch,
			},
		}),
		[
			spotMetaQuery.data,
			spotMetaQuery.status,
			spotMetaQuery.fetchStatus,
			spotMetaQuery.error,
			spotMetaQuery.isStale,
			spotMetaQuery.refetch,
			perpDexsQuery.data,
			perpDexsQuery.status,
			perpDexsQuery.fetchStatus,
			perpDexsQuery.error,
			perpDexsQuery.isStale,
			perpDexsQuery.refetch,
			allPerpMetasQuery.data,
			allPerpMetasQuery.status,
			allPerpMetasQuery.fetchStatus,
			allPerpMetasQuery.error,
			allPerpMetasQuery.isStale,
			allPerpMetasQuery.refetch,
		],
	);
	const catalogState = useMemo(
		() =>
			createMarketCatalogState({
				isRestoring,
				hasUsableMarkets: baseMarkets.all.length > 0,
				queries: catalogQueries,
			}),
		[isRestoring, baseMarkets.all.length, catalogQueries],
	);
	const retryMarketCatalog = useCallback(async () => {
		const retryableQueries = getRetryableMarketCatalogQueries(catalogQueries);
		await Promise.all(retryableQueries.map((query) => query.refetch()));
	}, [catalogQueries]);
	const markets = useMemo<MarketsContextValue>(
		() => ({
			...baseMarkets,
			catalogState,
			catalogQueries,
			retryMarketCatalog,
		}),
		[baseMarkets, catalogState, catalogQueries, retryMarketCatalog],
	);

	return <MarketsContext.Provider value={markets}>{children}</MarketsContext.Provider>;
}

export function useMarkets(): MarketsContextValue {
	const context = useContext(MarketsContext);

	if (!context) {
		throw new Error("useMarkets must be used within a MarketsProvider");
	}
	return context;
}

export { createEmptyMarkets };
