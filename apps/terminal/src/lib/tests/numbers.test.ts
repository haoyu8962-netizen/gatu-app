import Big from "big.js";
import { describe, expect, it } from "vitest";
import {
	clampInt,
	floorToDecimals,
	floorToString,
	formatDecimalFloor,
	formatPriceAtDisplayDecimals,
	getPriceDisplayDecimals,
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

	it("pads a floored amount to the minimum decimals without dropping exact digits", () => {
		expect(formatDecimalFloor("12.5", 6, 2)).toBe("12.50");
		expect(formatDecimalFloor("12", 6, 2)).toBe("12.00");
		expect(formatDecimalFloor("12.345678", 6, 2)).toBe("12.345678");
		expect(formatDecimalFloor("12.509", 2, 2)).toBe("12.50");
		expect(formatDecimalFloor("101.5", 0, 2)).toBe("101");
		expect(formatDecimalFloor("0.001", 2, 2)).toBe("0");
		expect(formatDecimalFloor("0", 6, 2)).toBe("0");
	});

	it.each([
		[85.81, 4, 3],
		[-85.81, 4, 3],
		[88_140.5, 2, 0],
		[123_456, 0, 0],
		[0.12345678, 8, 5],
		[0.00001234, 6, 6],
		[0, 4, 4],
		[Number.NaN, 4, 4],
	])("shows %s with the official price decimals under a cap of %s: %s", (price, maxDecimals, expected) => {
		expect(getPriceDisplayDecimals(price, maxDecimals)).toBe(expected);
	});

	it.each([
		["85.8099", 4, "85.810"],
		["28243.1715", 2, "28243"],
		["99.9996", 4, "100.00"],
		["0.0012345", 6, "0.001235"],
		["9007199254740993.4", 2, "9007199254740993"],
	] as const)("writes %s at the official price decimals under a cap of %s: %s", (price, maxDecimals, expected) => {
		expect(formatPriceAtDisplayDecimals(Big(price), maxDecimals)).toBe(expected);
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
