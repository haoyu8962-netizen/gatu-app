import { describe, expect, it } from "vitest";
import { getQueryRetryDelayMs, parseRetryAfterMs, shouldRetryQuery } from "@/lib/query-retry";

function httpError(status: number, retryAfter?: string): Error {
	return Object.assign(new Error(`HTTP ${status}`), {
		response: {
			status,
			headers: { get: (name: string) => (name === "retry-after" ? (retryAfter ?? null) : null) },
		},
	});
}

describe("query retry policy", () => {
	it("retries a rate-limited query at most once", () => {
		const error = httpError(429);
		expect(shouldRetryQuery(0, error)).toBe(true);
		expect(shouldRetryQuery(1, error)).toBe(false);
	});

	it("does not retry permanent client errors or aborted requests", () => {
		expect(shouldRetryQuery(0, httpError(400))).toBe(false);
		expect(shouldRetryQuery(0, httpError(404))).toBe(false);
		const abortError = new Error("aborted");
		abortError.name = "AbortError";
		expect(shouldRetryQuery(0, abortError)).toBe(false);
		expect(shouldRetryQuery(0, new Error("Request aborted", { cause: abortError }))).toBe(false);
	});

	it("limits transient network, timeout, and server retries", () => {
		for (const error of [new Error("network"), httpError(408), httpError(503)]) {
			expect(shouldRetryQuery(0, error)).toBe(true);
			expect(shouldRetryQuery(1, error)).toBe(true);
			expect(shouldRetryQuery(2, error)).toBe(false);
		}
	});

	it("honors Retry-After seconds and caps excessive delays", () => {
		expect(parseRetryAfterMs("12")).toBe(12_000);
		expect(parseRetryAfterMs("120")).toBe(60_000);
		expect(getQueryRetryDelayMs(0, httpError(429, "7"), () => 1)).toBe(7_000);
		expect(getQueryRetryDelayMs(0, httpError(429), () => 0)).toBe(10_000);
	});

	it("parses Retry-After dates and uses bounded jittered backoff otherwise", () => {
		const now = Date.parse("2026-07-22T00:00:00Z");
		expect(parseRetryAfterMs("Wed, 22 Jul 2026 00:00:05 GMT", now)).toBe(5_000);
		expect(parseRetryAfterMs("invalid", now)).toBeNull();
		expect(getQueryRetryDelayMs(2, new Error("network"), () => 0.5)).toBe(4_200);
	});
});
