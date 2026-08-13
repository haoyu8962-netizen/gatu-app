import { describe, expect, it } from "vitest";
import {
	atomicToDecimal,
	compareFundsAmounts,
	floorDecimalToAtomic,
	scaleFundsAmount,
} from "@/components/funds-action/funds-amount";

describe("funds amount", () => {
	it("scales exact USDC and HYPE decimals", () => {
		expect(scaleFundsAmount("12.345678", 6)).toMatchObject({
			valid: true,
			atomicAmount: "12345678",
			atomicNumber: 12345678,
		});
		expect(scaleFundsAmount("1.00000001", 8)).toMatchObject({
			valid: true,
			atomicAmount: "100000001",
		});
	});

	it("rejects malformed, non-positive, over-precision, and unsafe amounts", () => {
		expect(scaleFundsAmount("", 6)).toEqual({ valid: false, error: "required" });
		expect(scaleFundsAmount("1e2", 6)).toEqual({ valid: false, error: "invalid" });
		expect(scaleFundsAmount("0", 6)).toEqual({ valid: false, error: "nonPositive" });
		expect(scaleFundsAmount("0.0000001", 6)).toEqual({ valid: false, error: "precision" });
		expect(scaleFundsAmount("9007199254.740992", 6)).toEqual({ valid: false, error: "unsafe" });
	});

	it("compares decimal strings without number coercion", () => {
		expect(compareFundsAmounts("9007199254740993", "9007199254740992")).toBe(1);
		expect(compareFundsAmounts("invalid", "1")).toBeNull();
	});

	it("conservatively floors a number-backed ceiling and converts atomic strings", () => {
		expect(floorDecimalToAtomic(1.23456789, 6)).toBe("1234567");
		expect(floorDecimalToAtomic(Number.NaN, 6)).toBeNull();
		expect(atomicToDecimal("1234567", 6)).toBe("1.234567");
		expect(atomicToDecimal("-1", 6)).toBeNull();
	});
});
