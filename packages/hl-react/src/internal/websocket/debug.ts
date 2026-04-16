import { getStoreInternals, type HyperliquidStore } from "../../store";

type DebugSnapshot = {
	subscriptions: Record<string, { status: string; hasData: boolean; isStale: boolean }>;
	counters: Record<string, { refCount: number; reconnectAttempts: number }>;
	lastMessageAt: Record<string, number | undefined>;
	transportState: {
		wsStatus: string;
		wsError: string | undefined;
		activeSubscriptionCount: number;
		visibilityBufferSize: number;
	};
};

declare global {
	interface Window {
		__hl_debug?: () => DebugSnapshot;
	}
}

// Module-level reference to the most recently provider-mounted store. Used only
// as a fallback for `enableHyperliquidDebug()` when called without an explicit
// store argument (the common single-app case). Multi-store apps should pass
// their store explicitly.
let lastMountedStore: HyperliquidStore | null = null;

function createDebugSnapshot(store: HyperliquidStore): DebugSnapshot {
	const state = store.getState();
	const internals = getStoreInternals(store);

	const subscriptions: DebugSnapshot["subscriptions"] = {};
	const counters: DebugSnapshot["counters"] = {};
	const lastMessageAt: DebugSnapshot["lastMessageAt"] = {};

	for (const key of Object.keys(state.subscriptions)) {
		const entry = state.subscriptions[key];
		subscriptions[key] = {
			status: entry.status,
			hasData: entry.data !== undefined,
			isStale: entry.isStale ?? false,
		};

		const runtime = internals.subscriptionRuntime.get(key);
		counters[key] = {
			refCount: runtime?.refCount ?? 0,
			reconnectAttempts: runtime?.reconnectAttempts ?? 0,
		};
		lastMessageAt[key] = internals.watchdog.getLastMessageAt(key);
	}

	return {
		subscriptions,
		counters,
		lastMessageAt,
		transportState: {
			wsStatus: state.wsStatus,
			wsError: state.wsError !== undefined ? String(state.wsError) : undefined,
			activeSubscriptionCount: Object.keys(state.subscriptions).length,
			visibilityBufferSize: internals.visibilityBuffer.size,
		},
	};
}

export function setDebugStore(store: HyperliquidStore): void {
	lastMountedStore = store;
}

export function registerDebugSnapshot(store: HyperliquidStore): void {
	if (typeof window === "undefined") return;
	window.__hl_debug = () => createDebugSnapshot(store);
}

// Opt-in prod activation. Pass the store you want introspected. When omitted,
// falls back to the last store registered via setDebugStore — sufficient for
// single-store apps, but multi-store callers must pass their store explicitly.
export function enableHyperliquidDebug(store?: HyperliquidStore): void {
	if (typeof window === "undefined") return;
	const target = store ?? lastMountedStore;
	if (!target) return;
	window.__hl_debug = () => createDebugSnapshot(target);
}
