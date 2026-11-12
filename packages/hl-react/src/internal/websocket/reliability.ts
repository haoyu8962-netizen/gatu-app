export const WS_RELIABILITY_LIMITS = {
	reconnect: {
		baseDelayMs: 250,
		maxDelayMs: 5_000,
		maxAttemptsBeforeCooldown: 20,
		cooldownMs: 30_000,
	},
	sdkReconnect: {
		// The SDK's ReconnectingWebSocket handles its own backoff once the
		// store triggers a reconnect. These constants are the single source of
		// truth for that inner loop — imported by clients.ts and the test.
		baseDelayMs: 500,
		maxDelayMs: 30_000,
	},
	subscriptions: {
		maxTrackedKeys: 800,
	},
	payload: {
		defaultMaxBytes: 256 * 1024,
		perMethodMaxBytes: {
			l2: 1024 * 1024,
			l2Book: 1024 * 1024,
			allMids: 512 * 1024,
			fastAssetCtxs: 512 * 1024,
			allDexsAssetCtxs: 512 * 1024,
			assetCtxs: 512 * 1024,
			pac: 1024 * 1024,
			sac: 1024 * 1024,
			trades: 384 * 1024,
		},
	},
	cache: {
		maxChartLastBarEntries: 256,
	},
	transport: {
		// The SDK pings every 30s. A 45s all-message silence therefore means
		// neither market data nor the expected pong reached this client.
		inactivityThresholdMs: 45_000,
		checkIntervalMs: 5_000,
		// How long a socket that looks open may stay silent after the page returns to the foreground
		// and a heartbeat was sent. A phone suspends the page in the background, and the connection
		// can die without a close event; a live one answers within a round trip.
		resumeProbeTimeoutMs: 2_500,
	},
	staleness: {
		checkIntervalMs: 5_000,
		// Public l2Book snapshots arrive around every 5s by default. The
		// incremental l2 channel and l2Book fast mode arrive around every 0.5s.
		// Allow several missed snapshots before recovery.
		l2BookFastThresholdMs: 3_000,
		perMethodThresholdMs: {
			l2: 3_000,
			l2Book: 15_000,
			allMids: 20_000,
			activeAssetCtx: 10_000,
			activeSpotAssetCtx: 10_000,
			activeAssetData: 20_000,
			fastAssetCtxs: 10_000,
			allDexsAssetCtxs: 20_000,
			spotAssetCtxs: 20_000,
			assetCtxs: 20_000,
			pac: 20_000,
			sac: 20_000,
			webData3: 60_000,
			allDexsClearinghouseState: 60_000,
			spotState: 60_000,
			clearinghouseState: 60_000,
			openOrders: 60_000,
			twapStates: 60_000,
		},
	},
} as const;

const USER_STREAM_METHODS = new Set([
	"orderUpdates",
	"webData3",
	"allDexsClearinghouseState",
	"spotState",
	"openOrders",
	"twapStates",
	"clearinghouseState",
	"userFills",
	"userFundings",
	"userHistoricalOrders",
	"userNonFundingLedgerUpdates",
	"userTwapHistory",
	"userTwapSliceFills",
]);

const NON_PERIODIC_METHODS = new Set([
	"notification",
	"bbo",
	"trades",
	"candle",
	"orderUpdates",
	"userEvents",
	"userFills",
	"userFundings",
	"userHistoricalOrders",
	"userNonFundingLedgerUpdates",
	"userTwapHistory",
	"userTwapSliceFills",
]);

// Union of methods we explicitly classify. Anything outside this list falls
// through to "market stream" behavior (pause-and-buffer on hidden). We emit a
// one-shot dev warning so new SDK methods don't silently land on that path.
const KNOWN_METHODS = new Set<string>([
	...USER_STREAM_METHODS,
	...NON_PERIODIC_METHODS,
	...Object.keys(WS_RELIABILITY_LIMITS.staleness.perMethodThresholdMs),
]);
const warnedUnknownMethods = new Set<string>();

// Subscription keys are stringified JSON arrays. `useSub` passes the same key
// to multiple helpers per render; cache the parse so we parse each key once.
// The store calls `forgetParsedKey` from `releaseSubscription` so the cache
// stays bounded by the number of live subscriptions across long sessions.
type ParsedKey = { method: string | undefined; params: unknown } | null;
const parsedKeyCache = new Map<string, ParsedKey>();

function parseKey(key: string): ParsedKey {
	const cached = parsedKeyCache.get(key);
	if (cached !== undefined) return cached;
	let value: ParsedKey = null;
	try {
		const parsed = JSON.parse(key) as unknown;
		if (Array.isArray(parsed)) {
			const method = typeof parsed[2] === "string" ? (parsed[2] as string) : undefined;
			value = { method, params: parsed[3] };
		}
	} catch {
		// leave value as null
	}
	parsedKeyCache.set(key, value);
	return value;
}

export function forgetParsedKey(key: string): void {
	parsedKeyCache.delete(key);
}

export function isUserStreamKey(key: string): boolean {
	const parsed = parseKey(key);
	if (!parsed) return false;
	if (parsed.method !== undefined) {
		if (USER_STREAM_METHODS.has(parsed.method)) return true;
		if (import.meta.env?.DEV && !KNOWN_METHODS.has(parsed.method) && !warnedUnknownMethods.has(parsed.method)) {
			warnedUnknownMethods.add(parsed.method);
			console.warn(
				`[hl-react] Unknown subscription method "${parsed.method}"; treating as market stream. ` +
					"If this is a user stream, add it to USER_STREAM_METHODS in reliability.ts.",
			);
		}
	}
	const params = parsed.params;
	if (params && typeof params === "object" && !Array.isArray(params) && "user" in params) return true;
	return false;
}

export function shouldDropOversizedPayloadForSubscriptionKey(key: string): boolean {
	return !isUserStreamKey(key);
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

// Exponential backoff fed into the SDK's reconnect loop. Declared here so the
// formula has one source of truth across clients.ts and tests.
export function getSdkReconnectionDelayMs(attempt: number): number {
	const { baseDelayMs, maxDelayMs } = WS_RELIABILITY_LIMITS.sdkReconnect;
	return Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
}

export function getSubscriptionMethodForKey(key: string): string | undefined {
	const parsed = parseKey(key);
	return parsed?.method;
}

export function getStalenessThresholdForKey(key: string): number | null {
	const parsed = parseKey(key);
	const method = parsed?.method;
	if (!method) return null;
	if (
		method === "l2Book" &&
		parsed.params !== null &&
		typeof parsed.params === "object" &&
		!Array.isArray(parsed.params) &&
		"fast" in parsed.params &&
		parsed.params.fast === true
	) {
		return WS_RELIABILITY_LIMITS.staleness.l2BookFastThresholdMs;
	}
	const table = WS_RELIABILITY_LIMITS.staleness.perMethodThresholdMs;
	return table[method as keyof typeof table] ?? null;
}

export function getPayloadLimitBytesForSubscriptionKey(key: string): number {
	const parsed = parseKey(key);
	const fallback = WS_RELIABILITY_LIMITS.payload.defaultMaxBytes;
	if (!parsed || parsed.method === undefined) return fallback;
	const table = WS_RELIABILITY_LIMITS.payload.perMethodMaxBytes;
	return table[parsed.method as keyof typeof table] ?? fallback;
}
