import { describe, expect, it } from "vitest";
import { assertFreshFundsAmount } from "@/domain/trade/funds-execution-guard";

describe("funds SDK execution guard", () => {
	it("accepts a positive amount within a fresh balance", () => {
		expect(() => assertFreshFundsAmount("10.5", "20", 1_000, 1_001)).not.toThrow();
	});

	it("rejects an expired snapshot or an amount above the current balance", () => {
		expect(() => assertFreshFundsAmount("1", "20", 1_000, 61_001)).toThrow("unavailable");
		expect(() => assertFreshFundsAmount("20.1", "20", 1_000, 1_001)).toThrow("changed");
	});

	it("preserves protocol decimal precision instead of accepting a rounded JavaScript number", () => {
		expect(() =>
			assertFreshFundsAmount(
				"9007199254740992.000000000000000002",
				"9007199254740992.000000000000000001",
				1_000,
				1_001,
			),
		).toThrow("changed");
	});
});
