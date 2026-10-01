import { WS_RELIABILITY_LIMITS } from "@sairn/hl-react";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Bar, SubscribeBarsCallback } from "@/types/charting_library";
import type { CandleInterval } from "./resolution";
import {
	clearCooldownTimer,
	clearReconnectTimer,
	runUnsubscribe,
	type StreamRuntime,
	type StreamStatus,
	type SubscribeContext,
	startSubscription,
} from "./subscribe-with-reconnect";

type CandleListener = {
	id: string;
	onTick: SubscribeBarsCallback;
	onResetCache: () => void;
};

type CandleStream = {
	status: StreamStatus;
	listeners: Map<string, CandleListener>;
	lastBar?: Bar;
	error?: unknown;
};

export type CandleStoreState = {
	streams: Record<string, CandleStream>;
	lastBarCache: Record<string, Bar>;
	subscribe: (
		streamKey: string,
		coin: string,
		interval: CandleInterval,
		listenerId: string,
		onTick: SubscribeBarsCallback,
		onResetCache: () => void,
	) => void;
	unsubscribe: (streamKey: string, listenerId: string) => void;
	invalidateStream: (streamKey: string) => void;
	setLastBar: (cacheKey: string, bar: Bar) => void;
	clearLastBar: (cacheKey: string) => void;
	getLastBar: (cacheKey: string) => Bar | undefined;
};

export type CandleStore = StoreApi<CandleStoreState>;

const MAX_LAST_BAR_CACHE = WS_RELIABILITY_LIMITS.cache.maxChartLastBarEntries;
const STREAM_RELEASE_DELAY_MS = 5_000;

function streamKey(coin: string, interval: CandleInterval): string {
	return `${coin}:${interval}`;
}

function isSameBar(a: Bar | undefined, b: Bar | undefined): boolean {
	if (!a || !b) return false;
	return (
		a.time === b.time &&
		a.open === b.open &&
		a.high === b.high &&
		a.low === b.low &&
		a.close === b.close &&
		a.volume === b.volume
	);
}

export function createCandleStore(): CandleStore {
	const runtime = new Map<string, StreamRuntime>();
	const cacheLru = new Map<string, true>();

	const clearReleaseTimer = (entry: StreamRuntime) => {
		if (entry.releaseTimer) {
			clearTimeout(entry.releaseTimer);
			entry.releaseTimer = undefined;
		}
	};

	const touchCacheKey = (cacheKey: string, cache: Record<string, Bar>) => {
		cacheLru.delete(cacheKey);
		cacheLru.set(cacheKey, true);

		while (cacheLru.size > MAX_LAST_BAR_CACHE) {
			const oldest = cacheLru.keys().next().value as string | undefined;
			if (!oldest) break;
			cacheLru.delete(oldest);
			delete cache[oldest];
		}
	};

	return createStore<CandleStoreState>((set, get) => {
		const releaseStream = (key: string) => {
			const stream = get().streams[key];
			if (stream && stream.listeners.size > 0) return;

			set((state) => {
				const current = state.streams[key];
				if (current && current.listeners.size > 0) return state;
				const { [key]: _, ...rest } = state.streams;
				return { streams: rest };
			});

			const runtimeEntry = runtime.get(key);
			if (!runtimeEntry) return;

			clearReleaseTimer(runtimeEntry);
			clearReconnectTimer(runtimeEntry);
			clearCooldownTimer(runtimeEntry);

			const subscription = runtimeEntry.subscription;
			runtimeEntry.subscription = undefined;
			runtimeEntry.promise = undefined;

			runtime.delete(key);

			if (subscription) {
				runUnsubscribe(subscription);
			}
		};

		return {
			streams: {},
			lastBarCache: {},

			subscribe: (key, coin, interval, listenerId, onTick, onResetCache) => {
				const listener: CandleListener = { id: listenerId, onTick, onResetCache };

				set((state) => {
					const existing = state.streams[key];
					if (existing) {
						const prevListener = existing.listeners.get(listenerId);
						if (
							prevListener &&
							prevListener.onTick === listener.onTick &&
							prevListener.onResetCache === listener.onResetCache
						) {
							return state;
						}
						const listeners = new Map(existing.listeners);
						listeners.set(listenerId, listener);
						return {
							streams: { ...state.streams, [key]: { ...existing, listeners } },
						};
					}

					const newStream: CandleStream = {
						status: "connecting",
						listeners: new Map([[listenerId, listener]]),
					};
					return { streams: { ...state.streams, [key]: newStream } };
				});

				let runtimeEntry = runtime.get(key);
				if (!runtimeEntry) {
					runtimeEntry = {
						reconnectAttempts: 0,
						recoveryGeneration: 0,
						recoveredGeneration: 0,
						awaitingFirstCandle: false,
						coin,
						interval,
					};
					runtime.set(key, runtimeEntry);
				} else {
					runtimeEntry.coin = coin;
					runtimeEntry.interval = interval;
				}

				clearReleaseTimer(runtimeEntry);
				clearReconnectTimer(runtimeEntry);
				clearCooldownTimer(runtimeEntry);

				const ctx: SubscribeContext = {
					key,
					runtime,
					getLastBar: () => get().streams[key]?.lastBar,
					hasListeners: () => {
						const stream = get().streams[key];
						return !!stream && stream.listeners.size > 0;
					},
					onCandle: (bar) => {
						const current = get().streams[key];
						if (!current) return;

						if (!isSameBar(current.lastBar, bar) || current.status !== "active" || current.error !== undefined) {
							set((state) => {
								const stream = state.streams[key];
								if (!stream) return state;
								return {
									streams: {
										...state.streams,
										[key]: {
											...stream,
											lastBar: bar,
											status: "active",
											error: undefined,
										},
									},
								};
							});
						}

						for (const l of current.listeners.values()) {
							l.onTick(bar);
						}
					},
					onConnecting: () => {
						set((state) => {
							const stream = state.streams[key];
							if (!stream || stream.status === "connecting") return state;
							return {
								streams: {
									...state.streams,
									[key]: { ...stream, status: "connecting", error: undefined },
								},
							};
						});
					},
					onActive: () => {
						set((state) => {
							const stream = state.streams[key];
							if (!stream) return state;
							if (stream.status === "active" && stream.error === undefined) return state;
							return {
								streams: { ...state.streams, [key]: { ...stream, status: "active", error: undefined } },
							};
						});
					},
					onError: (error) => {
						set((state) => {
							const stream = state.streams[key];
							if (!stream) return state;
							return {
								streams: { ...state.streams, [key]: { ...stream, status: "error", error } },
							};
						});
					},
					onCooldown: () => {
						set((state) => {
							const stream = state.streams[key];
							if (!stream) return state;
							return {
								streams: {
									...state.streams,
									[key]: { ...stream, status: "error", error: new Error("Reconnect cooldown active") },
								},
							};
						});
					},
					onResetListeners: () => {
						const current = get().streams[key];
						if (!current) return;
						for (const entry of current.listeners.values()) {
							try {
								entry.onResetCache();
							} catch {}
						}
					},
				};

				if (runtimeEntry.subscription || runtimeEntry.promise) {
					setTimeout(() => {
						const stream = get().streams[key];
						const current = stream?.listeners.get(listenerId);
						if (!stream || !current || current.onTick !== onTick || current.onResetCache !== onResetCache) return;
						if (stream.status === "error" || !stream.lastBar) return;
						current.onTick(stream.lastBar);
					}, 0);
					return;
				}

				startSubscription(ctx);
			},

			unsubscribe: (key, listenerId) => {
				const stream = get().streams[key];
				if (!stream || !stream.listeners.has(listenerId)) return;

				const listeners = new Map(stream.listeners);
				listeners.delete(listenerId);

				if (listeners.size === 0) {
					set((state) => {
						const current = state.streams[key];
						if (!current) return state;
						return { streams: { ...state.streams, [key]: { ...current, listeners } } };
					});

					const runtimeEntry = runtime.get(key);
					if (runtimeEntry) {
						clearReconnectTimer(runtimeEntry);
						clearCooldownTimer(runtimeEntry);
						clearReleaseTimer(runtimeEntry);
						runtimeEntry.releaseTimer = setTimeout(() => releaseStream(key), STREAM_RELEASE_DELAY_MS);
					}
				} else {
					set((state) => ({
						streams: { ...state.streams, [key]: { ...stream, listeners } },
					}));
				}
			},

			invalidateStream: (key) => {
				set((state) => {
					const stream = state.streams[key];
					if (!stream || stream.lastBar === undefined) return state;
					return {
						streams: { ...state.streams, [key]: { ...stream, lastBar: undefined } },
					};
				});
			},

			setLastBar: (cacheKey, bar) => {
				set((state) => {
					const existing = state.lastBarCache[cacheKey];
					if (isSameBar(existing, bar)) {
						cacheLru.delete(cacheKey);
						cacheLru.set(cacheKey, true);
						return state;
					}

					const nextCache = { ...state.lastBarCache, [cacheKey]: bar };
					touchCacheKey(cacheKey, nextCache);
					return { lastBarCache: nextCache };
				});
			},

			clearLastBar: (cacheKey) => {
				set((state) => {
					if (!(cacheKey in state.lastBarCache)) return state;
					const { [cacheKey]: _, ...nextCache } = state.lastBarCache;
					cacheLru.delete(cacheKey);
					return { lastBarCache: nextCache };
				});
			},

			getLastBar: (cacheKey) => {
				const bar = get().lastBarCache[cacheKey];
				if (bar) {
					cacheLru.delete(cacheKey);
					cacheLru.set(cacheKey, true);
				}
				return bar;
			},
		};
	});
}

let candleStoreInstance: CandleStore | null = null;

export function getCandleStore(): CandleStore {
	if (!candleStoreInstance) {
		candleStoreInstance = createCandleStore();
	}
	return candleStoreInstance;
}

export { streamKey };
