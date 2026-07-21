import Big from "big.js";
import { describe, expect, it, vi } from "vitest";
import {
	createScaleOrderLevelPlan,
	formatPriceForOrder,
	formatSizeForOrder,
	getDefaultLeverage,
} from "@/domain/trade/orders";

vi.mock("@lingui/core/macro", () => ({
	msg: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
		if (typeof strings === "string") return strings;
		return strings.reduce((message, part, index) => `${message}${part}${values[index] ?? ""}`, "");
	},
	t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
		if (typeof strings === "string") return strings;
		return strings.reduce((message, part, index) => `${message}${part}${values[index] ?? ""}`, "");
	},
}));

describe("orders", () => {
	it("chooses smart leverage defaults", () => {
		expect(getDefaultLeverage(5)).toBe(5);
		expect(getDefaultLeverage(6)).toBe(3);
		expect(getDefaultLeverage(50)).toBe(25);
	});

	it("formats order prices with 5 significant figures", () => {
		expect(formatPriceForOrder(100)).toBe("100");
		expect(formatPriceForOrder(1234.56)).toBe("1234.6");
		expect(formatPriceForOrder(0.012345)).toBe("0.012345");
	});

	it("formats prices precisely without float rounding error", () => {
		// half-up at the 5th significant figure: the old float impl rounded down to "1.2345"
		expect(formatPriceForOrder(1.23455)).toBe("1.2346");
		// exact powers of 10 (Math.log10(1000) is 2.999… in JS)
		expect(formatPriceForOrder(1000)).toBe("1000");
		expect(formatPriceForOrder(10000)).toBe("10000");
		// accepts strings/Big directly, no .toNumber() precision loss
		expect(formatPriceForOrder("1234.56")).toBe("1234.6");
		// sub-1 keeps 5 sig figs, capped at HL max decimals
		expect(formatPriceForOrder(0.00012345)).toBe("0.00012345");
		// integer prices are allowed beyond 5 sig figs
		expect(formatPriceForOrder(123456)).toBe("123456");
		// non-positive / invalid → "0"
		expect(formatPriceForOrder(0)).toBe("0");
		expect(formatPriceForOrder(null)).toBe("0");
	});

	it("applies market-specific price decimal caps", () => {
		expect(formatPriceForOrder("0.012345", { assetId: 0, szDecimals: 1 })).toBe("0.01235");
		expect(formatPriceForOrder("0.012345", { assetId: 10000, szDecimals: 1 })).toBe("0.012345");
		expect(formatPriceForOrder("0.00012345", { assetId: 0, szDecimals: 0 })).toBe("0.000123");
		expect(formatPriceForOrder("0.00012345", { assetId: 10000, szDecimals: 0 })).toBe("0.00012345");
		expect(formatPriceForOrder(123456, { assetId: 0, szDecimals: 5 })).toBe("123456");
	});

	it("formats order sizes using size decimals", () => {
		expect(formatSizeForOrder(1.234567, 3)).toBe("1.234");
		expect(formatSizeForOrder(1.2, 0)).toBe("1");
	});

	it("keeps integer trailing zeros when size decimals are zero", () => {
		expect(formatSizeForOrder(100, 0)).toBe("100");
		expect(formatSizeForOrder(1000000, 0)).toBe("1000000");
		expect(formatSizeForOrder(10, 0)).toBe("10");
		expect(formatSizeForOrder(0, 0)).toBe("0");
		expect(formatSizeForOrder(100, 2)).toBe("100");
		expect(formatSizeForOrder(1.2, 2)).toBe("1.2");
	});
});

describe("scale order planning", () => {
	it("distributes size units without dropping the remainder", () => {
		const plan = createScaleOrderLevelPlan({
			assetId: 0,
			sizeValue: 7,
			szDecimals: 0,
			scaleStartPriceInput: "10",
			scaleEndPriceInput: "30",
			scaleLevelsNum: 4,
		});

		expect(plan.issues).toEqual([]);
		expect(plan.levels.map((level) => level.size)).toEqual(["2", "2", "2", "1"]);
		expect(plan.levels.reduce((total, level) => total.plus(level.size), Big(0)).toString()).toBe("7");
	});

	it("rejects a size that cannot allocate one lot to every level", () => {
		const plan = createScaleOrderLevelPlan({
			assetId: 0,
			sizeValue: 3,
			szDecimals: 0,
			scaleStartPriceInput: "10",
			scaleEndPriceInput: "30",
			scaleLevelsNum: 4,
		});

		expect(plan.issues).toContain("insufficient-size");
		expect(plan.levels).toEqual([]);
	});

	it("checks minimum notional on every formatted level", () => {
		const plan = createScaleOrderLevelPlan({
			assetId: 0,
			sizeValue: 2,
			szDecimals: 1,
			scaleStartPriceInput: "10",
			scaleEndPriceInput: "30",
			scaleLevelsNum: 4,
		});

		expect(plan.issues).toContain("min-notional");
		expect(plan.levels[0]?.notional).toBe("5");
	});

	it("rejects distinct inputs that collapse to the same protocol tick", () => {
		const plan = createScaleOrderLevelPlan({
			assetId: 0,
			sizeValue: 4,
			szDecimals: 0,
			scaleStartPriceInput: "100.001",
			scaleEndPriceInput: "100.004",
			scaleLevelsNum: 4,
		});

		expect(plan.issues).toContain("duplicate-price");
	});

	it("rejects out-of-range levels instead of clamping them", () => {
		const plan = createScaleOrderLevelPlan({
			assetId: 0,
			sizeValue: 100,
			szDecimals: 0,
			scaleStartPriceInput: "10",
			scaleEndPriceInput: "30",
			scaleLevelsNum: 21,
		});

		expect(plan).toEqual({ levels: [], issues: ["invalid-levels"] });
	});
});
