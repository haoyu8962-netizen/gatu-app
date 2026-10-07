import { t } from "@lingui/core/macro";
import type { AllMidsResponse, MetaResponse } from "@nktkas/hyperliquid";
import { CHART_HISTORY_REQUEST_TIMEOUT_MS } from "@/config/time";
import { candleSnapshotToBar, filterAndSortBars } from "@/lib/chart/candle";
import { CandleRateLimitError, requestCandleSnapshot } from "@/lib/chart/candle-gate";
import { type ChartPriceFormat, getChartPriceFormat } from "@/lib/chart/price-format";
import { type CandleInterval, resolutionToBarMs, resolutionToInterval } from "@/lib/chart/resolution";
import { getCandleStore, streamKey } from "@/lib/chart/store";
import {
	coinFromSymbolName,
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
const CHART_HISTORY_INLINE_RATE_LIMIT_TIMEOUT_MS = 25_000;
let datafeedInstanceCount = 0;

export interface HistoryRequestIdentity {
	requestId: number;
	streamGeneration: number;
	streamKey: string;
	targetGeneration: number;
}

type ActiveHistoryRequest = {
	identity: HistoryRequestIdentity;
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

type HistoryCallbackState = {
	settled: boolean;
};

function createHistoryTimeoutError(): Error {
	const error = new Error("Chart history request timed out");
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

async function findListedPerp(coin: string): Promise<MetaResponse["universe"][number] | undefined> {
	// Structured spot and HIP-3 symbols must be resolved from the application's market metadata.
	// Their shape alone does not prove that Hyperliquid accepts the coin.
	if (coin.startsWith("@") || coin.includes(":")) return undefined;

	try {
		const meta = await getMeta();
		return meta.universe.find((asset) => asset.name === coin && !(asset.isDelisted ?? false));
	} catch {
		return undefined;
	}
}

async function isKnownCoin(coin: string): Promise<boolean> {
	return (await findListedPerp(coin)) !== undefined;
}

async function inferPerpPriceFormat(coin: string): Promise<ChartPriceFormat> {
	const [asset, mids] = await Promise.all([
		findListedPerp(coin),
		getAllMids(getDexForCoin(coin)).catch(() => undefined),
	]);
	return getChartPriceFormat(asset?.szDecimals, "perp", mids?.[coin]);
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
	identity: HistoryRequestIdentity,
	timeoutMs = CHART_HISTORY_REQUEST_TIMEOUT_MS,
): Promise<FetchBarsResult> {
	if (requestContext.isDestroyed()) throw createDatafeedDestroyedError();
	if (timeoutMs <= 0) throw createHistoryTimeoutError();

	const activeRequest: ActiveHistoryRequest = {
		identity,
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

async function waitForHistoryRetry(
	waitMs: number,
	requestContext: HistoryRequestContext,
	identity: HistoryRequestIdentity,
): Promise<void> {
	if (requestContext.isDestroyed()) throw createDatafeedDestroyedError();
	if (waitMs <= 0) return;

	await new Promise<void>((resolve, reject) => {
		const activeRequest: ActiveHistoryRequest = {
			identity,
			reject,
			timeoutId: null,
		};
		requestContext.activeRequests.add(activeRequest);
		activeRequest.timeoutId = setTimeout(() => {
			activeRequest.timeoutId = null;
			requestContext.activeRequests.delete(activeRequest);
			resolve();
		}, waitMs);
	});
}

// TradingView shows this reason in the chart legend, so it is never a transport message.
function describeHistoryError(error: unknown): string {
	if (error instanceof CandleRateLimitError || getHttpStatus(error) === 429) {
		return t`Chart data is temporarily rate limited`;
	}
	if (error instanceof Error && error.name === "TimeoutError") return t`Chart history request timed out`;
	return t`Chart data could not be loaded`;
}

function clampCountBack(periodParams: PeriodParams): number {
	return Math.min(HYPERLIQUID_MAX_CANDLES, Math.max(1, Math.floor(periodParams.countBack) || 1));
}

function getHistoryRequestFromMs(fromMs: number, toMs: number, barMs: number, countBack: number): number {
	const earliestCountBackBarMs = Math.max(0, toMs - countBack * barMs);
	const earliestApiBarMs = Math.max(0, toMs - HYPERLIQUID_MAX_CANDLES * barMs);
	return Math.max(earliestApiBarMs, Math.min(fromMs, earliestCountBackBarMs));
}

function selectHistoryBars(bars: Bar[], fromMs: number, countBack: number): Bar[] {
	const requestedRangeBars = bars.filter((bar) => bar.time >= fromMs);
	if (requestedRangeBars.length >= countBack) return requestedRangeBars;
	return bars.length > countBack ? bars.slice(-countBack) : bars;
}

const configuration: DatafeedConfiguration = {
	exchanges: [{ value: EXCHANGE, name: EXCHANGE, desc: EXCHANGE }],
	supported_resolutions: SUPPORTED_RESOLUTIONS,
	supports_marks: false,
	supports_time: false,
	supports_timescale_marks: false,
};

interface DatafeedOptions {
	getHistoryTargetGeneration?: () => number;
	getHistoryTarget?: () => { coin: string; resolution: ResolutionString };
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
				variable_tick_size?: string;
		  }
		| undefined;
	onRealtimeReset?: () => void;
	requestRealtimeReset?: () => void;
	onHistoryError?: (error: unknown, historyStreamKey?: string, identity?: HistoryRequestIdentity) => void;
	onHistoryRateLimit?: (
		error: CandleRateLimitError,
		historyStreamKey: string,
		identity: HistoryRequestIdentity,
	) => void;
	onHistorySuccess?: (historyStreamKey?: string, identity?: HistoryRequestIdentity) => void;
}

type ActiveRealtimeSubscription = {
	streamKey: string;
	storeListenerId: string;
	cacheKey: string;
	coin: string;
	resolution: ResolutionString;
	onResetCache: () => void;
};

export interface ChartDatafeed extends IBasicDataFeed {
	destroy(): void;
	invalidateHistoryRequests(): void;
	resetRealtimeCache(historyStreamKey?: string): boolean;
}

export function createDatafeed(options: DatafeedOptions = {}): ChartDatafeed {
	const store = getCandleStore();
	datafeedInstanceCount += 1;
	const listenerNamespace = `datafeed-${datafeedInstanceCount}`;
	const realtimeSubscriptions = new Map<string, ActiveRealtimeSubscription>();
	const resolvedCoinBySymbol = new Map<string, string>();
	const activeHistoryRequests = new Set<ActiveHistoryRequest>();
	const pendingCallbacks = new Set<ReturnType<typeof setTimeout>>();
	const exhaustedHistoryByStream = new Map<string, number>();
	let destroyed = false;
	let currentHistoryStreamKey: string | null = null;
	let currentHistoryTargetGeneration: number | null = null;
	let historyStreamGeneration = 0;
	let nextHistoryRequestId = 0;
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
	const getHistoryTargetGeneration = () => options.getHistoryTargetGeneration?.() ?? 0;
	const matchesHistoryTarget = (coin: string, resolution: ResolutionString) => {
		const target = options.getHistoryTarget?.();
		if (!target) return true;
		return (
			normalizeChartSymbolKey(coin) === normalizeChartSymbolKey(target.coin) &&
			String(resolution) === String(target.resolution)
		);
	};
	const isCurrentHistoryRequest = (identity: HistoryRequestIdentity) =>
		identity.targetGeneration === getHistoryTargetGeneration() &&
		identity.targetGeneration === currentHistoryTargetGeneration &&
		identity.streamGeneration === historyStreamGeneration &&
		identity.streamKey === currentHistoryStreamKey;
	const cancelStaleHistoryRequests = () => {
		const cancellationError = createDatafeedDestroyedError();
		for (const request of [...activeHistoryRequests]) {
			if (isCurrentHistoryRequest(request.identity)) continue;
			if (request.timeoutId !== null) clearTimeout(request.timeoutId);
			request.timeoutId = null;
			activeHistoryRequests.delete(request);
			request.reject(cancellationError);
		}
	};
	const beginHistoryRequest = (historyStreamKey: string): HistoryRequestIdentity => {
		const targetGeneration = getHistoryTargetGeneration();
		if (currentHistoryTargetGeneration !== targetGeneration || currentHistoryStreamKey !== historyStreamKey) {
			currentHistoryTargetGeneration = targetGeneration;
			currentHistoryStreamKey = historyStreamKey;
			historyStreamGeneration += 1;
		}
		nextHistoryRequestId += 1;
		const identity = {
			requestId: nextHistoryRequestId,
			streamGeneration: historyStreamGeneration,
			streamKey: historyStreamKey,
			targetGeneration,
		};
		cancelStaleHistoryRequests();
		return identity;
	};
	const resolveHistoryCancellation = (onResult: HistoryCallback, callbackState: HistoryCallbackState) => {
		resolveAsync(() => {
			if (callbackState.settled) return;
			callbackState.settled = true;
			onResult([], { noData: false });
		});
	};
	const resolveHistoryResult = (
		callback: () => void,
		onResult: HistoryCallback,
		identity: HistoryRequestIdentity,
		callbackState: HistoryCallbackState,
	) => {
		resolveAsync(() => {
			if (callbackState.settled) return;
			callbackState.settled = true;
			if (!isCurrentHistoryRequest(identity)) {
				onResult([], { noData: false });
				return;
			}
			try {
				options.onHistorySuccess?.(identity.streamKey, identity);
			} catch {}
			callback();
		});
	};
	const resolveHistoryError = (
		error: unknown,
		onResult: HistoryCallback,
		onError: DatafeedErrorCallback,
		identity: HistoryRequestIdentity,
		callbackState: HistoryCallbackState,
	) => {
		resolveAsync(() => {
			if (callbackState.settled) return;
			callbackState.settled = true;
			if (!isCurrentHistoryRequest(identity)) {
				onResult([], { noData: false });
				return;
			}
			try {
				options.onHistoryError?.(error, identity.streamKey, identity);
			} catch {}
			onError(describeHistoryError(error));
		});
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

			for (const subscription of realtimeSubscriptions.values()) {
				store.getState().unsubscribe(subscription.streamKey, subscription.storeListenerId);
			}
			realtimeSubscriptions.clear();
			resolvedCoinBySymbol.clear();
			exhaustedHistoryByStream.clear();
		},

		invalidateHistoryRequests: () => {
			if (destroyed) return;
			cancelStaleHistoryRequests();
		},

		resetRealtimeCache: (historyStreamKey) => {
			if (destroyed) return false;
			let didReset = false;
			for (const subscription of [...realtimeSubscriptions.values()]) {
				if (!matchesHistoryTarget(subscription.coin, subscription.resolution)) continue;
				if (historyStreamKey && subscription.streamKey !== historyStreamKey) continue;
				try {
					resetSubscription(subscription);
					didReset = true;
				} catch {}
			}
			if (!didReset) return false;
			options.onRealtimeReset?.();
			return true;
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

				const priceFormat: ChartPriceFormat =
					resolvedSymbol?.pricescale === undefined
						? await inferPerpPriceFormat(apiTicker)
						: { pricescale: resolvedSymbol.pricescale, variable_tick_size: resolvedSymbol.variable_tick_size };
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
					pricescale: priceFormat.pricescale,
					...(priceFormat.variable_tick_size ? { variable_tick_size: priceFormat.variable_tick_size } : {}),
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
			})().catch(() => {
				resolveAsync(() => onError(t`Chart data could not be loaded`));
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
			let identity: HistoryRequestIdentity | undefined;
			const callbackState = { settled: false };
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
				if (!matchesHistoryTarget(coin, resolution)) {
					resolveHistoryCancellation(onResult, callbackState);
					return;
				}
				const historyStreamKey = streamKey(coin, interval);
				const requestIdentity = beginHistoryRequest(historyStreamKey);
				identity = requestIdentity;
				const fromMs = Math.max(0, Math.floor(periodParams.from * 1000));
				const toMs = Math.max(0, Math.floor(periodParams.to * 1000));

				if (toMs <= fromMs) {
					resolveHistoryResult(() => onResult([], { noData: false }), onResult, requestIdentity, callbackState);
					return;
				}
				if (toMs <= (exhaustedHistoryByStream.get(historyStreamKey) ?? 0)) {
					resolveHistoryResult(() => onResult([], { noData: true }), onResult, requestIdentity, callbackState);
					return;
				}

				const countBack = clampCountBack(periodParams);
				const requestFromMs = getHistoryRequestFromMs(fromMs, toMs, barMs, countBack);
				let rateLimitDeadline: number | null = null;
				const fetchHistorySnapshot = async (startTime: number, endTime: number) => {
					for (;;) {
						if (!isCurrentHistoryRequest(requestIdentity)) {
							throw createDatafeedDestroyedError();
						}
						const timeoutMs =
							rateLimitDeadline === null
								? CHART_HISTORY_REQUEST_TIMEOUT_MS
								: Math.min(CHART_HISTORY_REQUEST_TIMEOUT_MS, rateLimitDeadline - Date.now());
						try {
							return await fetchBars(
								coin,
								interval,
								startTime,
								endTime,
								historyRequestContext,
								requestIdentity,
								timeoutMs,
							);
						} catch (error) {
							if (!(error instanceof CandleRateLimitError)) throw error;
							if (!isCurrentHistoryRequest(requestIdentity)) throw createDatafeedDestroyedError();
							rateLimitDeadline ??= Date.now() + CHART_HISTORY_INLINE_RATE_LIMIT_TIMEOUT_MS;
							try {
								options.onHistoryRateLimit?.(error, requestIdentity.streamKey, requestIdentity);
							} catch {}
							if (error.retryAt >= rateLimitDeadline) throw error;
							await waitForHistoryRetry(
								Math.min(error.retryAt, rateLimitDeadline) - Date.now(),
								historyRequestContext,
								requestIdentity,
							);
						}
					}
				};
				let snapshot = await fetchHistorySnapshot(requestFromMs, toMs);
				if (destroyed) return;
				if (!isCurrentHistoryRequest(requestIdentity)) {
					resolveHistoryCancellation(onResult, callbackState);
					return;
				}
				let noData = requestFromMs === 0 && snapshot.rawCount === 0;
				if (snapshot.rawCount === 0 && requestFromMs > 0) {
					const probe = await fetchHistorySnapshot(0, requestFromMs);
					if (destroyed) return;
					if (!isCurrentHistoryRequest(requestIdentity)) {
						resolveHistoryCancellation(onResult, callbackState);
						return;
					}
					if (probe.rawCount === 0) {
						noData = true;
						exhaustedHistoryByStream.set(
							historyStreamKey,
							Math.max(exhaustedHistoryByStream.get(historyStreamKey) ?? 0, toMs),
						);
					} else {
						snapshot = probe;
					}
				} else if (noData) {
					exhaustedHistoryByStream.set(
						historyStreamKey,
						Math.max(exhaustedHistoryByStream.get(historyStreamKey) ?? 0, toMs),
					);
				}
				const key = cacheKey(symbolInfo, resolution);
				const resultBars = selectHistoryBars(snapshot.bars, fromMs, countBack);

				const lastBar = resultBars.at(-1);
				if (!lastBar) {
					resolveHistoryResult(() => onResult([], { noData }), onResult, requestIdentity, callbackState);
					return;
				}

				const cachedLastBar = store.getState().getLastBar(key);
				if (!cachedLastBar || lastBar.time >= cachedLastBar.time) {
					store.getState().setLastBar(key, cloneBar(lastBar));
				}

				const callbackBars = cloneBars(resultBars);
				resolveHistoryResult(() => onResult(callbackBars, { noData: false }), onResult, requestIdentity, callbackState);
			})().catch((error) => {
				if (!identity || destroyed) return;
				if (!isCurrentHistoryRequest(identity)) {
					resolveHistoryCancellation(onResult, callbackState);
					return;
				}
				resolveHistoryError(error, onResult, onError, identity, callbackState);
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

			const coin = coinFromLibrarySymbol(symbolInfo);
			if (!coin) return;
			if (!matchesHistoryTarget(coin, resolution)) return;

			const existingSubscription = realtimeSubscriptions.get(listenerGuid);
			if (existingSubscription) {
				store.getState().unsubscribe(existingSubscription.streamKey, existingSubscription.storeListenerId);
			}
			const symbolCacheKey = cacheKey(symbolInfo, resolution);
			const key = streamKey(coin, interval);

			const realtimeSubscription: ActiveRealtimeSubscription = {
				streamKey: key,
				storeListenerId: `${listenerNamespace}:${listenerGuid}`,
				cacheKey: symbolCacheKey,
				coin,
				resolution,
				onResetCache: onResetCacheNeededCallback,
			};
			realtimeSubscriptions.set(listenerGuid, realtimeSubscription);

			const wrappedOnTick = (bar: Bar) => {
				if (
					destroyed ||
					realtimeSubscriptions.get(listenerGuid) !== realtimeSubscription ||
					!matchesHistoryTarget(coin, resolution)
				) {
					return;
				}
				const lastBar = store.getState().getLastBar(symbolCacheKey);
				if (lastBar && bar.time < lastBar.time) return;

				store.getState().setLastBar(symbolCacheKey, cloneBar(bar));
				onTick(cloneBar(bar));
			};

			store.getState().subscribe(key, coin, interval, realtimeSubscription.storeListenerId, wrappedOnTick, () => {
				if (
					realtimeSubscriptions.get(listenerGuid) !== realtimeSubscription ||
					!matchesHistoryTarget(coin, resolution)
				) {
					return;
				}
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
				store.getState().unsubscribe(subscription.streamKey, subscription.storeListenerId);
				realtimeSubscriptions.delete(listenerGuid);
			}
		},
	};

	return datafeed;
}
