import { describe, expect, it } from "vitest";
import { formatSliderPercent, getSizeInputMaxDecimals } from "@/domain/trade/order/size";

describe("order size input precision", () => {
	it("uses quote precision for USD mode regardless of lot size", () => {
		expect(getSizeInputMaxDecimals("quote", 0)).toBe(2);
		expect(getSizeInputMaxDecimals("quote", 5)).toBe(2);
	});

	it("uses market lot precision for base mode", () => {
		expect(getSizeInputMaxDecimals("base", 0)).toBe(0);
		expect(getSizeInputMaxDecimals("base", 5)).toBe(5);
	});
});

describe("slider percent formatting", () => {
	it("keeps whole percentages free of decimals", () => {
		expect(formatSliderPercent(25)).toBe("25");
		expect(formatSliderPercent(100)).toBe("100");
	});

	it("renders at most one decimal and trims a trailing zero", () => {
		expect(formatSliderPercent(37.5)).toBe("37.5");
		expect(formatSliderPercent(49.94)).toBe("49.9");
		expect(formatSliderPercent(12.04)).toBe("12");
	});

	it("collapses empty and non-finite values to zero", () => {
		expect(formatSliderPercent(0)).toBe("0");
		expect(formatSliderPercent(-5)).toBe("0");
		expect(formatSliderPercent(Number.NaN)).toBe("0");
	});
});
