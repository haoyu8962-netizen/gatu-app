import { t } from "@lingui/core/macro";
import type { AllMidsResponse, MetaResponse } from "@nktkas/hyperliquid";
import { CHART_HISTORY_REQUEST_TIMEOUT_MS } from "@/config/time";
import { candleSnapshotToBar, filterAndSortBars } from "@/lib/chart/candle";
import { type CandleInterval, resolutionToInterval } from "@/lib/chart/resolution";
import { getCandleStore, streamKey } from "@/lib/chart/store";
import {
	coinFromSymbolName,
	inferPriceScaleFromMids,
	isChartDisplaySymbolName,
	normalizeChartSymbolKey,
	symbolFromCoin,
} from "@/lib/chart/symbol";
import { getInfoClient } from "@/lib/hyperliquid";
import type {
	Bar,
	DatafeedConfiguration,
	DatafeedErrorCallback,
	HistoryCallback,
	IBasicDataFeed,
	LibrarySymbolInfo,
	OnReadyCallback,
	PeriodParams,
	ResolutionString,
	ResolveCallback,
	SearchSymbolsCallback,
	ServerTimeCallback,
	SubscribeBarsCallback,
} from "@/types/charting_library";
import {
	ALL_MIDS_TTL_MS,
	CHART_DATAFEED_CONFIG,
	DEFAULT_PRICESCALE,
	EXCHANGE,
	SESSION_24X7,
	SUPPORTED_RESOLUTIONS,
	TIMEZONE,
} from "./constants";

let metaCache: { value: MetaResponse; fetchedAt: number } | undefined;
let metaPromise: Promise<MetaResponse> | undefined;

async function getMeta(): Promise<MetaResponse> {
	if (metaCache) return metaCache.value;
	if (metaPromise) return metaPromise;

	metaPromise = getInfoClient()
		.meta()
		.then((meta) => {
			metaCache = { value: meta, fetchedAt: Date.now() };
			return meta;
		})
		.finally(() => {
			metaPromise = undefined;
		});

	return metaPromise;
}

const allMidsCache = new Map<string, { value: AllMidsResponse; fetchedAt: number }>();
const allMidsPromise = new Map<string, Promise<AllMidsResponse>>();
const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_FALLBACK_MAX_REQUEST_AGE_MS = 7 * DAY_MS;
const HISTORY_FALLBACK_LOOKBACK_MS_BY_INTERVAL: Partial<Record<CandleInterval, number>> = {
	"1m": 14 * DAY_MS,
	"3m": 30 * DAY_MS,
	"5m": 45 * DAY_MS,
	"15m": 90 * DAY_MS,
	"30m": 120 * DAY_MS,
	"1h": 180 * DAY_MS,
	"2h": 365 * DAY_MS,
	"4h": 365 * DAY_MS,
	"8h": 365 * DAY_MS,
	"12h": 365 * DAY_MS,
	"1d": 730 * DAY_MS,
	"1w": 730 * DAY_MS,
	"1M": 730 * DAY_MS,
};

function getDexForCoin(coin: string): string | undefined {
	const separatorIdx = coin.indexOf(":");
	if (separatorIdx <= 0) return undefined;
	return coin.slice(0, separatorIdx);
}

async function getAllMids(dex?: string): Promise<AllMidsResponse> {
	const cacheKey = dex ?? "";
	const now = Date.now();
	const cached = allMidsCache.get(cacheKey);
	if (cached && now - cached.fetchedAt < ALL_MIDS_TTL_MS) return cached.value;

	const pending = allMidsPromise.get(cacheKey);
	if (pending) return pending;

	const request = getInfoClient()
		.allMids(dex ? { dex } : undefined)
		.then((mids) => {
			allMidsCache.set(cacheKey, { value: mids, fetchedAt: Date.now() });
			return mids;
		})
		.finally(() => {
			allMidsPromise.delete(cacheKey);
		});

	allMidsPromise.set(cacheKey, request);
	return request;
}

async function isKnownCoin(coin: string): Promise<boolean> {
	// Structured spot and HIP-3 symbols must be resolved from the application's market metadata.
	// Their shape alone does not prove that Hyperliquid accepts the coin.
	if (coin.startsWith("@") || coin.includes(":")) return false;

	// Perp markets - check against meta
	try {
		const meta = await getMeta();
		return meta.universe.some((asset) => asset.name === coin && !(asset.isDelisted ?? false));
	} catch {
		return false;
	}
}

async function inferPriceScale(coin: string): Promise<number> {
	try {
		const mids = await getAllMids(getDexForCoin(coin));
		return inferPriceScaleFromMids(coin, mids);
	} catch {
		return DEFAULT_PRICESCALE;
	}
}

function cacheKey(symbol: LibrarySymbolInfo, resolution: ResolutionString): string {
	return `${symbol.ticker ?? symbol.name}:${resolution as string}`;
}

async function fetchBars(
	coin: string,
	interval: CandleInterval,
	fromMs: number,
	toMs: number,
	timeoutMs = CHART_HISTORY_REQUEST_TIMEOUT_MS,
) {
	const request = getInfoClient().candleSnapshot({
		coin,
		interval,
		startTime: fromMs,
		endTime: toMs,
	});
	const candles = await new Promise<Awaited<typeof request>>((resolve, reject) => {
		let settled = false;
		const timeoutId = setTimeout(
			() => {
				if (settled) return;
				settled = true;
				reject(new Error(t`Chart history request timed out`));
			},
			Math.max(1, timeoutMs),
		);

		request.then(
			(value) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeoutId);
				resolve(value);
			},
			(error) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeoutId);
				reject(error);
			},
		);
	});
	return filterAndSortBars(candles.map(candleSnapshotToBar), fromMs, toMs);
}

async function fetchPreviousBars(coin: string, interval: CandleInterval, beforeMs: number, timeoutMs: number) {
	if (beforeMs <= 0) return null;
	const lookbackMs = HISTORY_FALLBACK_LOOKBACK_MS_BY_INTERVAL[interval] ?? 180 * DAY_MS;
	const fromMs = Math.max(0, beforeMs - lookbackMs);
	if (fromMs >= beforeMs) return null;

	const bars = await fetchBars(coin, interval, fromMs, beforeMs, timeoutMs);
	return bars.length > 0 ? bars : null;
}

function limitBarsToCountBack(bars: Bar[], countBack: number) {
	const limit = Math.max(1, countBack || bars.length);
	return bars.length > limit ? bars.slice(-limit) : bars;
}

function shouldFetchPreviousBars(periodParams: PeriodParams, toMs: number) {
	return periodParams.firstDataRequest && Date.now() - toMs <= HISTORY_FALLBACK_MAX_REQUEST_AGE_MS;
}

const configuration: DatafeedConfiguration = {
	exchanges: [{ value: EXCHANGE, name: EXCHANGE, desc: EXCHANGE }],
	supported_resolutions: SUPPORTED_RESOLUTIONS,
	supports_marks: false,
	supports_time: true,
	supports_timescale_marks: false,
};

interface DatafeedOptions {
	getPriceScale?: (coin: string) => number | undefined;
	isKnownCoin?: (coin: string) => boolean | undefined;
	getSymbolInfo?: (
		symbolName: string,
		coin: string,
	) =>
		| {
				name: string;
				ticker: string;
				description?: string;
				pricescale?: number;
		  }
		| undefined;
	onRealtimeReset?: () => void;
}

type ActiveRealtimeSubscription = {
	streamKey: string;
	cacheKey: string;
	onResetCache: () => void;
};

export interface ChartDatafeed extends IBasicDataFeed {
	resetRealtimeCache(): void;
}

export function createDatafeed(options: DatafeedOptions = {}): ChartDatafeed {
	const store = getCandleStore();
	const realtimeSubscriptions = new Map<string, ActiveRealtimeSubscription>();
	const resolvedCoinBySymbol = new Map<string, string>();
	const resolveAsync = (callback: () => void) => {
		setTimeout(callback, 0);
	};
	const rememberResolvedCoin = (rawSymbolName: string, symbolInfo: LibrarySymbolInfo) => {
		const apiTicker = symbolInfo.ticker;
		if (!apiTicker) return;

		for (const symbolName of [
			rawSymbolName,
			symbolInfo.name,
			apiTicker,
			`${EXCHANGE}:${symbolInfo.name}`,
			`${EXCHANGE}:${apiTicker}`,
		]) {
			resolvedCoinBySymbol.set(normalizeChartSymbolKey(symbolName), apiTicker);
		}
	};
	const coinFromLibrarySymbol = (symbol: LibrarySymbolInfo): string | undefined => {
		for (const symbolName of [symbol.ticker, symbol.name]) {
			if (!symbolName) continue;
			const coin = resolvedCoinBySymbol.get(normalizeChartSymbolKey(symbolName));
			if (coin) return coin;
		}
		return undefined;
	};

	const resetSubscription = (subscription: ActiveRealtimeSubscription) => {
		store.getState().invalidateStream(subscription.streamKey);
		store.getState().clearLastBar(subscription.cacheKey);
		subscription.onResetCache();
	};

	return {
		resetRealtimeCache: () => {
			if (realtimeSubscriptions.size === 0) return;
			for (const subscription of [...realtimeSubscriptions.values()]) {
				resetSubscription(subscription);
			}
			options.onRealtimeReset?.();
		},

		onReady: (callback: OnReadyCallback) => {
			resolveAsync(() => callback(configuration));
		},

		searchSymbols: (_userInput: string, _exchange: string, _symbolType: string, onResult: SearchSymbolsCallback) => {
			resolveAsync(() => onResult([]));
		},

		resolveSymbol: (symbolName: string, onResolve: ResolveCallback, onError: DatafeedErrorCallback, extension) => {
			void extension;

			void (async () => {
				const rawSymbolName = symbolName.trim();
				const coin = coinFromSymbolName(symbolName);
				const resolvedSymbol = options.getSymbolInfo?.(rawSymbolName, coin);
				if (!resolvedSymbol && isChartDisplaySymbolName(rawSymbolName)) {
					resolveAsync(() => onError(t`Unknown symbol: ${symbolName}`));
					return;
				}
				const displayName = resolvedSymbol?.name ?? symbolFromCoin(coin);
				const apiTicker = resolvedSymbol?.ticker ?? coin;

				const knownByCaller = resolvedSymbol ? true : options.isKnownCoin?.(apiTicker);
				const knownCoin = knownByCaller ?? (await isKnownCoin(apiTicker));
				if (!knownCoin) {
					resolveAsync(() => onError(t`Unknown symbol: ${symbolName}`));
					return;
				}

				const pricescale =
					resolvedSymbol?.pricescale ?? options.getPriceScale?.(apiTicker) ?? (await inferPriceScale(apiTicker));

				const symbolInfo: LibrarySymbolInfo = {
					name: displayName,
					ticker: apiTicker,
					description: resolvedSymbol?.description ?? displayName,
					type: CHART_DATAFEED_CONFIG.SYMBOL_TYPE,
					session: SESSION_24X7,
					timezone: TIMEZONE,
					exchange: EXCHANGE,
					listed_exchange: EXCHANGE,
					format: CHART_DATAFEED_CONFIG.FORMAT,
					pricescale,
					minmov: CHART_DATAFEED_CONFIG.MIN_MOVEMENT,
					has_intraday: true,
					supported_resolutions: SUPPORTED_RESOLUTIONS,
					volume_precision: CHART_DATAFEED_CONFIG.VOLUME_PRECISION,
					data_status: CHART_DATAFEED_CONFIG.DATA_STATUS,
				};

				rememberResolvedCoin(rawSymbolName, symbolInfo);
				resolveAsync(() => onResolve(symbolInfo));
			})().catch((error) => {
				resolveAsync(() => onError(error instanceof Error ? error.message : String(error)));
			});
		},

		getBars: (
			symbolInfo: LibrarySymbolInfo,
			resolution: ResolutionString,
			periodParams: PeriodParams,
			onResult: HistoryCallback,
			onError: DatafeedErrorCallback,
		) => {
			void (async () => {
				const interval = resolutionToInterval(resolution);
				if (!interval) {
					resolveAsync(() => onError(t`Unsupported resolution: ${String(resolution)}`));
					return;
				}

				const coin = coinFromLibrarySymbol(symbolInfo);
				if (!coin) {
					resolveAsync(() => onError(t`Unknown symbol: ${symbolInfo.ticker ?? symbolInfo.name}`));
					return;
				}
				const fromMs = Math.max(0, Math.floor(periodParams.from * 1000));
				const toMs = Math.max(0, Math.floor(periodParams.to * 1000));

				if (toMs <= fromMs) {
					resolveAsync(() => onResult([], { noData: true }));
					return;
				}

				const historyDeadline = Date.now() + CHART_HISTORY_REQUEST_TIMEOUT_MS;
				const bars = await fetchBars(coin, interval, fromMs, toMs);
				const key = cacheKey(symbolInfo, resolution);

				if (bars.length === 0) {
					const fallbackBars = shouldFetchPreviousBars(periodParams, toMs)
						? await fetchPreviousBars(coin, interval, fromMs, Math.max(1, historyDeadline - Date.now()))
						: null;
					const limitedFallbackBars = fallbackBars ? limitBarsToCountBack(fallbackBars, periodParams.countBack) : null;
					const fallbackLastBar = limitedFallbackBars?.at(-1);
					if (limitedFallbackBars && fallbackLastBar) {
						resolveAsync(() => onResult(limitedFallbackBars, { noData: false }));
						return;
					}
					resolveAsync(() => onResult([], { noData: true }));
					return;
				}

				const lastBar = bars[bars.length - 1];
				store.getState().setLastBar(key, lastBar);

				resolveAsync(() => onResult(bars, { noData: false }));
			})().catch((error) => {
				resolveAsync(() => onError(error instanceof Error ? error.message : String(error)));
			});
		},

		subscribeBars: (
			symbolInfo: LibrarySymbolInfo,
			resolution: ResolutionString,
			onTick: SubscribeBarsCallback,
			listenerGuid: string,
			onResetCacheNeededCallback: () => void,
		) => {
			const interval = resolutionToInterval(resolution);
			if (!interval) return;

			const existingSubscription = realtimeSubscriptions.get(listenerGuid);
			if (existingSubscription) {
				store.getState().unsubscribe(existingSubscription.streamKey, listenerGuid);
			}

			const coin = coinFromLibrarySymbol(symbolInfo);
			if (!coin) return;
			const symbolCacheKey = cacheKey(symbolInfo, resolution);
			const key = streamKey(coin, interval);

			const realtimeSubscription: ActiveRealtimeSubscription = {
				streamKey: key,
				cacheKey: symbolCacheKey,
				onResetCache: onResetCacheNeededCallback,
			};
			realtimeSubscriptions.set(listenerGuid, realtimeSubscription);

			const wrappedOnTick = (bar: Bar) => {
				const lastBar = store.getState().getLastBar(symbolCacheKey);
				if (lastBar && bar.time < lastBar.time) return;

				store.getState().setLastBar(symbolCacheKey, bar);
				onTick(bar);
			};

			store.getState().subscribe(key, coin, interval, listenerGuid, wrappedOnTick, () => {
				if (realtimeSubscriptions.get(listenerGuid) !== realtimeSubscription) return;
				resetSubscription(realtimeSubscription);
				options.onRealtimeReset?.();
			});
		},

		unsubscribeBars: (listenerGuid: string) => {
			const subscription = realtimeSubscriptions.get(listenerGuid);
			if (subscription) {
				store.getState().unsubscribe(subscription.streamKey, listenerGuid);
				realtimeSubscriptions.delete(listenerGuid);
			}
		},

		getServerTime: (callback: ServerTimeCallback) => {
			resolveAsync(() => callback(Math.floor(Date.now() / 1000)));
		},
	};
}
