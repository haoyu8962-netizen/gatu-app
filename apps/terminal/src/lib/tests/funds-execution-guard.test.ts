import { describe, expect, it } from "vitest";
import { assertFreshFundsAmount, FundsExecutionError } from "@/domain/trade/funds-execution-guard";

describe("funds SDK execution guard", () => {
	it("accepts a positive amount within a fresh balance", () => {
		expect(() => assertFreshFundsAmount("10.5", "20", 1_000, 1_001)).not.toThrow();
	});

	it("rejects an expired snapshot or an amount above the current balance", () => {
		expectFundsExecutionError(() => assertFreshFundsAmount("1", "20", 1_000, 61_001), "balance-unavailable");
		expectFundsExecutionError(() => assertFreshFundsAmount("20.1", "20", 1_000, 1_001), "balance-changed");
	});

	it("preserves protocol decimal precision instead of accepting a rounded JavaScript number", () => {
		expectFundsExecutionError(
			() =>
				assertFreshFundsAmount(
					"9007199254740992.000000000000000002",
					"9007199254740992.000000000000000001",
					1_000,
					1_001,
				),
			"balance-changed",
		);
	});
});

function expectFundsExecutionError(execute: () => void, reason: "balance-changed" | "balance-unavailable") {
	try {
		execute();
		throw new Error("Expected funds execution guard to fail");
	} catch (error) {
		expect(error).toBeInstanceOf(FundsExecutionError);
		expect((error as FundsExecutionError).reason).toBe(reason);
	}
}
