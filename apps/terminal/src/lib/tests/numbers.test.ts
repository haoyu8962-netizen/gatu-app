import { describe, expect, it } from "vitest";
import {
	clampInt,
	floorToDecimals,
	floorToString,
	formatDecimalFloor,
	toNumber,
	toNumberOrZero,
} from "@/lib/trade/numbers";

describe("trade numbers", () => {
	it("parses numbers from strings and returns null for invalid input", () => {
		expect(toNumber(1.5)).toBe(1.5);
		expect(toNumber("2.5")).toBe(2.5);
		expect(toNumber("nope")).toBeNull();
		expect(toNumber(null)).toBeNull();
		expect(toNumber(Number.POSITIVE_INFINITY)).toBeNull();
		expect(toNumber(Number.NaN)).toBeNull();
		expect(toNumber("  ")).toBeNull();
	});

	it("parses numbers with zero fallback", () => {
		expect(toNumberOrZero("2.5")).toBe(2.5);
		expect(toNumberOrZero("nope")).toBe(0);
		expect(toNumberOrZero(null)).toBe(0);
		expect(toNumberOrZero(undefined)).toBe(0);
	});

	it("clamps integers to bounds", () => {
		expect(clampInt(3.6, 1, 5)).toBe(4);
		expect(clampInt(-10, 1, 5)).toBe(1);
		expect(clampInt(10, 1, 5)).toBe(5);
	});

	it("floors decimals correctly", () => {
		expect(floorToDecimals(1.239, 2)).toBe(1.23);
		expect(formatDecimalFloor(1.239, 2)).toBe("1.23");
	});

	it.each([
		["9007199254740993.129999", 2, "9007199254740993.12"],
		["999999999999.999999", 2, "999999999999.99"],
		["0.123456789123456789", 18, "0.123456789123456789"],
		["-1.239", 2, "-1.23"],
		["-0.001", 2, "0.00"],
		["1.2", 2, "1.20"],
		["0", 2, "0.00"],
	] as const)("truncates %s directly as a decimal string", (value, decimals, expected) => {
		expect(floorToString(value, decimals)).toBe(expected);
	});

	it("keeps invalid decimal placeholders and trimmed formatting compatible", () => {
		expect(floorToString("invalid", 2)).toBe("0");
		expect(floorToString(null, 2)).toBe("0");
		expect(formatDecimalFloor("9007199254740993.1200", 4)).toBe("9007199254740993.12");
	});
});
