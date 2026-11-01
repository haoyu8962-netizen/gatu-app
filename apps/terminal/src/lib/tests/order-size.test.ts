import Big from "big.js";
import { describe, expect, it } from "vitest";
import {
	exceedsPerpEntryMaxSize,
	formatSliderPercent,
	getPerpEntryMaxSize,
	getRestingMarginPrice,
	getSizeForPercent,
	getSizeInputMaxDecimals,
	getSizeValueForModeToggle,
	getSizeValueFromInput,
	getSliderValue,
} from "@/domain/trade/order/size";

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

	it("rounds the effective percentage to a bounded integer", () => {
		expect(formatSliderPercent(37.5)).toBe("38");
		expect(formatSliderPercent(49.94)).toBe("50");
		expect(formatSliderPercent(12.04)).toBe("12");
		expect(formatSliderPercent(99.9999)).toBe("100");
		expect(formatSliderPercent(150)).toBe("100");
	});

	it("collapses empty and non-finite values to zero", () => {
		expect(formatSliderPercent(0)).toBe("0");
		expect(formatSliderPercent(-5)).toBe("0");
		expect(formatSliderPercent(Number.NaN)).toBe("0");
	});
});

describe("percentage sizing", () => {
	it.each([
		["spot buy", true, "buy"],
		["spot sell", true, "sell"],
		["perpetual buy", false, "buy"],
		["perpetual sell", false, "sell"],
	] as const)("keeps a 100%% quote amount within the %s maximum", (_name, isSpotMarket, side) => {
		const input = percentInput({ isSpotMarket, side });
		const sizeInput = getSizeForPercent(input);
		const sizeValue = getSizeValueFromInput({ ...input, sizeInput });

		expect(sizeInput).toBe("35.00");
		expect(sizeValue).toBe(1000);
		expect(sizeValue).toBeLessThanOrEqual(input.maxSize);
	});

	it.each([
		[1, "0", "0"],
		[35, "0.24", "35"],
		[63, "0.43", "62"],
		[100, "0.69", "100"],
	])("maps the official %i%% base example to the quantized size and effective percentage", (pct, size, percent) => {
		const maxSize = 0.6900001;
		const result = getSizeForPercent(percentInput({ pct: Number(pct), maxSize, sizeMode: "base" }));

		expect(result).toBe(size);
		expect(formatSliderPercent(getSliderValue(Number(result), maxSize))).toBe(percent);
	});

	it.each([
		[63, "36.64"],
		[100, "58.16"],
	])("matches the official %i%% quote example", (pct, expected) => {
		expect(getSizeForPercent(percentInput({ pct: Number(pct), maxSize: 0.6900001, price: 84.292 }))).toBe(expected);
	});

	it("keeps a coarse lot at zero until the request reaches its first executable quantity", () => {
		const input = percentInput({ maxSize: 0.012, sizeMode: "base", szDecimals: 3 });

		expect(getSizeForPercent({ ...input, pct: 8 })).toBe("0");
		expect(getSizeForPercent({ ...input, pct: 9 })).toBe("0.001");
		expect(getSizeForPercent({ ...input, pct: 100 })).toBe("0.012");
	});

	it("rounds decimal arithmetic before converting a base quantity to a number", () => {
		expect(
			getSizeForPercent(percentInput({ maxSize: 123456789.99999999, pct: 10, sizeMode: "base", szDecimals: 6 })),
		).toBe("12345678.999999");
		expect(
			getSizeValueFromInput({ sizeInput: "123456789.99999999", sizeMode: "quote", price: 10, szDecimals: 6 }),
		).toBe(12345678.999999);
	});
});

describe("size unit conversion", () => {
	it("does not increase a base quantity when switching to quote and back", () => {
		const input = { sizeValue: 1000.23, sizeMode: "base" as const, price: 0.035, szDecimals: 2 };
		const quoteInput = getSizeValueForModeToggle(input);
		const convertedSize = getSizeValueFromInput({ ...input, sizeInput: quoteInput, sizeMode: "quote" });

		expect(quoteInput).toBe("35.00");
		expect(convertedSize).toBeLessThanOrEqual(input.sizeValue);
		expect(getSizeValueForModeToggle({ ...input, sizeValue: convertedSize, sizeMode: "quote" })).toBe("1000");
	});
});

function percentInput(
	overrides: Partial<Parameters<typeof getSizeForPercent>[0]> = {},
): Parameters<typeof getSizeForPercent>[0] {
	return {
		pct: 100,
		isSpotMarket: false,
		side: "buy",
		sizeMode: "quote",
		price: 0.035,
		maxSize: 1000.23,
		spotBalance: { baseAvailable: 1000.23, quoteAvailable: 35.01, baseName: "TOKEN", quoteName: "USDC" },
		szDecimals: 2,
		...overrides,
	};
}

describe("perp maximum for a resting order (official terminal margin price)", () => {
	const limitNotional = (price: string) => (size: string) => Big(size).times(price).toNumber();

	it("raises the maximum of a buy below mark and lowers that of a sell above mark", () => {
		expect(getRestingMarginPrice("buy", Big(100), Big(80)).toString()).toBe("80");
		expect(getRestingMarginPrice("buy", Big(100), Big(120)).toString()).toBe("100");
		expect(getRestingMarginPrice("sell", Big(100), Big(125)).toString()).toBe("125");
		expect(getRestingMarginPrice("sell", Big(100), Big(90)).toString()).toBe("100");

		expect(
			getPerpEntryMaxSize({ maxTradeSize: 10, markPx: 100, szDecimals: 2, marginNotionalForSize: limitNotional("80") }),
		).toBe(12.5);
		expect(
			getPerpEntryMaxSize({
				maxTradeSize: 10,
				markPx: 100,
				szDecimals: 2,
				marginNotionalForSize: limitNotional("125"),
			}),
		).toBe(8);
		expect(getPerpEntryMaxSize({ maxTradeSize: 10, markPx: 100, szDecimals: 2 })).toBe(10);
	});

	it("flags a size by the margin it reserves, not by the size at mark", () => {
		const input = { maxTradeSize: 10, markPx: 100, szDecimals: 2, marginNotionalForSize: limitNotional("80") };
		expect(exceedsPerpEntryMaxSize({ ...input, size: "12.5" })).toBe(false);
		expect(exceedsPerpEntryMaxSize({ ...input, size: "12.51" })).toBe(true);
		expect(exceedsPerpEntryMaxSize({ maxTradeSize: 10, markPx: 100, szDecimals: 2, size: "10.01" })).toBe(true);
		expect(exceedsPerpEntryMaxSize({ maxTradeSize: 0, markPx: 100, szDecimals: 2, size: "1" })).toBe(true);
		expect(exceedsPerpEntryMaxSize({ maxTradeSize: undefined, markPx: 100, szDecimals: 2, size: "1" })).toBe(true);
		expect(exceedsPerpEntryMaxSize({ maxTradeSize: 0, markPx: 100, szDecimals: 2, size: "0" })).toBe(false);
	});

	it("finds a maximum below one exchange lot of the raw maximum when the margin price is far below mark", () => {
		const input = { maxTradeSize: 0.5, markPx: 100, szDecimals: 0, marginNotionalForSize: limitNotional("20") };
		expect(getPerpEntryMaxSize(input)).toBe(2);
		expect(exceedsPerpEntryMaxSize({ ...input, size: "2" })).toBe(false);
		expect(exceedsPerpEntryMaxSize({ ...input, size: "3" })).toBe(true);
	});

	it("lowers a scale order's maximum lot by lot until its actual levels fit", () => {
		const uneven = (size: string) =>
			Big(size)
				.times(90)
				.plus(Big(size).gt(5.3) ? 30 : 0)
				.toNumber();
		const max = getPerpEntryMaxSize({ maxTradeSize: 5, markPx: 100, szDecimals: 1, marginNotionalForSize: uneven });
		expect(
			exceedsPerpEntryMaxSize({
				maxTradeSize: 5,
				markPx: 100,
				szDecimals: 1,
				marginNotionalForSize: uneven,
				size: String(max),
			}),
		).toBe(false);
		expect(max).toBe(5.3);
	});
});
