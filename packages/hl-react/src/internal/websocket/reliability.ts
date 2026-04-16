export const WS_RELIABILITY_LIMITS = {
	reconnect: {
		baseDelayMs: 250,
		maxDelayMs: 5_000,
		maxAttemptsBeforeCooldown: 20,
		cooldownMs: 30_000,
	},
	subscriptions: {
		maxTrackedKeys: 800,
	},
	payload: {
		defaultMaxBytes: 256 * 1024,
		perMethodMaxBytes: {
			l2Book: 1024 * 1024,
			allMids: 512 * 1024,
			allDexsAssetCtxs: 512 * 1024,
			assetCtxs: 512 * 1024,
			trades: 384 * 1024,
		},
	},
	cache: {
		maxChartLastBarEntries: 256,
	},
	staleness: {
		checkIntervalMs: 5_000,
		defaultThresholdMs: 30_000,
		perMethodThresholdMs: {
			l2Book: 20_000,
			trades: 20_000,
			allMids: 20_000,
			candle: 20_000,
			activeAssetCtx: 20_000,
			activeAssetData: 20_000,
			allDexsAssetCtxs: 20_000,
			spotAssetCtxs: 20_000,
			assetCtxs: 20_000,
			orderUpdates: 60_000,
			webData2: 60_000,
			webData3: 60_000,
			allDexsClearinghouseState: 60_000,
		},
		aggregateStaleRatio: 0.5,
	},
} as const;

const USER_STREAM_METHODS = new Set(["orderUpdates", "webData2", "webData3", "allDexsClearinghouseState"]);

export function isUserStreamKey(key: string): boolean {
	try {
		const parsed = JSON.parse(key) as unknown;
		if (!Array.isArray(parsed)) return false;
		const method = parsed[2];
		if (typeof method === "string" && USER_STREAM_METHODS.has(method)) return true;
		const params = parsed[3];
		if (params && typeof params === "object" && !Array.isArray(params) && "user" in params) return true;
		return false;
	} catch {
		return false;
	}
}

export function getReconnectDelayMs(attempt: number): number {
	const exponent = Math.max(0, attempt - 1);
	const baseDelay = Math.min(
		WS_RELIABILITY_LIMITS.reconnect.baseDelayMs * 2 ** exponent,
		WS_RELIABILITY_LIMITS.reconnect.maxDelayMs,
	);
	const jitter = baseDelay * 0.2 * Math.random();
	return Math.round(baseDelay + jitter);
}

export function getStalenessThresholdForKey(key: string): number {
	try {
		const parsed = JSON.parse(key) as unknown;
		if (!Array.isArray(parsed)) return WS_RELIABILITY_LIMITS.staleness.defaultThresholdMs;
		const method = parsed[2];
		if (typeof method !== "string") return WS_RELIABILITY_LIMITS.staleness.defaultThresholdMs;
		return (
			WS_RELIABILITY_LIMITS.staleness.perMethodThresholdMs[
				method as keyof typeof WS_RELIABILITY_LIMITS.staleness.perMethodThresholdMs
			] ?? WS_RELIABILITY_LIMITS.staleness.defaultThresholdMs
		);
	} catch {
		return WS_RELIABILITY_LIMITS.staleness.defaultThresholdMs;
	}
}

export function getPayloadLimitBytesForSubscriptionKey(key: string): number {
	try {
		const parsed = JSON.parse(key) as unknown;
		if (!Array.isArray(parsed)) {
			return WS_RELIABILITY_LIMITS.payload.defaultMaxBytes;
		}

		const method = parsed[2];
		if (typeof method !== "string") {
			return WS_RELIABILITY_LIMITS.payload.defaultMaxBytes;
		}

		return (
			WS_RELIABILITY_LIMITS.payload.perMethodMaxBytes[
				method as keyof typeof WS_RELIABILITY_LIMITS.payload.perMethodMaxBytes
			] ?? WS_RELIABILITY_LIMITS.payload.defaultMaxBytes
		);
	} catch {
		return WS_RELIABILITY_LIMITS.payload.defaultMaxBytes;
	}
}
