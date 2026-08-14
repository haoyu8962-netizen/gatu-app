import type { ISubscription } from "@nktkas/hyperliquid";
import { createStore, type StoreApi } from "zustand/vanilla";
import { getNetworkState, subscribeNetworkStatus } from "./internal/websocket/network-status";
import {
	forgetParsedKey,
	getReconnectDelayMs,
	getStalenessThresholdForKey,
	getSubscriptionMethodForKey,
	isUserStreamKey,
	WS_RELIABILITY_LIMITS,
} from "./internal/websocket/reliability";
import { createStalenessWatchdog, type StalenessWatchdog } from "./internal/websocket/staleness";
import { getVisibilityState, subscribeVisibility } from "./internal/websocket/visibility";
import type { HyperliquidConfig, SubscribeFailureOptions, SubscriptionStatus, WebSocketStatus } from "./types";

export type HyperliquidStoreState = {
	config: HyperliquidConfig;
	wsStatus: WebSocketStatus;
	wsError: unknown;
	subscriptions: SubscriptionMap;
	setConfig: (config: HyperliquidConfig) => void;
	acquireSubscription: (
		key: string,
		subscribe: (failureOptions?: SubscribeFailureOptions) => Promise<ISubscription>,
		stalenessThresholdMs?: number | null,
		pauseWhenHidden?: boolean,
	) => void;
	releaseSubscription: (key: string) => void;
	setSubscriptionData: (key: string, data: unknown) => void;
	setSubscriptionError: (key: string, error: unknown) => void;
};

export type HyperliquidStore = StoreApi<HyperliquidStoreState>;

type SubscriptionEntry = {
	status: SubscriptionStatus;
	data?: unknown;
	error?: unknown;
	isStale?: boolean;
};

export type SubscriptionRuntime = {
	refCount: number;
	subscription?: ISubscription;
	promise?: Promise<ISubscription | undefined>;
	reconnectTimer?: ReturnType<typeof setTimeout>;
	cooldownTimer?: ReturnType<typeof setTimeout>;
	reconnectAttempts: number;
	detachStaleness?: () => void;
	pauseWhenHidden?: boolean;
	stalenessThresholdMs?: number;
	recoverStale?: () => void;
	staleRecoveryPromise?: Promise<void>;
	lastMessageAt?: number;
};

type SubscriptionMap = Record<string, SubscriptionEntry>;

type WsState = Pick<HyperliquidStoreState, "wsStatus" | "wsError">;

function deriveWsState(subscriptions: SubscriptionMap): WsState {
	const entries = Object.values(subscriptions);
	if (entries.length === 0) {
		return { wsStatus: "idle" as const, wsError: undefined };
	}
	if (entries.some((entry) => entry.status === "active")) {
		return { wsStatus: "open" as const, wsError: undefined };
	}
	if (entries.some((entry) => entry.status === "subscribing")) {
		return { wsStatus: "connecting" as const, wsError: undefined };
	}
	const errorEntry = entries.find((entry) => entry.status === "error");
	if (errorEntry) {
		return { wsStatus: "error" as const, wsError: errorEntry.error };
	}
	return { wsStatus: "idle" as const, wsError: undefined };
}

function setSubscriptionEntry(
	state: HyperliquidStoreState,
	key: string,
	entry: SubscriptionEntry,
): Pick<HyperliquidStoreState, "subscriptions" | "wsStatus" | "wsError"> {
	const nextSubscriptions: SubscriptionMap = { ...state.subscriptions, [key]: entry };
	return { subscriptions: nextSubscriptions, ...deriveWsState(nextSubscriptions) };
}

function clearReconnectTimer(runtime: SubscriptionRuntime): void {
	if (runtime.reconnectTimer) {
		clearTimeout(runtime.reconnectTimer);
		runtime.reconnectTimer = undefined;
	}
}

function clearCooldownTimer(runtime: SubscriptionRuntime): void {
	if (runtime.cooldownTimer) {
		clearTimeout(runtime.cooldownTimer);
		runtime.cooldownTimer = undefined;
	}
}

function shouldDiscardRetainedDataOnError(key: string): boolean {
	const method = getSubscriptionMethodForKey(key);
	return method === "l2Book" || method === "bbo";
}

function shouldAwaitFreshSnapshotAfterError(key: string): boolean {
	const method = getSubscriptionMethodForKey(key);
	return method === "allDexsClearinghouseState" || method === "openOrders";
}

function safelyTriggerReconnect(triggerReconnect: (() => void) | undefined): void {
	try {
		triggerReconnect?.();
	} catch {}
}

export type ChaosState = {
	messageFrozenUntil: number;
	reconnectDropCount: number;
};

export type WsRecoveryEvent = {
	timestamp: number;
	cause: "stream-stale" | "multiple-streams-stale" | "network-resume";
	action: "resubscribe" | "reconnect";
	streams: Array<{
		key: string;
		method: string | undefined;
		lastMessageAt: number | undefined;
		staleForMs: number | undefined;
		thresholdMs: number | undefined;
	}>;
	visibility: "visible" | "hidden";
	network: "online" | "offline";
};

export type StoreInternals = {
	subscriptionRuntime: Map<string, SubscriptionRuntime>;
	watchdog: StalenessWatchdog;
	visibilityBuffer: Map<string, unknown>;
	chaos: ChaosState;
	recoveryEvents: WsRecoveryEvent[];
};

const internalsByStore = new WeakMap<HyperliquidStore, StoreInternals>();

export function getStoreInternals(store: HyperliquidStore): StoreInternals {
	const internals = internalsByStore.get(store);
	if (!internals) {
		throw new Error("Store internals not found — store was not created by createHyperliquidStore");
	}
	return internals;
}

export function createHyperliquidStore(initialConfig: HyperliquidConfig): HyperliquidStore {
	const subscriptionRuntime = new Map<string, SubscriptionRuntime>();
	const watchdog: StalenessWatchdog = createStalenessWatchdog(WS_RELIABILITY_LIMITS.staleness.checkIntervalMs);
	const visibilityBuffer = new Map<string, unknown>();
	const chaos: ChaosState = { messageFrozenUntil: 0, reconnectDropCount: 0 };
	const recoveryEvents: WsRecoveryEvent[] = [];
	let singletonsAttached = false;
	let staleRecoveryEvaluationQueued = false;
	let detachVisibility: (() => void) | undefined;
	let detachNetwork: (() => void) | undefined;
	let detachDisconnect: (() => void) | undefined;
	let wasHidden = false;
	let wasOffline = false;
	const MAX_RECOVERY_EVENTS = 64;

	function recordRecoveryEvent(
		cause: WsRecoveryEvent["cause"],
		action: WsRecoveryEvent["action"],
		keys: string[],
	): void {
		const timestamp = Date.now();
		recoveryEvents.push({
			timestamp,
			cause,
			action,
			streams: keys.map((key) => {
				const lastMessageAt = subscriptionRuntime.get(key)?.lastMessageAt;
				return {
					key,
					method: getSubscriptionMethodForKey(key),
					lastMessageAt,
					staleForMs: lastMessageAt === undefined ? undefined : timestamp - lastMessageAt,
					thresholdMs: subscriptionRuntime.get(key)?.stalenessThresholdMs,
				};
			}),
			visibility: getVisibilityState(),
			network: getNetworkState(),
		});
		if (recoveryEvents.length > MAX_RECOVERY_EVENTS) {
			recoveryEvents.splice(0, recoveryEvents.length - MAX_RECOVERY_EVENTS);
		}
	}

	function scheduleStaleRecovery(store: StoreApi<HyperliquidStoreState>): void {
		if (staleRecoveryEvaluationQueued) return;
		staleRecoveryEvaluationQueued = true;
		queueMicrotask(() => {
			staleRecoveryEvaluationQueued = false;
			const state = store.getState();
			const staleKeys = Object.keys(state.subscriptions).filter((key) => state.subscriptions[key]?.isStale);
			if (staleKeys.length === 0) return;

			if (staleKeys.length > 1) {
				recordRecoveryEvent("multiple-streams-stale", "reconnect", staleKeys);
				safelyTriggerReconnect(state.config.triggerReconnect);
				return;
			}

			const key = staleKeys[0];
			const runtime = key ? subscriptionRuntime.get(key) : undefined;
			if (!key || !runtime?.recoverStale) return;
			recordRecoveryEvent("stream-stale", "resubscribe", [key]);
			runtime.recoverStale();
		});
	}

	function shouldPauseKey(key: string): boolean {
		const runtime = subscriptionRuntime.get(key);
		if (runtime?.pauseWhenHidden !== undefined) return runtime.pauseWhenHidden;
		return !isUserStreamKey(key);
	}

	function flushVisibilityBuffer(store: StoreApi<HyperliquidStoreState>) {
		if (visibilityBuffer.size === 0) return;
		const state = store.getState();
		for (const [key, data] of visibilityBuffer) {
			state.setSubscriptionData(key, data);
		}
		visibilityBuffer.clear();
	}

	function markRetainedAccountSnapshotsStale(
		store: StoreApi<HyperliquidStoreState>,
		shouldMark: (key: string) => boolean = () => true,
	) {
		const currentSubscriptions = store.getState().subscriptions;
		let nextSubscriptions = currentSubscriptions;

		for (const [key, entry] of Object.entries(currentSubscriptions)) {
			if (!shouldAwaitFreshSnapshotAfterError(key) || entry.data === undefined || !shouldMark(key)) continue;
			visibilityBuffer.delete(key);
			if (entry.isStale) continue;
			if (nextSubscriptions === currentSubscriptions) nextSubscriptions = { ...currentSubscriptions };
			nextSubscriptions[key] = { ...entry, isStale: true };
		}

		if (nextSubscriptions !== currentSubscriptions) {
			store.setState({ subscriptions: nextSubscriptions, ...deriveWsState(nextSubscriptions) });
		}
	}

	function attachSingletons(
		triggerReconnect: (() => void) | undefined,
		subscribeDisconnect: HyperliquidConfig["subscribeDisconnect"],
		store: StoreApi<HyperliquidStoreState>,
	) {
		if (singletonsAttached) return;
		if (!triggerReconnect && !subscribeDisconnect) return;
		singletonsAttached = true;

		detachVisibility = subscribeVisibility((state) => {
			if (state === "hidden") {
				wasHidden = true;
			} else if (wasHidden) {
				wasHidden = false;
				const resumedAtMs = Date.now();
				markRetainedAccountSnapshotsStale(store, (key) => {
					const runtime = subscriptionRuntime.get(key);
					return (
						runtime?.lastMessageAt !== undefined &&
						runtime.stalenessThresholdMs !== undefined &&
						resumedAtMs - runtime.lastMessageAt >= runtime.stalenessThresholdMs
					);
				});
				flushVisibilityBuffer(store);
			}
		});

		detachNetwork = subscribeNetworkStatus((state) => {
			if (state === "offline") {
				wasOffline = true;
				markRetainedAccountSnapshotsStale(store);
			} else if (wasOffline) {
				wasOffline = false;
				markRetainedAccountSnapshotsStale(store);
				if (triggerReconnect) {
					recordRecoveryEvent("network-resume", "reconnect", []);
					safelyTriggerReconnect(triggerReconnect);
				}
			}
		});
		wasOffline = getNetworkState() === "offline";
		if (wasOffline) markRetainedAccountSnapshotsStale(store);
		detachDisconnect = subscribeDisconnect?.(() => {
			markRetainedAccountSnapshotsStale(store);
		});
	}

	function detachSingletons() {
		if (!singletonsAttached) return;
		singletonsAttached = false;
		detachVisibility?.();
		detachVisibility = undefined;
		detachNetwork?.();
		detachNetwork = undefined;
		detachDisconnect?.();
		detachDisconnect = undefined;
		wasHidden = false;
		wasOffline = false;
		visibilityBuffer.clear();
	}

	function setSubscriptionFailure(key: string, error: unknown) {
		const discardData = shouldDiscardRetainedDataOnError(key);
		const awaitFresh = shouldAwaitFreshSnapshotAfterError(key);
		if (discardData || awaitFresh) visibilityBuffer.delete(key);
		store.setState((state) => {
			const current = state.subscriptions[key];
			if (!current) return state;
			return setSubscriptionEntry(state, key, {
				...current,
				data: discardData ? undefined : current.data,
				status: "error",
				error,
				isStale: awaitFresh || current.isStale,
			});
		});
	}

	const store = createStore<HyperliquidStoreState>((set, get) => ({
		config: initialConfig,
		wsStatus: "idle",
		wsError: undefined,
		subscriptions: {},
		setConfig: (config) => set({ config }),
		acquireSubscription: (key, subscribe, stalenessThresholdMs?, pauseWhenHidden?) => {
			// `store` below is a deferred (TDZ-safe) reference: zustand calls
			// this factory synchronously but acquireSubscription only runs after
			// createStore returns, so `store` is already assigned by then.
			if (import.meta.env.DEV && pauseWhenHidden && !get().config.triggerReconnect) {
				console.warn(
					"[hl-react] acquireSubscription: pauseWhenHidden has no effect without config.triggerReconnect. " +
						"Visibility-buffered values will never be flushed because no reconnect can happen on resume.",
				);
			}
			attachSingletons(get().config.triggerReconnect, get().config.subscribeDisconnect, store);

			let runtime = subscriptionRuntime.get(key);
			const isNewRuntime = runtime === undefined;
			if (!runtime) {
				if (subscriptionRuntime.size >= WS_RELIABILITY_LIMITS.subscriptions.maxTrackedKeys) {
					set((state) => {
						const entry: SubscriptionEntry = {
							status: "error",
							error: new Error("Subscription limit reached"),
						};
						return setSubscriptionEntry(state, key, entry);
					});
					return;
				}
				runtime = { refCount: 0, reconnectAttempts: 0, pauseWhenHidden };
				subscriptionRuntime.set(key, runtime);

				const threshold = stalenessThresholdMs === undefined ? getStalenessThresholdForKey(key) : stalenessThresholdMs;
				if (threshold !== null) {
					runtime.stalenessThresholdMs = threshold;
					watchdog.register(key, threshold);
					runtime.detachStaleness = watchdog.subscribe(key, (stale) => {
						if (!stale) return;
						set((state) => {
							const current = state.subscriptions[key];
							if (!current || current.isStale) return state;
							return setSubscriptionEntry(state, key, { ...current, isStale: true });
						});
						scheduleStaleRecovery(store);
					});
				}
			} else if (pauseWhenHidden === false) {
				runtime.pauseWhenHidden = false;
				if (visibilityBuffer.has(key)) {
					const buffered = visibilityBuffer.get(key);
					visibilityBuffer.delete(key);
					set((state) => {
						const current = state.subscriptions[key];
						if (!current) return state;
						return setSubscriptionEntry(state, key, { ...current, data: buffered, isStale: false });
					});
				}
			}
			runtime.refCount += 1;
			clearReconnectTimer(runtime);
			clearCooldownTimer(runtime);

			set((state) => {
				const existing = state.subscriptions[key];
				if (existing && existing.status !== "error" && existing.status !== "idle") {
					return state;
				}

				const entry: SubscriptionEntry = {
					status: "subscribing",
				};

				return setSubscriptionEntry(state, key, entry);
			});

			const scheduleReconnect = () => {
				const currentRuntime = subscriptionRuntime.get(key);
				if (
					!currentRuntime ||
					currentRuntime.refCount <= 0 ||
					currentRuntime.reconnectTimer ||
					currentRuntime.promise ||
					currentRuntime.subscription
				) {
					return;
				}

				currentRuntime.reconnectAttempts += 1;
				if (currentRuntime.reconnectAttempts > WS_RELIABILITY_LIMITS.reconnect.maxAttemptsBeforeCooldown) {
					if (currentRuntime.cooldownTimer) {
						return;
					}

					set((state) => {
						const current = state.subscriptions[key];
						if (!current) return state;
						const nextEntry: SubscriptionEntry = {
							...current,
							status: "error",
							error: new Error("Reconnect cooldown active"),
						};
						return setSubscriptionEntry(state, key, nextEntry);
					});

					currentRuntime.cooldownTimer = setTimeout(() => {
						const runtime = subscriptionRuntime.get(key);
						if (!runtime) return;
						runtime.cooldownTimer = undefined;
						runtime.reconnectAttempts = 0;
						if (runtime.refCount <= 0) return;

						set((state) => {
							const current = state.subscriptions[key];
							if (!current) return state;
							const nextEntry: SubscriptionEntry = {
								...current,
								status: "subscribing",
								error: undefined,
							};
							return setSubscriptionEntry(state, key, nextEntry);
						});

						startSubscription();
					}, WS_RELIABILITY_LIMITS.reconnect.cooldownMs);
					return;
				}

				const delay = getReconnectDelayMs(currentRuntime.reconnectAttempts);
				currentRuntime.reconnectTimer = setTimeout(() => {
					const runtime = subscriptionRuntime.get(key);
					if (!runtime) return;
					runtime.reconnectTimer = undefined;
					if (runtime.refCount <= 0) return;

					set((state) => {
						const current = state.subscriptions[key];
						if (!current) return state;
						const nextEntry: SubscriptionEntry = {
							...current,
							status: "subscribing",
							error: undefined,
						};
						return setSubscriptionEntry(state, key, nextEntry);
					});

					startSubscription();
				}, delay);
			};

			const startSubscription = () => {
				const runtime = subscriptionRuntime.get(key);
				if (
					!runtime ||
					runtime.refCount <= 0 ||
					runtime.promise ||
					runtime.subscription ||
					runtime.staleRecoveryPromise
				) {
					return;
				}

				if (chaos.reconnectDropCount > 0) {
					chaos.reconnectDropCount--;
					setSubscriptionFailure(key, new Error("Chaos: reconnect dropped"));
					scheduleReconnect();
					return;
				}

				// The SDK invokes onError at most once, only after a confirmed subscription fails,
				// and removes the subscription itself — so no manual unsubscribe/detach here.
				let activeSubscription: ISubscription | undefined;
				const onSubscriptionError = (error: unknown) => {
					const runtime = subscriptionRuntime.get(key);
					if (!runtime || !activeSubscription || runtime.subscription !== activeSubscription) return;
					runtime.subscription = undefined;

					setSubscriptionFailure(key, error ?? new Error("Subscription failed"));

					scheduleReconnect();
				};

				runtime.promise = subscribe({ onError: onSubscriptionError })
					.then((subscription) => {
						const runtime = subscriptionRuntime.get(key);
						if (!runtime) {
							void subscription.unsubscribe().catch(() => {});
							return subscription;
						}

						runtime.promise = undefined;

						if (runtime.refCount <= 0) {
							void subscription.unsubscribe().catch(() => {});
							return subscription;
						}

						runtime.subscription = subscription;
						activeSubscription = subscription;
						runtime.reconnectAttempts = 0;
						// l2Book is a confirmed periodic stream. Start its first-frame
						// deadline once the server accepts the subscription so an ack with
						// no subsequent snapshot cannot remain active forever.
						if (getSubscriptionMethodForKey(key) === "l2Book") {
							watchdog.arm(key);
						}

						set((state) => {
							const current = state.subscriptions[key];
							if (!current) return state;
							if (current.status === "active" && current.error === undefined) {
								return state;
							}
							const nextEntry: SubscriptionEntry = {
								...current,
								status: "active",
								error: undefined,
							};
							return setSubscriptionEntry(state, key, nextEntry);
						});

						return subscription;
					})
					.catch((error) => {
						const runtime = subscriptionRuntime.get(key);
						if (!runtime) {
							return undefined;
						}

						runtime.promise = undefined;
						runtime.subscription = undefined;

						setSubscriptionFailure(key, error);

						scheduleReconnect();
						return undefined;
					});
			};

			const recoverStaleSubscription = () => {
				const runtime = subscriptionRuntime.get(key);
				if (!runtime || runtime.refCount <= 0 || runtime.promise || runtime.staleRecoveryPromise) return;

				clearReconnectTimer(runtime);
				clearCooldownTimer(runtime);
				const subscription = runtime.subscription;
				runtime.subscription = undefined;

				set((state) => {
					const current = state.subscriptions[key];
					if (!current) return state;
					return setSubscriptionEntry(state, key, {
						...current,
						status: "subscribing",
						error: undefined,
					});
				});

				const recoveryPromise = (subscription ? subscription.unsubscribe().catch(() => {}) : Promise.resolve()).then(
					() => {
						const current = subscriptionRuntime.get(key);
						if (!current || current !== runtime) return;
						current.staleRecoveryPromise = undefined;
						if (current.refCount <= 0) return;
						startSubscription();
					},
				);
				runtime.staleRecoveryPromise = recoveryPromise;
			};

			if (isNewRuntime) {
				runtime.recoverStale = recoverStaleSubscription;
			}

			startSubscription();
		},
		releaseSubscription: (key) => {
			const runtime = subscriptionRuntime.get(key);
			if (!runtime) {
				return;
			}

			runtime.refCount = Math.max(0, runtime.refCount - 1);
			if (runtime.refCount > 0) {
				return;
			}

			clearReconnectTimer(runtime);
			clearCooldownTimer(runtime);
			runtime.detachStaleness?.();
			watchdog.unregister(key);

			set((state) => {
				if (!state.subscriptions[key]) return state;
				const nextSubscriptions: SubscriptionMap = { ...state.subscriptions };
				delete nextSubscriptions[key];
				return { subscriptions: nextSubscriptions, ...deriveWsState(nextSubscriptions) };
			});

			visibilityBuffer.delete(key);
			subscriptionRuntime.delete(key);
			forgetParsedKey(key);
			if (subscriptionRuntime.size === 0) {
				detachSingletons();
			}

			const subscription = runtime.subscription;
			runtime.subscription = undefined;
			runtime.promise = undefined;

			const runUnsubscribe = async (subscription?: ISubscription) => {
				if (!subscription) return;
				await subscription.unsubscribe().catch(() => {});
			};

			if (subscription) {
				void runUnsubscribe(subscription);
			}
		},
		setSubscriptionData: (key, data) => {
			if (chaos.messageFrozenUntil > Date.now()) return;
			const runtime = subscriptionRuntime.get(key);
			if (runtime) runtime.lastMessageAt = Date.now();
			watchdog.markFresh(key);
			if (getVisibilityState() === "hidden" && shouldPauseKey(key)) {
				visibilityBuffer.set(key, data);
				return;
			}
			set((state) => {
				const current = state.subscriptions[key];
				if (!current) return state;
				if (
					current.status === "active" &&
					current.error === undefined &&
					!current.isStale &&
					Object.is(current.data, data)
				) {
					return state;
				}
				const nextEntry: SubscriptionEntry = {
					...current,
					data,
					status: "active",
					error: undefined,
					isStale: false,
				};
				return setSubscriptionEntry(state, key, nextEntry);
			});
		},
		setSubscriptionError: (key, error) => {
			setSubscriptionFailure(key, error);
		},
	}));

	const internals: StoreInternals = { subscriptionRuntime, watchdog, visibilityBuffer, chaos, recoveryEvents };
	internalsByStore.set(store, internals);

	return store;
}
