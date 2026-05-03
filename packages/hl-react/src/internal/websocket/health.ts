import { getStoreInternals, type HyperliquidStore } from "../../store";
import { WS_RELIABILITY_LIMITS } from "./reliability";

export type HealthAlertSeverity = "warning" | "critical";

export type HealthAlert = {
	id: "heap-growth" | "heap-pressure" | "reconnect-storm" | "listener-growth" | "stale-streams";
	severity: HealthAlertSeverity;
	message: string;
	value: number;
	threshold: number;
};

export type HealthReport = {
	status: "healthy" | "warning" | "critical";
	sampledAt: number;
	metrics: {
		activeSubscriptions: number;
		runtimeSubscriptions: number;
		totalRefCount: number;
		maxRefCount: number;
		maxReconnectAttempts: number;
		staleSubscriptions: number;
		visibilityBufferSize: number;
		heapUsedBytes?: number;
		heapLimitBytes?: number;
		heapSlopeBytesPerMinute?: number;
	};
	alerts: HealthAlert[];
};

declare global {
	interface Window {
		__hl_health?: () => HealthReport;
	}
}

type HeapSample = {
	at: number;
	usedBytes: number;
	limitBytes?: number;
};

type ChromePerformanceMemory = {
	usedJSHeapSize: number;
	totalJSHeapSize?: number;
	jsHeapSizeLimit?: number;
};

const heapSamplesByStore = new WeakMap<HyperliquidStore, HeapSample[]>();

const HEALTH_LIMITS = {
	heapSlopeWarningBytesPerMinute: 8 * 1024 * 1024,
	heapSlopeCriticalBytesPerMinute: 16 * 1024 * 1024,
	heapPressureWarningRatio: 0.8,
	reconnectStormWarningAttempts: Math.ceil(WS_RELIABILITY_LIMITS.reconnect.maxAttemptsBeforeCooldown / 2),
	refCountWarning: 8,
	refSurplusWarning: 24,
	heapSampleWindowMs: 5 * 60_000,
	minHeapSlopeSamples: 3,
	minHeapSlopeWindowMs: 2 * 60_000,
	trackedKeyWarningRatio: 0.8,
} as const;

function readChromeMemory(): ChromePerformanceMemory | undefined {
	if (typeof performance === "undefined") return undefined;
	const memory = (performance as Performance & { memory?: ChromePerformanceMemory }).memory;
	if (!memory || typeof memory.usedJSHeapSize !== "number") return undefined;
	return memory;
}

function updateHeapTrend(store: HyperliquidStore, now: number) {
	const memory = readChromeMemory();
	if (!memory) return {};

	const samples = heapSamplesByStore.get(store) ?? [];
	samples.push({
		at: now,
		usedBytes: memory.usedJSHeapSize,
		limitBytes: memory.jsHeapSizeLimit,
	});

	const minAt = now - HEALTH_LIMITS.heapSampleWindowMs;
	while (samples.length > 0 && samples[0].at < minAt) {
		samples.shift();
	}
	heapSamplesByStore.set(store, samples);

	let heapSlopeBytesPerMinute: number | undefined;
	const first = samples[0];
	const last = samples[samples.length - 1];
	if (
		first &&
		last &&
		samples.length >= HEALTH_LIMITS.minHeapSlopeSamples &&
		last.at - first.at >= HEALTH_LIMITS.minHeapSlopeWindowMs
	) {
		heapSlopeBytesPerMinute = calculateHeapSlopeBytesPerMinute(samples);
	}

	return {
		heapUsedBytes: memory.usedJSHeapSize,
		heapLimitBytes: memory.jsHeapSizeLimit,
		heapSlopeBytesPerMinute,
	};
}

function calculateHeapSlopeBytesPerMinute(samples: HeapSample[]): number | undefined {
	if (samples.length < HEALTH_LIMITS.minHeapSlopeSamples) return undefined;

	const firstAt = samples[0]?.at;
	if (firstAt === undefined) return undefined;

	let sumX = 0;
	let sumY = 0;
	let sumXX = 0;
	let sumXY = 0;

	for (const sample of samples) {
		const x = (sample.at - firstAt) / 60_000;
		const y = sample.usedBytes;
		sumX += x;
		sumY += y;
		sumXX += x * x;
		sumXY += x * y;
	}

	const count = samples.length;
	const denominator = count * sumXX - sumX * sumX;
	if (denominator === 0) return undefined;
	return (count * sumXY - sumX * sumY) / denominator;
}

function getWorstStatus(alerts: HealthAlert[]): HealthReport["status"] {
	if (alerts.some((alert) => alert.severity === "critical")) return "critical";
	if (alerts.length > 0) return "warning";
	return "healthy";
}

export function createHealthReport(store: HyperliquidStore): HealthReport {
	const now = Date.now();
	const state = store.getState();
	const internals = getStoreInternals(store);
	const keys = Object.keys(state.subscriptions);

	let totalRefCount = 0;
	let maxRefCount = 0;
	let maxReconnectAttempts = 0;

	for (const runtime of internals.subscriptionRuntime.values()) {
		totalRefCount += runtime.refCount;
		maxRefCount = Math.max(maxRefCount, runtime.refCount);
		maxReconnectAttempts = Math.max(maxReconnectAttempts, runtime.reconnectAttempts);
	}

	const staleSubscriptions = keys.reduce((count, key) => count + (state.subscriptions[key]?.isStale ? 1 : 0), 0);
	const heapTrend = updateHeapTrend(store, now);

	const metrics: HealthReport["metrics"] = {
		activeSubscriptions: keys.length,
		runtimeSubscriptions: internals.subscriptionRuntime.size,
		totalRefCount,
		maxRefCount,
		maxReconnectAttempts,
		staleSubscriptions,
		visibilityBufferSize: internals.visibilityBuffer.size,
		...heapTrend,
	};

	const alerts: HealthAlert[] = [];

	if (metrics.heapSlopeBytesPerMinute !== undefined) {
		const slope = metrics.heapSlopeBytesPerMinute;
		if (slope >= HEALTH_LIMITS.heapSlopeCriticalBytesPerMinute) {
			alerts.push({
				id: "heap-growth",
				severity: "critical",
				message: "JS heap is growing quickly across runtime samples.",
				value: slope,
				threshold: HEALTH_LIMITS.heapSlopeCriticalBytesPerMinute,
			});
		} else if (slope >= HEALTH_LIMITS.heapSlopeWarningBytesPerMinute) {
			alerts.push({
				id: "heap-growth",
				severity: "warning",
				message: "JS heap is trending upward across runtime samples.",
				value: slope,
				threshold: HEALTH_LIMITS.heapSlopeWarningBytesPerMinute,
			});
		}
	}

	if (metrics.heapUsedBytes !== undefined && metrics.heapLimitBytes !== undefined) {
		const heapPressure = metrics.heapUsedBytes / metrics.heapLimitBytes;
		if (heapPressure >= HEALTH_LIMITS.heapPressureWarningRatio) {
			alerts.push({
				id: "heap-pressure",
				severity: "warning",
				message: "JS heap is using a high fraction of the browser heap limit.",
				value: heapPressure,
				threshold: HEALTH_LIMITS.heapPressureWarningRatio,
			});
		}
	}

	if (metrics.maxReconnectAttempts >= WS_RELIABILITY_LIMITS.reconnect.maxAttemptsBeforeCooldown) {
		alerts.push({
			id: "reconnect-storm",
			severity: "critical",
			message: "A websocket subscription is close to reconnect cooldown.",
			value: metrics.maxReconnectAttempts,
			threshold: WS_RELIABILITY_LIMITS.reconnect.maxAttemptsBeforeCooldown,
		});
	} else if (metrics.maxReconnectAttempts >= HEALTH_LIMITS.reconnectStormWarningAttempts) {
		alerts.push({
			id: "reconnect-storm",
			severity: "warning",
			message: "A websocket subscription is reconnecting repeatedly.",
			value: metrics.maxReconnectAttempts,
			threshold: HEALTH_LIMITS.reconnectStormWarningAttempts,
		});
	}

	const refSurplus = metrics.totalRefCount - metrics.runtimeSubscriptions;
	if (metrics.runtimeSubscriptions !== metrics.activeSubscriptions) {
		alerts.push({
			id: "listener-growth",
			severity: "warning",
			message: "Tracked subscription entries differ from websocket runtime entries.",
			value: Math.abs(metrics.runtimeSubscriptions - metrics.activeSubscriptions),
			threshold: 0,
		});
	}

	if (metrics.maxRefCount >= HEALTH_LIMITS.refCountWarning) {
		alerts.push({
			id: "listener-growth",
			severity: "warning",
			message: "A websocket subscription has more listeners than expected.",
			value: metrics.maxRefCount,
			threshold: HEALTH_LIMITS.refCountWarning,
		});
	}

	if (refSurplus >= HEALTH_LIMITS.refSurplusWarning) {
		alerts.push({
			id: "listener-growth",
			severity: "warning",
			message: "Total websocket listener references exceed runtime subscriptions by a large margin.",
			value: refSurplus,
			threshold: HEALTH_LIMITS.refSurplusWarning,
		});
	}

	const trackedKeyWarningThreshold =
		WS_RELIABILITY_LIMITS.subscriptions.maxTrackedKeys * HEALTH_LIMITS.trackedKeyWarningRatio;
	if (metrics.activeSubscriptions >= trackedKeyWarningThreshold) {
		alerts.push({
			id: "listener-growth",
			severity:
				metrics.activeSubscriptions >= WS_RELIABILITY_LIMITS.subscriptions.maxTrackedKeys ? "critical" : "warning",
			message: "The active websocket subscription key count is near the tracked-key limit.",
			value: metrics.activeSubscriptions,
			threshold:
				metrics.activeSubscriptions >= WS_RELIABILITY_LIMITS.subscriptions.maxTrackedKeys
					? WS_RELIABILITY_LIMITS.subscriptions.maxTrackedKeys
					: trackedKeyWarningThreshold,
		});
	}

	if (metrics.staleSubscriptions > 0) {
		alerts.push({
			id: "stale-streams",
			severity: "warning",
			message: "One or more websocket streams are stale and should trigger reconnect recovery.",
			value: metrics.staleSubscriptions,
			threshold: 0,
		});
	}

	return {
		status: getWorstStatus(alerts),
		sampledAt: now,
		metrics,
		alerts,
	};
}

export function registerHealthReport(store: HyperliquidStore): void {
	if (typeof window === "undefined") return;
	window.__hl_health = () => createHealthReport(store);
}
