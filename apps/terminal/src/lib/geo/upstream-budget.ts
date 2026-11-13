export interface UpstreamBudgetOptions {
	/** Tokens available at once; also the starting balance. */
	burst: number;
	/** Tokens added back per minute, continuously. */
	perMinute: number;
}

export interface UpstreamBudget {
	/** Takes one token when available; otherwise reports when the next token arrives. */
	take(nowMs: number): { allowed: true } | { allowed: false; retryAfterSeconds: number };
}

/** A token bucket kept in process memory, so each server instance spends its own budget. */
export function createUpstreamBudget({ burst, perMinute }: UpstreamBudgetOptions): UpstreamBudget {
	const refillPerMs = perMinute / 60_000;
	let tokens = burst;
	let updatedAtMs: number | undefined;

	return {
		take(nowMs) {
			if (updatedAtMs !== undefined && nowMs > updatedAtMs) {
				tokens = Math.min(burst, tokens + (nowMs - updatedAtMs) * refillPerMs);
			}
			updatedAtMs = nowMs;
			if (tokens >= 1) {
				tokens -= 1;
				return { allowed: true };
			}
			return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((1 - tokens) / refillPerMs / 1000)) };
		},
	};
}
