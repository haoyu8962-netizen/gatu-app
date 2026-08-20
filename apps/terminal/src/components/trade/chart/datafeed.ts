import { t } from "@lingui/core/macro";
import type { AllMidsResponse, MetaResponse } from "@nktkas/hyperliquid";
import { CHART_HISTORY_REQUEST_TIMEOUT_MS } from "@/config/time";
import { candleSnapshotToBar, filterAndSortBars } from "@/lib/chart/candle";
import { CandleRateLimitError, requestCandleSnapshot } from "@/lib/chart/candle-gate";
import { type CandleInterval, resolutionToBarMs, resolutionToInterval } from "@/lib/chart/resolution";
import { getCandleStore, streamKey } from "@/lib/chart/store";
import {
	coinFromSymbolName,
	inferPriceScaleFromMids,
	isChartDisplaySymbolName,
	normalizeChartSymbolKey,
	symbolFromCoin,
} from "@/lib/chart/symbol";
import { getInfoClient } from "@/lib/hyperliquid";
import { getHttpStatus } from "@/lib/query-retry";
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
const HYPERLIQUID_MAX_CANDLES = 5_000;
const HISTORY_BACKFILL_MIN_BUCKETS = 100;
const HISTORY_BACKFILL_WINDOW_MULTIPLIER = 2;

type ActiveHistoryRequest = {
	reject: (reason: unknown) => void;
	timeoutId: ReturnType<typeof setTimeout> | null;
};

type HistoryRequestContext = {
	activeRequests: Set<ActiveHistoryRequest>;
	isDestroyed: () => boolean;
};

type FetchBarsResult = {
	bars: Bar[];
	rawCount: number;
};

type PreviousBarsResult = {
	bars: Bar[];
	noData: boolean;
};

function createHistoryTimeoutError(): Error {
	const error = new Error(t`Chart history request timed out`);
	error.name = "TimeoutError";
	return error;
}

function createDatafeedDestroyedError(): Error {
	const error = new Error("Chart datafeed destroyed");
	error.name = "AbortError";
	return error;
}

function cloneBar(bar: Bar): Bar {
	return { ...bar };
}

function cloneBars(bars: Bar[]): Bar[] {
	return bars.map(cloneBar);
}

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
	requestContext: HistoryRequestContext,
	timeoutMs = CHART_HISTORY_REQUEST_TIMEOUT_MS,
): Promise<FetchBarsResult> {
	if (requestContext.isDestroyed()) throw createDatafeedDestroyedError();
	if (timeoutMs <= 0) throw createHistoryTimeoutError();

	const activeRequest: ActiveHistoryRequest = {
		reject: () => undefined,
		timeoutId: null,
	};
	const cancellation = new Promise<never>((_resolve, reject) => {
		activeRequest.reject = reject;
	});
	requestContext.activeRequests.add(activeRequest);
	activeRequest.timeoutId = setTimeout(() => {
		activeRequest.reject(createHistoryTimeoutError());
	}, timeoutMs);

	try {
		const request = requestCandleSnapshot({ coin, interval, startTime: fromMs, endTime: toMs });
		const candles = await Promise.race([request, cancellation]);
		return {
			bars: filterAndSortBars(candles.map(candleSnapshotToBar), fromMs, toMs),
			rawCount: candles.length,
		};
	} finally {
		if (activeRequest.timeoutId !== null) clearTimeout(activeRequest.timeoutId);
		activeRequest.timeoutId = null;
		requestContext.activeRequests.delete(activeRequest);
	}
}

async function fetchPreviousBars(
	coin: string,
	interval: CandleInterval,
	beforeMs: number,
	barMs: number,
	currentBarCount: number,
	countBack: number,
	deadlineMs: number,
	requestContext: HistoryRequestContext,
	exhaustedHistoryByStream: Map<string, number>,
): Promise<PreviousBarsResult> {
	if (beforeMs <= 0) return { bars: [], noData: currentBarCount === 0 };

	const exhaustionKey = streamKey(coin, interval);
	const exhaustedBefore = exhaustedHistoryByStream.get(exhaustionKey) ?? 0;
	if (currentBarCount === 0 && beforeMs <= exhaustedBefore) {
		return { bars: [], noData: true };
	}

	const remainingApiCapacity = Math.max(0, HYPERLIQUID_MAX_CANDLES - currentBarCount);
	const missingBarCount = Math.max(1, countBack - currentBarCount);
	const requestedBucketCount = Math.min(
		remainingApiCapacity,
		Math.max(HISTORY_BACKFILL_MIN_BUCKETS, missingBarCount * HISTORY_BACKFILL_WINDOW_MULTIPLIER),
	);
	if (requestedBucketCount === 0) return { bars: [], noData: false };

	const windowFromMs = Math.max(0, beforeMs - requestedBucketCount * barMs);
	const window = await fetchBars(coin, interval, windowFromMs, beforeMs, requestContext, deadlineMs - Date.now());
	if (window.bars.length > 0 || currentBarCount > 0) return { bars: window.bars, noData: false };

	const probe =
		windowFromMs === 0 ? window : await fetchBars(coin, interval, 0, beforeMs, requestContext, deadlineMs - Date.now());
	if (probe.rawCount > 0) return { bars: probe.bars, noData: false };

	exhaustedHistoryByStream.set(exhaustionKey, Math.max(exhaustedBefore, beforeMs));
	return { bars: [], noData: true };
}

function describeHistoryError(error: unknown): string {
	if (error instanceof CandleRateLimitError || getHttpStatus(error) === 429) {
		return t`Chart data is temporarily rate limited`;
	}
	return error instanceof Error ? error.message : String(error);
}

function mergeBarsToCountBack(previousBars: Bar[], currentBars: Bar[], countBack: number): Bar[] {
	const barsByTime = new Map<number, Bar>();
	for (const bar of previousBars) barsByTime.set(bar.time, bar);
	for (const bar of currentBars) barsByTime.set(bar.time, bar);

	const bars = [...barsByTime.values()].sort((a, b) => a.time - b.time);
	const limit = Math.max(1, Math.floor(countBack) || bars.length || 1);
	return bars.length > limit ? bars.slice(-limit) : bars;
}

function clampCountBack(periodParams: PeriodParams): number {
	return Math.max(1, Math.floor(periodParams.countBack) || 1);
}

const configuration: DatafeedConfiguration = {
	exchanges: [{ value: EXCHANGE, name: EXCHANGE, desc: EXCHANGE }],
	supported_resolutions: SUPPORTED_RESOLUTIONS,
	supports_marks: false,
	supports_time: false,
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
	requestRealtimeReset?: () => void;
	onHistoryError?: () => void;
}

type ActiveRealtimeSubscription = {
	streamKey: string;
	cacheKey: string;
	onResetCache: () => void;
};

export interface ChartDatafeed extends IBasicDataFeed {
	destroy(): void;
	resetRealtimeCache(): void;
}

export function createDatafeed(options: DatafeedOptions = {}): ChartDatafeed {
	const store = getCandleStore();
	const realtimeSubscriptions = new Map<string, ActiveRealtimeSubscription>();
	const resolvedCoinBySymbol = new Map<string, string>();
	const activeHistoryRequests = new Set<ActiveHistoryRequest>();
	const pendingCallbacks = new Set<ReturnType<typeof setTimeout>>();
	const exhaustedHistoryByStream = new Map<string, number>();
	let destroyed = false;
	const historyRequestContext: HistoryRequestContext = {
		activeRequests: activeHistoryRequests,
		isDestroyed: () => destroyed,
	};
	const resolveAsync = (callback: () => void) => {
		if (destroyed) return;
		const timeoutId = setTimeout(() => {
			pendingCallbacks.delete(timeoutId);
			if (!destroyed) callback();
		}, 0);
		pendingCallbacks.add(timeoutId);
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

	const datafeed: ChartDatafeed = {
		destroy: () => {
			if (destroyed) return;
			destroyed = true;

			for (const timeoutId of pendingCallbacks) clearTimeout(timeoutId);
			pendingCallbacks.clear();

			const destroyedError = createDatafeedDestroyedError();
			for (const request of activeHistoryRequests) {
				if (request.timeoutId !== null) clearTimeout(request.timeoutId);
				request.timeoutId = null;
				request.reject(destroyedError);
			}
			activeHistoryRequests.clear();

			for (const [listenerGuid, subscription] of realtimeSubscriptions) {
				store.getState().unsubscribe(subscription.streamKey, listenerGuid);
			}
			realtimeSubscriptions.clear();
			resolvedCoinBySymbol.clear();
		},

		resetRealtimeCache: () => {
			if (destroyed) return;
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
			if (destroyed) return;
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
				if (destroyed) return;

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
					intraday_multipliers: ["1", "3", "5", "15", "30", "60", "120", "240", "480", "720"],
					has_daily: true,
					daily_multipliers: ["1"],
					has_weekly_and_monthly: false,
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
			if (destroyed) return;
			void (async () => {
				const interval = resolutionToInterval(resolution);
				const barMs = resolutionToBarMs(resolution);
				if (!interval || !barMs) {
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
					resolveAsync(() => onResult([], { noData: false }));
					return;
				}

				const exhaustedBefore = exhaustedHistoryByStream.get(streamKey(coin, interval)) ?? 0;
				if (toMs <= exhaustedBefore) {
					resolveAsync(() => onResult([], { noData: true }));
					return;
				}

				const historyDeadline = Date.now() + CHART_HISTORY_REQUEST_TIMEOUT_MS;
				const { bars } = await fetchBars(coin, interval, fromMs, toMs, historyRequestContext);
				if (destroyed) return;
				const key = cacheKey(symbolInfo, resolution);
				const countBack = clampCountBack(periodParams);
				let resultBars = bars;
				let noData = false;
				if (bars.length < countBack) {
					try {
						const previous = await fetchPreviousBars(
							coin,
							interval,
							fromMs,
							barMs,
							bars.length,
							countBack,
							historyDeadline,
							historyRequestContext,
							exhaustedHistoryByStream,
						);
						noData = previous.noData;
						resultBars = mergeBarsToCountBack(previous.bars, bars, countBack);
					} catch (error) {
						if (bars.length === 0) throw error;
					}
				}
				if (destroyed) return;

				const lastBar = resultBars.at(-1);
				if (!lastBar) {
					resolveAsync(() => onResult([], { noData }));
					return;
				}

				store.getState().setLastBar(key, cloneBar(lastBar));

				const callbackBars = cloneBars(resultBars);
				resolveAsync(() => onResult(callbackBars, { noData: false }));
			})().catch((error) => {
				options.onHistoryError?.();
				resolveAsync(() => onError(describeHistoryError(error)));
			});
		},

		subscribeBars: (
			symbolInfo: LibrarySymbolInfo,
			resolution: ResolutionString,
			onTick: SubscribeBarsCallback,
			listenerGuid: string,
			onResetCacheNeededCallback: () => void,
		) => {
			if (destroyed) return;
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
				if (destroyed || realtimeSubscriptions.get(listenerGuid) !== realtimeSubscription) return;
				const lastBar = store.getState().getLastBar(symbolCacheKey);
				if (lastBar && bar.time < lastBar.time) return;

				store.getState().setLastBar(symbolCacheKey, cloneBar(bar));
				onTick(cloneBar(bar));
			};

			store.getState().subscribe(key, coin, interval, listenerGuid, wrappedOnTick, () => {
				if (realtimeSubscriptions.get(listenerGuid) !== realtimeSubscription) return;
				if (options.requestRealtimeReset) {
					options.requestRealtimeReset();
					return;
				}
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
	};

	return datafeed;
}
