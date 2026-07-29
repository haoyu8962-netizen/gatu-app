import {
	type BuilderPerpMarket,
	type Markets,
	type PerpMarket,
	type SpotMarket,
	type MarketSpotToken as SpotToken,
	type UnifiedMarket,
	useInfo,
} from "@gatu/hl-react";
import type { MetaResponse, PerpDexsResponse, SpotMetaResponse } from "@nktkas/hyperliquid";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { getIconUrlFromMarketName, getTokenDisplayName, getUnderlyingAsset } from "@/domain/market/tokens";
import {
	getBuilderPerpAssetId,
	getBuilderPerpDisplayName,
	getBuilderPerpShortName,
	getPerpAssetId,
	getPerpDisplayName,
	getSpotAssetId,
	getSpotDisplayName,
} from "./helper";

const META_STALE_TIME_MS = 30 * 60 * 1_000;
const DEXS_STALE_TIME_MS = 5 * 60 * 1_000;

export interface CreateMarketsParams {
	perpMeta: MetaResponse | undefined;
	spotMeta: SpotMetaResponse | undefined;
	allPerpMetas: MetaResponse[] | undefined;
	perpDexs: PerpDexsResponse | undefined;
	isLoading: boolean;
	error: Error | null;
}

export function createMarkets(params: CreateMarketsParams): Markets {
	const { perpMeta, spotMeta, allPerpMetas, perpDexs, isLoading, error } = params;

	const perpMarkets: PerpMarket[] = [];
	if (perpMeta?.universe) {
		for (let i = 0; i < perpMeta.universe.length; i++) {
			const market = perpMeta.universe[i];
			if (market.isDelisted) continue;
			perpMarkets.push({
				...market,
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
	const spotTokens: SpotToken[] = (spotMeta?.tokens ?? []).map((token) => {
		const displayName = getTokenDisplayName(token);
		return {
			...token,
			displayName,
			iconUrl: getIconUrlFromMarketName(getUnderlyingAsset(token) ?? token.name, "spot"),
			transferDecimals: token.weiDecimals + (token.evmContract?.evm_extra_wei_decimals ?? 0),
			isWrapped: displayName !== token.name,
		};
	});
	const spotTokenByIndex = new Map(spotTokens.map((token) => [token.index, token]));

	if (spotMeta?.universe && spotTokens.length > 0) {
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
				iconUrl: getIconUrlFromMarketName(getUnderlyingAsset(baseToken) ?? baseToken.name, "spot"),
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

				builderPerpMarkets.push({
					...asset,
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

	const tokenByName = new Map<string, SpotToken>();
	for (const token of spotTokens) {
		tokenByName.set(token.name, token);
	}
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

		getToken(name: string): SpotToken | undefined {
			return tokenByName.get(name);
		},

		getSzDecimals(coin: string): number {
			return marketByName.get(coin)?.szDecimals ?? 4;
		},

		getAssetId(coin: string): number | undefined {
			return marketByName.get(coin)?.assetId;
		},
	};
}

function createEmptyMarkets(): Markets {
	return createMarkets({
		perpMeta: undefined,
		spotMeta: undefined,
		allPerpMetas: undefined,
		perpDexs: undefined,
		isLoading: true,
		error: null,
	});
}

const MarketsContext = createContext<Markets | null>(null);

interface Props {
	children: ReactNode;
}

export function MarketsProvider({ children }: Props) {
	const {
		data: spotMeta,
		isLoading: spotLoading,
		error: spotError,
	} = useInfo("spotMeta", undefined, { refetchInterval: Infinity, staleTime: META_STALE_TIME_MS, persist: true });

	const {
		data: perpDexs,
		isLoading: dexsLoading,
		error: dexsError,
	} = useInfo("perpDexs", undefined, { refetchInterval: Infinity, staleTime: DEXS_STALE_TIME_MS, persist: true });

	const {
		data: allPerpMetas,
		isLoading: allMetasLoading,
		error: allMetasError,
	} = useInfo("allPerpMetas", undefined, { refetchInterval: Infinity, staleTime: META_STALE_TIME_MS, persist: true });

	const perpMeta = allPerpMetas?.[0];

	const isLoading = spotLoading || dexsLoading || allMetasLoading;
	const error = spotError ?? dexsError ?? allMetasError ?? null;

	const markets = useMemo(
		() =>
			createMarkets({
				perpMeta,
				spotMeta,
				allPerpMetas,
				perpDexs,
				isLoading,
				error,
			}),
		[perpMeta, spotMeta, allPerpMetas, perpDexs, isLoading, error],
	);

	return <MarketsContext.Provider value={markets}>{children}</MarketsContext.Provider>;
}

export function useMarkets(): Markets {
	const context = useContext(MarketsContext);

	if (!context) {
		throw new Error("useMarkets must be used within a MarketsProvider");
	}
	return context;
}

export { createEmptyMarkets };
