import { WS_RELIABILITY_LIMITS } from "@hypeterminal/hl-react";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Bar, SubscribeBarsCallback } from "@/types/charting_library";
import type { CandleInterval } from "./resolution";
import {
	clearCooldownTimer,
	clearReconnectTimer,
	detachFailureListener,
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
	setLastBar: (cacheKey: string, bar: Bar) => void;
	getLastBar: (cacheKey: string) => Bar | undefined;
};

export type CandleStore = StoreApi<CandleStoreState>;

const MAX_LAST_BAR_CACHE = WS_RELIABILITY_LIMITS.cache.maxChartLastBarEntries;

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

	return createStore<CandleStoreState>((set, get) => ({
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
				runtimeEntry = { reconnectAttempts: 0, coin, interval };
				runtime.set(key, runtimeEntry);
			} else {
				runtimeEntry.coin = coin;
				runtimeEntry.interval = interval;
			}

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
						entry.onResetCache();
					}
				},
			};

			if (runtimeEntry.subscription || runtimeEntry.promise) {
				const stream = get().streams[key];
				if (stream?.lastBar) {
					onTick(stream.lastBar);
				}
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
					const { [key]: _, ...rest } = state.streams;
					return { streams: rest };
				});

				const runtimeEntry = runtime.get(key);
				if (runtimeEntry) {
					clearReconnectTimer(runtimeEntry);
					clearCooldownTimer(runtimeEntry);
					detachFailureListener(runtimeEntry);

					const subscription = runtimeEntry.subscription;
					const pending = runtimeEntry.promise;
					runtimeEntry.subscription = undefined;
					runtimeEntry.promise = undefined;

					runtime.delete(key);

					if (subscription) {
						runUnsubscribe(subscription);
					} else if (pending) {
						void pending.then((sub) => runUnsubscribe(sub)).catch(() => {});
					}
				}
			} else {
				set((state) => ({
					streams: { ...state.streams, [key]: { ...stream, listeners } },
				}));
			}
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

		getLastBar: (cacheKey) => {
			const bar = get().lastBarCache[cacheKey];
			if (bar) {
				cacheLru.delete(cacheKey);
				cacheLru.set(cacheKey, true);
			}
			return bar;
		},
	}));
}

let candleStoreInstance: CandleStore | null = null;

export function getCandleStore(): CandleStore {
	if (!candleStoreInstance) {
		candleStoreInstance = createCandleStore();
	}
	return candleStoreInstance;
}

export { streamKey };
