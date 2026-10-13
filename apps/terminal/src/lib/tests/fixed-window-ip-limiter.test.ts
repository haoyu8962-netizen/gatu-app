import { describe, expect, it } from "vitest";
import { createFixedWindowIpLimiter } from "@/lib/server/fixed-window-ip-limiter";

describe("fixed window ip limiter", () => {
	it("counts each client separately and reopens the window on expiry or a clock rollback", () => {
		const limiter = createFixedWindowIpLimiter({ limit: 2, windowMs: 60_000, maxEntries: 10 });

		expect(limiter.consume("a", 1_000)).toEqual({ allowed: true, retryAfterSeconds: 0 });
		expect(limiter.consume("a", 2_000)).toEqual({ allowed: true, retryAfterSeconds: 0 });
		expect(limiter.consume("a", 3_000)).toEqual({ allowed: false, retryAfterSeconds: 58 });
		expect(limiter.consume("b", 3_000).allowed).toBe(true);
		expect(limiter.consume("a", 61_000).allowed).toBe(true);
		expect(limiter.consume("a", 500).allowed).toBe(true);
	});

	it("evicts expired entries first and the oldest window when full", () => {
		const limiter = createFixedWindowIpLimiter({ limit: 1, windowMs: 1_000, maxEntries: 2 });

		limiter.consume("a", 0);
		limiter.consume("b", 10);
		limiter.consume("c", 2_000);
		expect(limiter.size).toBe(1);

		limiter.consume("d", 2_010);
		limiter.consume("e", 2_020);
		expect(limiter.size).toBe(2);
		expect(limiter.consume("d", 2_030).allowed).toBe(false);
		expect(limiter.consume("c", 2_040).allowed).toBe(true);
	});
});
