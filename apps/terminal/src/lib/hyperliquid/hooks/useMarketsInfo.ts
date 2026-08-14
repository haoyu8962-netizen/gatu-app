import {
	type BuilderPerpMarket,
	type PerpMarket,
	type SpotMarket,
	useHyperliquid,
	useSubscription,
} from "@gatu/hl-react";
import { getFastAssetCtxFieldReceivedAt } from "@gatu/hl-react/registries/subscription";
import { useEffect, useMemo, useState } from "react";
import { STORAGE_KEYS } from "@/config/app";
import { MARKETS_STATS_TTL_MS } from "@/config/time";
import {
	LIVE_MARK_MAX_STALE_MS,
	type MarkPriceStatus,
	resolveActiveMarketPrice,
	resolveFastMarketPrice,
} from "@/domain/trade/market-price";
import { loadLastMark, saveLastMark } from "@/lib/last-mark-cache";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useSelectedMarket } from "@/stores/use-market-store";
import type { AllDexsAssetCtxs, DexAssetCtx, SpotAssetCtx, SpotAssetCtxs } from "@/types/hyperliquid";
import { getMarketApiCoin, getSpotMarketApiCoin } from "../market-identity";
import { useMarkets } from "../markets/use-markets";
import { useMarketsInfoContext } from "./MarketsInfoProvider";

interface LiveMarketPriceFields {
	markPriceStatus: MarkPriceStatus;
	markPriceReceivedAt: number | undefined;
	midPriceReceivedAt: number | undefined;
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

interface StatsCache {
	env: "Mainnet" | "Testnet";
	allDexsCtxs: AllDexsAssetCtxs | undefined;
	spotCtxs: SpotAssetCtxs | undefined;
	savedAt: number;
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAllDexsAssetCtxs(value: unknown): value is AllDexsAssetCtxs {
	return (
		Array.isArray(value) &&
		value.every(
			(entry) =>
				Array.isArray(entry) &&
				entry.length === 2 &&
				typeof entry[0] === "string" &&
				Array.isArray(entry[1]) &&
				entry[1].every(isRecord),
		)
	);
}

function isSpotAssetCtxs(value: unknown): value is SpotAssetCtxs {
	return Array.isArray(value) && value.every(isRecord);
}

function removeStatsCache() {
	try {
		sessionStorage.removeItem(STORAGE_KEYS.MARKETS_STATS);
	} catch {}
}

function loadStatsCache(env: "Mainnet" | "Testnet"): StatsCache | null {
	if (typeof window === "undefined") return null;
	try {
		const json = sessionStorage.getItem(STORAGE_KEYS.MARKETS_STATS);
		if (!json) return null;
		const data: unknown = JSON.parse(json);
		const now = Date.now();
		if (
			!isRecord(data) ||
			data.env !== env ||
			typeof data.savedAt !== "number" ||
			!Number.isFinite(data.savedAt) ||
			data.savedAt > now + 60_000 ||
			now - data.savedAt > MARKETS_STATS_TTL_MS ||
			(data.allDexsCtxs !== undefined && !isAllDexsAssetCtxs(data.allDexsCtxs)) ||
			(data.spotCtxs !== undefined && !isSpotAssetCtxs(data.spotCtxs))
		) {
			removeStatsCache();
			return null;
		}
		return data as unknown as StatsCache;
	} catch {
		removeStatsCache();
		return null;
	}
}

function saveStatsCache(
	env: "Mainnet" | "Testnet",
	allDexsCtxs: AllDexsAssetCtxs | undefined,
	spotCtxs: SpotAssetCtxs | undefined,
) {
	if (typeof window === "undefined") return;
	if (!allDexsCtxs && !spotCtxs) return;
	try {
		const data: StatsCache = { env, allDexsCtxs, spotCtxs, savedAt: Date.now() };
		sessionStorage.setItem(STORAGE_KEYS.MARKETS_STATS, JSON.stringify(data));
	} catch {}
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

function getDexCtxs(allDexsCtxs: AllDexsAssetCtxs | undefined, dexName: string) {
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
	const { env } = useHyperliquid();
	const { scope } = useExchangeScope();

	const needsPerp = alwaysSubscribeAll || scope === "all" || scope === "perp" || scope === "builders-perp";
	const needsSpot = alwaysSubscribeAll || scope === "all" || scope === "spot";
	const warmPerpSubscriptionEnabled = useSubscriptionWarmWindow(needsPerp, subscriptionKeepAliveMs);
	const warmSpotSubscriptionEnabled = useSubscriptionWarmWindow(needsSpot, subscriptionKeepAliveMs);
	const perpSubscriptionEnabled = subscriptionsEnabled && warmPerpSubscriptionEnabled;
	const spotSubscriptionEnabled = subscriptionsEnabled && warmSpotSubscriptionEnabled;
	const fastPriceSubscriptionEnabled = perpSubscriptionEnabled || spotSubscriptionEnabled;

	const markets = useMarkets();
	const { data: allDexsCtxsEvent } = useSubscription("allDexsAssetCtxs", undefined, {
		enabled: perpSubscriptionEnabled,
		throttleMs: updateInterval,
	});
	const { data: spotCtxsEvent } = useSubscription("spotAssetCtxs", undefined, {
		enabled: spotSubscriptionEnabled,
		throttleMs: updateInterval,
	});
	const {
		data: fastAssetCtxs,
		status: fastPriceSubscriptionStatus,
		isStale: isFastPriceStale,
	} = useSubscription("fastAssetCtxs", undefined, {
		enabled: fastPriceSubscriptionEnabled,
		maxStaleMs: LIVE_MARK_MAX_STALE_MS,
	});

	const [cachedStats] = useState(() => loadStatsCache(env));

	useEffect(() => {
		saveStatsCache(env, allDexsCtxsEvent?.ctxs, spotCtxsEvent);
	}, [env, allDexsCtxsEvent, spotCtxsEvent]);

	const allDexsCtxs = allDexsCtxsEvent?.ctxs ?? cachedStats?.allDexsCtxs;
	const spotCtxs = spotCtxsEvent ?? cachedStats?.spotCtxs;

	const result = useMemo((): MarketsInfoResult => {
		const perpCtxs = getDexCtxs(allDexsCtxs, "");
		const withLivePrice = <T extends PerpMarket | SpotMarket | BuilderPerpMarket, C extends object | undefined>(
			market: T,
			context: C,
		): T & C & LiveMarketPriceFields => {
			const markReceivedAt = getFastAssetCtxFieldReceivedAt(fastAssetCtxs, market.name, "markPx");
			const midReceivedAt = getFastAssetCtxFieldReceivedAt(fastAssetCtxs, market.name, "midPx");
			const price = resolveFastMarketPrice({
				coin: market.name,
				enabled: fastPriceSubscriptionEnabled,
				data: fastAssetCtxs,
				subscriptionStatus: fastPriceSubscriptionStatus,
				isStale: isFastPriceStale,
				markReceivedAt,
				midReceivedAt,
			});
			return {
				...market,
				...context,
				...(price.markPx ? { markPx: price.markPx } : null),
				// A slow statistics snapshot must never leak back in as a live mid.
				// Undefined means this exact fast field is missing or expired.
				midPx: price.midPx,
				markPriceStatus: price.status,
				markPriceReceivedAt: price.receivedAt,
				midPriceReceivedAt: price.midReceivedAt,
			} as T & C & LiveMarketPriceFields;
		};

		const perpMarketsInfo: PerpMarketInfo[] = markets.perp.map((market) =>
			withLivePrice(market, perpCtxs?.[market.ctxIndex]),
		);

		const spotMarketsInfo: SpotMarketInfo[] = markets.spot.map((market) =>
			withLivePrice(market, spotCtxs?.[market.ctxIndex]),
		);

		const builderPerpMarketsInfo: BuilderPerpMarketsInfo = { all: [] };

		for (const market of markets.builderPerp) {
			const dexCtxs = getDexCtxs(allDexsCtxs, market.dex);
			const marketInfo: BuilderPerpMarketInfo = withLivePrice(market, dexCtxs?.[market.ctxIndex]);

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
		allDexsCtxs,
		spotCtxs,
		fastPriceSubscriptionEnabled,
		fastAssetCtxs,
		fastPriceSubscriptionStatus,
		isFastPriceStale,
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
		saveLastMark(cacheMarketName, liveMark, oraclePrice);
	}, [cacheMarketName, liveMark, marketName, oraclePrice]);

	const data = useMemo(() => {
		if (!market) return undefined;
		if (market.markPx) return market;
		const cached = cacheMarketName ? loadLastMark(cacheMarketName) : null;
		if (!cached) return market;
		return { ...market, markPx: cached.markPx, oraclePx: market.oraclePx ?? cached.oraclePx };
	}, [market, cacheMarketName]);

	return {
		data,
		isLoading,
		error,
		isResolved: !!market,
	};
}
