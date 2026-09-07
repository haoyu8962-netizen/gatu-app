import { describe, expect, it } from "vitest";
import {
	assertFreshFundsAmount,
	assertFreshFundsAmountWithFee,
	FundsExecutionError,
} from "@/domain/trade/funds-execution-guard";

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

	it("requires the current balance to cover the amount and the activation fee", () => {
		const input = { amount: "2", fee: "1", available: "3", receivedAt: 1_000, now: 1_001 };
		expect(() => assertFreshFundsAmountWithFee(input)).not.toThrow();
		expectFundsExecutionError(
			() => assertFreshFundsAmountWithFee({ ...input, available: "2.999999" }),
			"balance-changed",
		);
		expect(() => assertFreshFundsAmountWithFee({ ...input, fee: "0", available: "2" })).not.toThrow();
	});

	it.each(["-1", "invalid", "", null, undefined])("fails closed on an invalid activation fee %s", (fee) => {
		expectFundsExecutionError(
			() => assertFreshFundsAmountWithFee({ amount: "2", fee, available: "3", receivedAt: 1_000, now: 1_001 }),
			"balance-unavailable",
		);
	});

	it("does not let a positive fee authorize a zero amount or an expired balance", () => {
		const input = { amount: "0", fee: "1", available: "3", receivedAt: 1_000, now: 1_001 };
		expectFundsExecutionError(() => assertFreshFundsAmountWithFee(input), "balance-changed");
		expectFundsExecutionError(
			() => assertFreshFundsAmountWithFee({ ...input, amount: "2", now: 61_001 }),
			"balance-unavailable",
		);
	});

	it("adds the fee without losing decimal precision", () => {
		expectFundsExecutionError(
			() =>
				assertFreshFundsAmountWithFee({
					amount: "9007199254740992.000000000000000001",
					fee: "0.000000000000000002",
					available: "9007199254740992.000000000000000002",
					receivedAt: 1_000,
					now: 1_001,
				}),
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
