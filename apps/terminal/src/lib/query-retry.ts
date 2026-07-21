const MAX_RETRY_AFTER_MS = 60_000;
const MAX_BACKOFF_MS = 30_000;
const RATE_LIMIT_FALLBACK_MS = 10_000;

type HttpLikeError = Error & {
	cause?: unknown;
	response?: {
		status?: number;
		headers?: { get: (name: string) => string | null };
	};
};

function getHttpStatus(error: unknown): number | null {
	if (!(error instanceof Error)) return null;
	const status = (error as HttpLikeError).response?.status;
	return typeof status === "number" ? status : null;
}

function isAbortError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	if (error.name === "AbortError") return true;
	return error.cause !== error && isAbortError(error.cause);
}

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
	if (isAbortError(error)) return false;

	const status = getHttpStatus(error);
	if (status === 429) return failureCount < 1;
	if (status === 408 || (status !== null && status >= 500)) return failureCount < 2;
	if (status !== null && status >= 400) return false;

	return failureCount < 2;
}

export function parseRetryAfterMs(value: string | null, nowMs = Date.now()): number | null {
	if (!value) return null;

	const seconds = Number(value);
	if (Number.isFinite(seconds) && seconds >= 0) {
		return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
	}

	const retryAt = Date.parse(value);
	if (!Number.isFinite(retryAt)) return null;
	return Math.min(Math.max(retryAt - nowMs, 0), MAX_RETRY_AFTER_MS);
}

export function getQueryRetryDelayMs(failureCount: number, error: unknown, random = Math.random): number {
	const headers = error instanceof Error ? (error as HttpLikeError).response?.headers : undefined;
	const retryAfterMs = parseRetryAfterMs(headers?.get("retry-after") ?? null);
	if (retryAfterMs !== null) return retryAfterMs;
	if (getHttpStatus(error) === 429) return RATE_LIMIT_FALLBACK_MS;

	const backoffMs = Math.min(1000 * 2 ** failureCount, MAX_BACKOFF_MS);
	return Math.round(backoffMs + backoffMs * 0.1 * random());
}
