import { useSubscription } from "@hypeterminal/hl-react";
import type { BuilderPerpMarket, PerpMarket, SpotMarket } from "@hypeterminal/hl-react/markets/types";
import { useEffect, useMemo, useState } from "react";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useSelectedMarket } from "@/stores/use-market-store";
import type { AllDexsAssetCtxs, DexAssetCtx, SpotAssetCtx, SpotAssetCtxs } from "@/types/hyperliquid";
import { useMarkets } from "../markets/use-markets";
import { useMarketsInfoContext } from "./MarketsInfoProvider";

export type PerpMarketInfo = PerpMarket & Partial<DexAssetCtx>;
export type SpotMarketInfo = SpotMarket & Partial<SpotAssetCtx> & Partial<DexAssetCtx>;
export type BuilderPerpMarketInfo = BuilderPerpMarket & Partial<DexAssetCtx>;

export type UnifiedMarketInfo = PerpMarketInfo | SpotMarketInfo | BuilderPerpMarketInfo;

export interface BuilderPerpMarketsInfo {
	all: BuilderPerpMarketInfo[];
	[dexName: string]: BuilderPerpMarketInfo[];
}

export interface UseMarketsInfoOptions {
	updateInterval?: number;
	subscriptionKeepAliveMs?: number;
	alwaysSubscribeAll?: boolean;
}

interface MarketsInfoResult {
	perpMarkets: PerpMarketInfo[];
	spotMarkets: SpotMarketInfo[];
	builderPerpMarkets: BuilderPerpMarketsInfo;
	markets: UnifiedMarketInfo[];
}

interface StatsCache {
	allDexsCtxs: AllDexsAssetCtxs | undefined;
	spotCtxs: SpotAssetCtxs | undefined;
	savedAt: number;
}

const STATS_CACHE_KEY = "hl-mkt-stats-v1";
const STATS_CACHE_TTL = 5 * 60 * 1000;

function loadStatsCache(): StatsCache | null {
	if (typeof window === "undefined") return null;
	try {
		const json = sessionStorage.getItem(STATS_CACHE_KEY);
		if (!json) return null;
		const data = JSON.parse(json) as StatsCache;
		if (Date.now() - data.savedAt > STATS_CACHE_TTL) {
			sessionStorage.removeItem(STATS_CACHE_KEY);
			return null;
		}
		return data;
	} catch {
		return null;
	}
}

function saveStatsCache(allDexsCtxs: AllDexsAssetCtxs | undefined, spotCtxs: SpotAssetCtxs | undefined) {
	if (typeof window === "undefined") return;
	if (!allDexsCtxs && !spotCtxs) return;
	try {
		const data: StatsCache = { allDexsCtxs, spotCtxs, savedAt: Date.now() };
		sessionStorage.setItem(STATS_CACHE_KEY, JSON.stringify(data));
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
	const { updateInterval = 5000, subscriptionKeepAliveMs = 10_000, alwaysSubscribeAll = false } = options;
	const { scope } = useExchangeScope();

	const needsPerp = alwaysSubscribeAll || scope === "all" || scope === "perp" || scope === "builders-perp";
	const needsSpot = alwaysSubscribeAll || scope === "all" || scope === "spot";
	const perpSubscriptionEnabled = useSubscriptionWarmWindow(needsPerp, subscriptionKeepAliveMs);
	const spotSubscriptionEnabled = useSubscriptionWarmWindow(needsSpot, subscriptionKeepAliveMs);

	const markets = useMarkets();
	const { data: allDexsCtxsEvent } = useSubscription("allDexsAssetCtxs", undefined, {
		enabled: perpSubscriptionEnabled,
		throttleMs: updateInterval,
	});
	const { data: spotCtxsEvent } = useSubscription("spotAssetCtxs", undefined, {
		enabled: spotSubscriptionEnabled,
		throttleMs: updateInterval,
	});

	const [cachedStats] = useState(() => loadStatsCache());

	useEffect(() => {
		saveStatsCache(allDexsCtxsEvent?.ctxs, spotCtxsEvent);
	}, [allDexsCtxsEvent, spotCtxsEvent]);

	const allDexsCtxs = allDexsCtxsEvent?.ctxs ?? cachedStats?.allDexsCtxs;
	const spotCtxs = spotCtxsEvent ?? cachedStats?.spotCtxs;

	const result = useMemo((): MarketsInfoResult => {
		const perpCtxs = getDexCtxs(allDexsCtxs, "");

		const perpMarketsInfo: PerpMarketInfo[] = markets.perp.map((market) => ({
			...market,
			...perpCtxs?.[market.ctxIndex],
		}));

		const spotMarketsInfo: SpotMarketInfo[] = markets.spot.map((market) => ({
			...market,
			...spotCtxs?.[market.ctxIndex],
		}));

		const builderPerpMarketsInfo: BuilderPerpMarketsInfo = { all: [] };

		for (const market of markets.builderPerp) {
			const dexCtxs = getDexCtxs(allDexsCtxs, market.dex);
			const marketInfo: BuilderPerpMarketInfo = {
				...market,
				...dexCtxs?.[market.ctxIndex],
			};

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
	}, [markets.perp, markets.spot, markets.builderPerp, allDexsCtxs, spotCtxs]);

	const marketLookup = useMemo(() => {
		const byName = new Map<string, UnifiedMarketInfo>();
		const byPairName = new Map<string, UnifiedMarketInfo>();

		for (const market of result.markets) {
			byName.set(market.name, market);
			byPairName.set(market.pairName, market);
		}

		return { byName, byPairName };
	}, [result.markets]);

	const getMarketInfo = useMemo(() => {
		return (name: string): UnifiedMarketInfo | undefined => {
			return marketLookup.byName.get(name) ?? marketLookup.byPairName.get(name);
		};
	}, [marketLookup]);

	return {
		...result,
		isLoading: markets.isLoading,
		error: markets.error,
		getMarketInfo,
	};
}

export type UseMarketsInfoReturn = ReturnType<typeof useMarketsInfoInternal>;

export function useMarketsInfo(): UseMarketsInfoReturn {
	return useMarketsInfoContext();
}

export function useSelectedMarketInfo() {
	const selectedMarketName = useSelectedMarket();
	const { getMarketInfo, isLoading, error } = useMarketsInfo();

	const market = getMarketInfo(selectedMarketName);

	return {
		data: market ?? undefined,
		isLoading,
		error,
		isResolved: !!market,
	};
}
