export interface FixedWindowIpLimiterOptions {
	limit: number;
	windowMs: number;
	/** Entries kept in memory; expired entries go first, then the oldest window, so one process stays bounded. */
	maxEntries: number;
}

export interface FixedWindowIpLimitResult {
	allowed: boolean;
	retryAfterSeconds: number;
}

export interface FixedWindowIpLimiter {
	consume(ip: string, nowMs: number): FixedWindowIpLimitResult;
	readonly size: number;
}

type LimiterEntry = { windowStartedAtMs: number; count: number };

/**
 * A per-client fixed-window budget for the API routes that reach a paid or shared backend. The
 * window is per process: every Lambda instance and every dev server counts on its own, and nothing
 * is persisted, so a client address lives in memory only until its window expires or is evicted.
 */
export function createFixedWindowIpLimiter(options: FixedWindowIpLimiterOptions): FixedWindowIpLimiter {
	const { limit, windowMs, maxEntries } = options;
	const entries = new Map<string, LimiterEntry>();

	function evict(nowMs: number): void {
		if (entries.size < maxEntries) return;
		for (const [key, entry] of entries) {
			if (nowMs - entry.windowStartedAtMs >= windowMs) entries.delete(key);
		}
		if (entries.size < maxEntries) return;
		const oldest = entries.keys().next();
		if (!oldest.done) entries.delete(oldest.value);
	}

	return {
		consume(ip, nowMs) {
			const entry = entries.get(ip);
			if (!entry || nowMs - entry.windowStartedAtMs >= windowMs || nowMs < entry.windowStartedAtMs) {
				evict(nowMs);
				entries.set(ip, { windowStartedAtMs: nowMs, count: 1 });
				return { allowed: true, retryAfterSeconds: 0 };
			}
			if (entry.count >= limit) {
				return {
					allowed: false,
					retryAfterSeconds: Math.max(1, Math.ceil((entry.windowStartedAtMs + windowMs - nowMs) / 1000)),
				};
			}
			entry.count += 1;
			return { allowed: true, retryAfterSeconds: 0 };
		},
		get size() {
			return entries.size;
		},
	};
}
