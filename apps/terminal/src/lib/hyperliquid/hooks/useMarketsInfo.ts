import {
	type BuilderPerpMarket,
	type CompactPerpAssetCtxsEvent,
	type CompactSpotAssetCtxsEvent,
	canUseL2Decompression,
	type PerpMarket,
	type SpotMarket,
	type SubscriptionStatus,
	useHyperliquidTransport,
	useSubscription,
} from "@sairn/hl-react";
import { useEffect, useMemo, useState } from "react";
import {
	LIVE_MARK_MAX_STALE_MS,
	type MarkPriceStatus,
	resolveActiveMarketPrice,
	resolveFastMarketPrice,
} from "@/domain/trade/market-price";
import { loadLastMark, saveLastMark } from "@/lib/last-mark-cache";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useSelectedMarket } from "@/stores/use-market-store";
import type { DexAssetCtx, SpotAssetCtx, SpotAssetCtxs } from "@/types/hyperliquid";
import { getMarketApiCoin, getSpotMarketApiCoin } from "../market-identity";
import { disableCompactMarketCtxs, isCompactMarketCtxsDisabled } from "../markets/market-ctxs-fallback";
import { useMarkets } from "../markets/use-markets";
import { useMarketsInfoContext } from "./MarketsInfoProvider";

interface LiveMarketPriceFields {
	markPriceStatus: MarkPriceStatus;
	markPriceReceivedAt: number | undefined;
	midPriceReceivedAt: number | undefined;
	marginMetadataReady?: boolean;
	/** The row's own context (`prevDayPx`, volume, funding, open interest) came from a live, current frame. */
	assetContextLive?: boolean;
}

export type PerpMarketInfo = PerpMarket & Partial<DexAssetCtx> & LiveMarketPriceFields;
export type SpotMarketInfo = SpotMarket & Partial<SpotAssetCtx> & Partial<DexAssetCtx> & LiveMarketPriceFields;
export type BuilderPerpMarketInfo = BuilderPerpMarket & Partial<DexAssetCtx> & LiveMarketPriceFields;

export type UnifiedMarketInfo = PerpMarketInfo | SpotMarketInfo | BuilderPerpMarketInfo;

export interface BuilderPerpMarketsInfo {
	all: BuilderPerpMarketInfo[];
	[dexName: string]: BuilderPerpMarketInfo[];
}

export interface UseMarketsInfoOptions {
	updateInterval?: number;
	subscriptionKeepAliveMs?: number;
	alwaysSubscribeAll?: boolean;
	subscriptionsEnabled?: boolean;
}

interface MarketsInfoResult {
	perpMarkets: PerpMarketInfo[];
	spotMarkets: SpotMarketInfo[];
	builderPerpMarkets: BuilderPerpMarketsInfo;
	markets: UnifiedMarketInfo[];
}

const COMPACT_MARKET_CTXS_SUPPORTED = canUseL2Decompression();

export function createMarketLookup(markets: readonly UnifiedMarketInfo[]) {
	const byName = new Map<string, UnifiedMarketInfo>();
	const pairNameCounts = new Map<string, number>();

	for (const market of markets) {
		byName.set(market.name, market);
		pairNameCounts.set(market.pairName, (pairNameCounts.get(market.pairName) ?? 0) + 1);
	}

	const byPairName = new Map<string, UnifiedMarketInfo>();
	for (const market of markets) {
		if (pairNameCounts.get(market.pairName) === 1) {
			byPairName.set(market.pairName, market);
		}
	}

	return { byName, byPairName };
}

function keySpotCtxsByCoin(spotCtxs: SpotAssetCtxs): CompactSpotAssetCtxsEvent {
	return Object.fromEntries(spotCtxs.map((ctx) => [ctx.coin, ctx]));
}

function useSubscriptionWarmWindow(enabled: boolean, keepAliveMs: number) {
	const [isWarm, setIsWarm] = useState(enabled);

	useEffect(() => {
		if (enabled) {
			setIsWarm(true);
			return;
		}

		if (keepAliveMs <= 0) {
			setIsWarm(false);
			return;
		}

		const timeout = setTimeout(() => {
			setIsWarm(false);
		}, keepAliveMs);

		return () => clearTimeout(timeout);
	}, [enabled, keepAliveMs]);

	return isWarm;
}

function isLiveContextsSubscription(contexts: unknown, status: SubscriptionStatus, isStale: boolean): boolean {
	return contexts !== undefined && status === "active" && !isStale;
}

function getDexCtxs(allDexsCtxs: CompactPerpAssetCtxsEvent | undefined, dexName: string) {
	if (!allDexsCtxs) return undefined;
	const dexEntry = allDexsCtxs.find((entry) => entry[0] === dexName);
	return dexEntry?.[1];
}

export function useMarketsInfoInternal(options: UseMarketsInfoOptions = {}) {
	const {
		updateInterval = 5000,
		subscriptionKeepAliveMs = 10_000,
		alwaysSubscribeAll = false,
		subscriptionsEnabled = true,
	} = options;
	const { scope } = useExchangeScope();

	const needsPerp = alwaysSubscribeAll || scope === "all" || scope === "perp" || scope === "builders-perp";
	const needsSpot = alwaysSubscribeAll || scope === "all" || scope === "spot";
	const warmPerpSubscriptionEnabled = useSubscriptionWarmWindow(needsPerp, subscriptionKeepAliveMs);
	const warmSpotSubscriptionEnabled = useSubscriptionWarmWindow(needsSpot, subscriptionKeepAliveMs);
	const perpSubscriptionEnabled = subscriptionsEnabled && warmPerpSubscriptionEnabled;
	const spotSubscriptionEnabled = subscriptionsEnabled && warmSpotSubscriptionEnabled;
	const fastPriceSubscriptionEnabled = perpSubscriptionEnabled || spotSubscriptionEnabled;

	const markets = useMarkets();
	const [compactCtxsFailed, setCompactCtxsFailed] = useState(isCompactMarketCtxsDisabled);
	const useCompactCtxs = COMPACT_MARKET_CTXS_SUPPORTED && !compactCtxsFailed;
	const [fastPricesFailed, setFastPricesFailed] = useState(false);
	const fastPricesAvailable = COMPACT_MARKET_CTXS_SUPPORTED && !fastPricesFailed;
	const contextMaxStaleMs = fastPricesAvailable ? undefined : LIVE_MARK_MAX_STALE_MS;
	const {
		data: compactPerpCtxs,
		error: compactPerpError,
		status: compactPerpStatus,
		isStale: isCompactPerpStale,
		lastMessageAt: compactPerpLastMessageAt,
	} = useSubscription("pac", undefined, {
		enabled: perpSubscriptionEnabled && useCompactCtxs,
		throttleMs: updateInterval,
		maxStaleMs: contextMaxStaleMs,
	});
	const {
		data: compactSpotCtxs,
		error: compactSpotError,
		status: compactSpotStatus,
		isStale: isCompactSpotStale,
		lastMessageAt: compactSpotLastMessageAt,
	} = useSubscription("sac", undefined, {
		enabled: spotSubscriptionEnabled && useCompactCtxs,
		throttleMs: updateInterval,
		maxStaleMs: contextMaxStaleMs,
	});
	const {
		data: allDexsCtxsEvent,
		status: allDexsCtxsStatus,
		isStale: isAllDexsCtxsStale,
		lastMessageAt: allDexsCtxsLastMessageAt,
	} = useSubscription("allDexsAssetCtxs", undefined, {
		enabled: perpSubscriptionEnabled && !useCompactCtxs,
		throttleMs: updateInterval,
		maxStaleMs: contextMaxStaleMs,
	});
	const {
		data: spotCtxsEvent,
		status: spotCtxsStatus,
		isStale: isSpotCtxsStale,
		lastMessageAt: spotCtxsLastMessageAt,
	} = useSubscription("spotAssetCtxs", undefined, {
		enabled: spotSubscriptionEnabled && !useCompactCtxs,
		throttleMs: updateInterval,
		maxStaleMs: contextMaxStaleMs,
	});
	const {
		data: fastAssetCtxs,
		error: fastPriceError,
		status: fastPriceSubscriptionStatus,
		isStale: isFastPriceStale,
		lastMessageAt: fastPriceLastMessageAt,
	} = useSubscription("fastAssetCtxs", undefined, {
		enabled: fastPriceSubscriptionEnabled && fastPricesAvailable,
		maxStaleMs: LIVE_MARK_MAX_STALE_MS,
	});

	useEffect(() => {
		const error = compactPerpError ?? compactSpotError;
		if (error === undefined || error === null) return;
		disableCompactMarketCtxs(error);
		setCompactCtxsFailed(true);
	}, [compactPerpError, compactSpotError]);

	useEffect(() => {
		if (fastPriceError != null) setFastPricesFailed(true);
	}, [fastPriceError]);

	const allDexsCtxs = compactPerpCtxs ?? allDexsCtxsEvent?.ctxs;
	const perpCtxsReceivedAt = compactPerpCtxs !== undefined ? compactPerpLastMessageAt : allDexsCtxsLastMessageAt;
	const perpContextsLive =
		compactPerpCtxs !== undefined
			? isLiveContextsSubscription(compactPerpCtxs, compactPerpStatus, isCompactPerpStale)
			: isLiveContextsSubscription(allDexsCtxsEvent?.ctxs, allDexsCtxsStatus, isAllDexsCtxsStale);
	const legacySpotCtxs = useMemo(() => (spotCtxsEvent ? keySpotCtxsByCoin(spotCtxsEvent) : undefined), [spotCtxsEvent]);
	const spotCtxs = compactSpotCtxs ?? legacySpotCtxs;
	const spotCtxsReceivedAt = compactSpotCtxs !== undefined ? compactSpotLastMessageAt : spotCtxsLastMessageAt;
	const spotContextsLive =
		compactSpotCtxs !== undefined
			? isLiveContextsSubscription(compactSpotCtxs, compactSpotStatus, isCompactSpotStale)
			: isLiveContextsSubscription(spotCtxsEvent, spotCtxsStatus, isSpotCtxsStale);

	const result = useMemo((): MarketsInfoResult => {
		const perpCtxs = getDexCtxs(allDexsCtxs, "");
		const catalogMetadataReady = markets.catalogState?.status === "ready" && !markets.catalogState.isStale;
		const withLivePrice = <T extends PerpMarket | SpotMarket | BuilderPerpMarket, C extends object | undefined>(
			market: T,
			context: C,
			contextsLive: boolean,
			contextReceivedAt: number | undefined,
		): T & C & LiveMarketPriceFields => {
			const price = resolveFastMarketPrice(
				fastPricesAvailable
					? {
							coin: market.name,
							enabled: fastPriceSubscriptionEnabled,
							data: fastAssetCtxs,
							subscriptionStatus: fastPriceSubscriptionStatus,
							isStale: isFastPriceStale,
							lastMessageAt: fastPriceLastMessageAt,
						}
					: {
							coin: market.name,
							enabled: fastPriceSubscriptionEnabled,
							data: context && { [market.name]: context },
							subscriptionStatus: contextsLive ? "active" : "subscribing",
							isStale: false,
							lastMessageAt: contextReceivedAt,
						},
			);
			return {
				...market,
				...context,
				...(price.markPx ? { markPx: price.markPx } : null),
				midPx: price.midPx,
				markPriceStatus: price.status,
				markPriceReceivedAt: price.receivedAt,
				midPriceReceivedAt: price.midReceivedAt,
				marginMetadataReady: market.kind !== "spot" && catalogMetadataReady && market.marginTiers !== undefined,
				assetContextLive: contextsLive && context !== undefined,
			} as T & C & LiveMarketPriceFields;
		};

		const perpMarketsInfo: PerpMarketInfo[] = markets.perp.map((market) =>
			withLivePrice(market, perpCtxs?.[market.ctxIndex], perpContextsLive, perpCtxsReceivedAt),
		);

		const spotMarketsInfo: SpotMarketInfo[] = markets.spot.map((market) =>
			withLivePrice(market, spotCtxs?.[market.name], spotContextsLive, spotCtxsReceivedAt),
		);

		const builderPerpMarketsInfo: BuilderPerpMarketsInfo = { all: [] };

		for (const market of markets.builderPerp) {
			const dexCtxs = getDexCtxs(allDexsCtxs, market.dex);
			const marketInfo: BuilderPerpMarketInfo = withLivePrice(
				market,
				dexCtxs?.[market.ctxIndex],
				perpContextsLive,
				perpCtxsReceivedAt,
			);

			builderPerpMarketsInfo.all.push(marketInfo);

			if (!builderPerpMarketsInfo[market.dex]) {
				builderPerpMarketsInfo[market.dex] = [];
			}
			builderPerpMarketsInfo[market.dex].push(marketInfo);
		}

		return {
			perpMarkets: perpMarketsInfo,
			spotMarkets: spotMarketsInfo,
			builderPerpMarkets: builderPerpMarketsInfo,
			markets: [...perpMarketsInfo, ...spotMarketsInfo, ...builderPerpMarketsInfo.all],
		};
	}, [
		markets.perp,
		markets.spot,
		markets.builderPerp,
		markets.catalogState?.status,
		markets.catalogState?.isStale,
		allDexsCtxs,
		spotCtxs,
		perpContextsLive,
		spotContextsLive,
		perpCtxsReceivedAt,
		spotCtxsReceivedAt,
		fastPricesAvailable,
		fastPriceSubscriptionEnabled,
		fastAssetCtxs,
		fastPriceSubscriptionStatus,
		isFastPriceStale,
		fastPriceLastMessageAt,
	]);

	const marketLookup = useMemo(() => createMarketLookup(result.markets), [result.markets]);

	const getMarketInfo = useMemo(() => {
		return (name: string): UnifiedMarketInfo | undefined => {
			return marketLookup.byName.get(name) ?? marketLookup.byPairName.get(name);
		};
	}, [marketLookup]);
	const getMarketByName = useMemo(() => {
		return (name: string): UnifiedMarketInfo | undefined => marketLookup.byName.get(name);
	}, [marketLookup]);

	return {
		...result,
		perpContextsLive,
		isLoading: markets.isLoading,
		error: markets.error,
		catalogState: markets.catalogState,
		catalogQueries: markets.catalogQueries,
		retryMarketCatalog: markets.retryMarketCatalog,
		getMarketByName,
		getMarketInfo,
	};
}

export type UseMarketsInfoReturn = ReturnType<typeof useMarketsInfoInternal>;

export function useMarketsInfo(): UseMarketsInfoReturn {
	return useMarketsInfoContext();
}

export function useSelectedMarketInfo() {
	const { env } = useHyperliquidTransport();
	const { routeMarketName } = useExchangeScope();
	const selectedMarketName = useSelectedMarket();
	const { getMarketInfo, isLoading, error } = useMarketsInfo();

	const routeMarket = routeMarketName ? getMarketInfo(routeMarketName) : undefined;
	const resolvedMarket = routeMarketName ? routeMarket : getMarketInfo(selectedMarketName);
	const isSpot = resolvedMarket?.kind === "spot";
	const perpCoin = resolvedMarket && !isSpot ? getMarketApiCoin(resolvedMarket) : "";
	const spotCoin = resolvedMarket && isSpot ? getSpotMarketApiCoin(resolvedMarket) : "";
	const perpPriceSubscription = useSubscription(
		"activeAssetCtx",
		{ coin: perpCoin },
		{ enabled: !!perpCoin, maxStaleMs: LIVE_MARK_MAX_STALE_MS },
	);
	const spotPriceSubscription = useSubscription(
		"activeSpotAssetCtx",
		{ coin: spotCoin },
		{ enabled: !!spotCoin, maxStaleMs: LIVE_MARK_MAX_STALE_MS },
	);
	const activePriceSubscription = isSpot ? spotPriceSubscription : perpPriceSubscription;
	const activeCoin = isSpot ? spotCoin : perpCoin;
	const activePrice = resolveActiveMarketPrice({
		coin: activeCoin,
		enabled: !!activeCoin,
		data: activePriceSubscription.data,
		subscriptionStatus: activePriceSubscription.status,
		isStale: activePriceSubscription.isStale,
		lastMessageAt: activePriceSubscription.lastMessageAt,
	});
	const market = useMemo(() => {
		if (!resolvedMarket) return undefined;
		return {
			...resolvedMarket,
			...(activePrice.markPx ? { markPx: activePrice.markPx } : null),
			// SharedAssetCtx.midPx is optional. Explicitly clear an older fast/slow mid
			// when the exact-market event does not carry one so execution falls back
			// to the fresh mark instead of inheriting a stale reference price.
			midPx: activePrice.midPx,
			markPriceStatus: activePrice.status,
			markPriceReceivedAt: activePrice.receivedAt,
			midPriceReceivedAt: activePrice.midReceivedAt,
		};
	}, [
		resolvedMarket,
		activePrice.markPx,
		activePrice.midPx,
		activePrice.status,
		activePrice.receivedAt,
		activePrice.midReceivedAt,
	]);
	const cacheMarketName = market?.name ?? selectedMarketName;
	const marketName = market?.name;
	const liveMark = market?.markPx;
	const oraclePrice = market?.oraclePx;

	useEffect(() => {
		if (!cacheMarketName || marketName !== cacheMarketName) return;
		if (!liveMark) return;
		saveLastMark(env, cacheMarketName, liveMark, oraclePrice);
	}, [env, cacheMarketName, liveMark, marketName, oraclePrice]);

	const data = useMemo(() => {
		if (!market) return undefined;
		if (market.markPx) return market;
		const cached = cacheMarketName ? loadLastMark(env, cacheMarketName) : null;
		if (!cached) return market;
		return { ...market, markPx: cached.markPx, oraclePx: market.oraclePx ?? cached.oraclePx };
	}, [env, market, cacheMarketName]);

	return {
		data,
		isLoading,
		error,
		isResolved: !!market,
	};
}
