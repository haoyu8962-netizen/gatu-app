import { describe, expect, it } from "vitest";
import { getSizeInputMaxDecimals } from "@/domain/trade/order/size";

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
