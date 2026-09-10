import { describe, expect, it } from "vitest";
import { type BookLevel, processLevels } from "@/lib/trade/orderbook";
import { getOrderbookHoverPriceDecimals, getOrderbookHoverSummary } from "@/lib/trade/orderbook-hover";

function level(overrides: Partial<BookLevel> = {}): BookLevel {
	return { price: "110", size: "3", total: "4", quoteSize: "330", quoteTotal: "430", ...overrides };
}

describe("orderbook cumulative hover summary", () => {
	it("uses the exact cumulative quote sum and a size-weighted average", () => {
		const levels = processLevels([
			{ px: "100", sz: "1" },
			{ px: "110", sz: "3" },
		]);
		expect(getOrderbookHoverSummary(levels[1], "100")).toEqual({
			averagePrice: "107.5",
			distancePercent: "10",
			total: "4",
			quoteTotal: "430",
		});
	});

	it("preserves exact fractional totals and rounds only non-terminating division", () => {
		const levels = processLevels([
			{ px: "0.1", sz: "0.1" },
			{ px: "0.2", sz: "0.2" },
		]);
		expect(getOrderbookHoverSummary(levels[1], "0.16")).toEqual({
			averagePrice: "0.16666666666666666667",
			distancePercent: "25",
			total: "0.3",
			quoteTotal: "0.05",
		});
	});

	it.each(["98", "102"])("reports positive distance on either side of the reference: %s", (price) => {
		const [entry] = processLevels([{ px: price, sz: "2" }]);
		expect(getOrderbookHoverSummary(entry, "100")?.distancePercent).toBe("2");
	});

	it("reports zero distance only for an exact reference match", () => {
		expect(getOrderbookHoverSummary(level(), "110")?.distancePercent).toBe("0");
	});

	it("retains sub-cent distances without binary floating-point drift", () => {
		const [entry] = processLevels([{ px: "1.00000001", sz: "3" }]);
		expect(getOrderbookHoverSummary(entry, "1")).toEqual({
			averagePrice: "1.00000001",
			distancePercent: "0.000001",
			total: "3",
			quoteTotal: "3.00000003",
		});
	});

	it("preserves cumulative quantities beyond safe integer precision", () => {
		const levels = processLevels([
			{ px: "0.5", sz: "9007199254740993.01" },
			{ px: "0.5", sz: "0.01" },
		]);
		expect(getOrderbookHoverSummary(levels[1], "0.5")).toEqual({
			averagePrice: "0.5",
			distancePercent: "0",
			total: "9007199254740993.02",
			quoteTotal: "4503599627370496.51",
		});
	});

	it.each([undefined, "", "invalid", "NaN", "Infinity", "0", "-1"])(
		"keeps cumulative values while an invalid reference %s has no distance",
		(reference) => {
			expect(getOrderbookHoverSummary(level(), reference)).toEqual({
				averagePrice: "107.5",
				distancePercent: undefined,
				total: "4",
				quoteTotal: "430",
			});
		},
	);

	for (const field of ["price", "size", "total", "quoteTotal"] as const) {
		it.each(["", "invalid", "NaN", "Infinity", "0", "-1"])(`rejects invalid ${field} %s`, (value) => {
			expect(getOrderbookHoverSummary(level({ [field]: value }), "100")).toBeUndefined();
		});
	}

	it("does not mutate the processed level while deriving a summary", () => {
		const entry = Object.freeze(level());
		getOrderbookHoverSummary(entry, "100");
		expect(entry).toEqual(level());
	});
});

describe("orderbook hover average price precision", () => {
	it.each([
		["82.72456", 4, 3],
		["1379.123", 3, 1],
		["78393.1", 2, 0],
		["1234567", 4, 0],
		["0.000012345", 6, 6],
		["0.000012345", 8, 8],
		[undefined, 4, 4],
	] as const)("formats %s with cap %s using %s decimals", (price, cap, expected) => {
		expect(getOrderbookHoverPriceDecimals(price, cap)).toBe(expected);
	});
});
