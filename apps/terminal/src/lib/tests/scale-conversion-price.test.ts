import Big from "big.js";
import { describe, expect, it } from "vitest";
import { deriveOrderEntry } from "@/domain/trade/order/derive";
import { getOrderEntryLimitPx, getOrderEntryValueForSize } from "@/domain/trade/order/entry-limit-price";
import { capSizeToQuoteAmount, getOrderValue, getSizeStringFromInput } from "@/domain/trade/order/size";
import { createScaleOrderLevelPlan, getScaleAveragePrice, getScaleOrderNotional } from "@/domain/trade/orders";

const scale = {
	assetId: 0,
	szDecimals: 2,
	scaleStartPriceInput: "80",
	scaleEndPriceInput: "60",
	scaleLevelsNum: 4,
	scaleSkew: "1",
};

describe("scale order conversion price", () => {
	it("is the size-weighted average of the tick-rounded level prices", () => {
		expect(getScaleAveragePrice(scale)).toBe(70);
		expect(getScaleAveragePrice({ ...scale, scaleSkew: "3" })).toBeCloseTo(
			(80 * 3 + 73.333 * 5 + 66.667 * 7 + 60 * 9) / 24,
			10,
		);
	});

	it("is unavailable until the range, levels and skew are valid", () => {
		expect(getScaleAveragePrice({ ...scale, scaleEndPriceInput: "" })).toBeNull();
		expect(getScaleAveragePrice({ ...scale, scaleEndPriceInput: "80" })).toBeNull();
		expect(getScaleAveragePrice({ ...scale, scaleLevelsNum: 1 })).toBeNull();
		expect(getScaleAveragePrice({ ...scale, scaleSkew: "0" })).toBeNull();
	});

	it("sizes a quote amount so the scale orders add up to it, not to its value at the mark price", () => {
		const averagePrice = getScaleAveragePrice(scale) ?? 0;
		const sizeAtAverage = getSizeStringFromInput({
			sizeInput: "1000",
			sizeMode: "quote",
			price: averagePrice,
			szDecimals: 2,
		});
		const plan = createScaleOrderLevelPlan({ ...scale, sizeValue: sizeAtAverage });
		const notional = plan.levels.reduce((sum, level) => sum.plus(level.notional), Big(0));

		expect(plan.issues).toEqual([]);
		expect(notional.gt(999)).toBe(true);
		expect(notional.lte(1000)).toBe(true);
		expect(getOrderValue(Number(sizeAtAverage), averagePrice)).toBeCloseTo(notional.toNumber(), 6);

		const sizeAtMark = getSizeStringFromInput({ sizeInput: "1000", sizeMode: "quote", price: 100, szDecimals: 2 });
		const markPlan = createScaleOrderLevelPlan({ ...scale, sizeValue: sizeAtMark });
		expect(markPlan.levels.reduce((sum, level) => sum.plus(level.notional), Big(0)).toNumber()).toBeCloseTo(700, 0);
	});

	it("is the entry conversion price for scale orders, the limit price for limit orders and the mark otherwise", () => {
		const input = {
			orderType: "scale" as const,
			assetId: 0,
			szDecimals: 2,
			limitPriceInput: "95",
			scaleStartPriceInput: "80",
			scaleEndPriceInput: "60",
			scaleLevelsNum: 4,
			scaleSkewInput: "1",
		};

		expect(getOrderEntryLimitPx(input)).toBe(70);
		expect(getOrderEntryLimitPx({ ...input, scaleEndPriceInput: "" })).toBeUndefined();
		expect(getOrderEntryLimitPx({ ...input, assetId: null })).toBeUndefined();
		expect(getOrderEntryLimitPx({ ...input, orderType: "limit" })).toBe(95);
		expect(getOrderEntryLimitPx({ ...input, orderType: "stopLimit" })).toBe(95);
		expect(getOrderEntryLimitPx({ ...input, orderType: "market" })).toBeUndefined();
		expect(getOrderEntryLimitPx({ ...input, orderType: "twap" })).toBeUndefined();
	});

	it("lowers a size typed as an amount by whole lots until its levels cost no more than the amount", () => {
		const costs: Record<string, number> = { "3.0": 220, "2.9": 199, "2.8": 175, "2.7": 170 };
		const valueForSize = (size: string) => costs[size];

		expect(capSizeToQuoteAmount("3", "180", 1, valueForSize)).toBe("2.8");
		expect(capSizeToQuoteAmount("3", "220", 1, valueForSize)).toBe("3");
		expect(capSizeToQuoteAmount("3", "180", 1, () => undefined)).toBe("3");
		expect(capSizeToQuoteAmount("3", "180", 1, (size) => (size === "3.0" ? 220 : undefined))).toBe("3");
		expect(capSizeToQuoteAmount("3", "1", 0, () => 220)).toBe("3");
		expect(capSizeToQuoteAmount("0", "180", 1, valueForSize)).toBe("0");
		expect(capSizeToQuoteAmount("300", "100", 0, (size) => Number(size))).toBe("100");
		expect(capSizeToQuoteAmount("301", "100", 0, (size) => Number(size))).toBe("301");
	});

	it("values a scale order at its lot-rounded levels, which can differ from size × average price", () => {
		const coarse = {
			assetId: 0,
			szDecimals: 0,
			scaleStartPriceInput: "100",
			scaleEndPriceInput: "20",
			scaleLevelsNum: 2,
			scaleSkew: "1",
		};
		const input = {
			orderType: "scale" as const,
			assetId: 0,
			szDecimals: 0,
			limitPriceInput: "",
			scaleStartPriceInput: "100",
			scaleEndPriceInput: "20",
			scaleLevelsNum: 2,
			scaleSkewInput: "1",
		};

		expect(getScaleAveragePrice(coarse)).toBe(60);
		expect(createScaleOrderLevelPlan({ ...coarse, sizeValue: "3" }).levels.map((level) => level.size)).toEqual([
			"2",
			"1",
		]);
		expect(getScaleOrderNotional({ ...coarse, sizeValue: "3" })?.toString()).toBe("220");
		expect(getScaleOrderNotional({ ...coarse, scaleLevelsNum: 1, sizeValue: "3" })).toBeNull();
		expect(
			createScaleOrderLevelPlan({ ...coarse, scaleSkew: "3", sizeValue: "4" }).levels.map((level) => level.size),
		).toEqual(["1", "3"]);
		expect(getScaleOrderNotional({ ...coarse, scaleSkew: "3", sizeValue: "4" })?.toString()).toBe("160");
		expect(getOrderEntryValueForSize({ ...input, scaleSkewInput: "3" }, "4")).toBe(160);
		expect(getOrderEntryValueForSize(input, "3")).toBe(220);
		expect(getOrderEntryValueForSize({ ...input, orderType: "limit" }, "3")).toBeUndefined();
		expect(getOrderEntryValueForSize({ ...input, scaleEndPriceInput: "" }, "3")).toBeUndefined();

		const derived = deriveOrderEntry({
			isConnected: true,
			market: { kind: "perp", name: "COARSE", pairName: "COARSE-USDC", szDecimals: 0 } as never,
			side: "buy",
			conversionPrice: 60,
			orderValueForSize: (size) => getOrderEntryValueForSize(input, size),
			sizeMode: "quote",
			sizeInput: "180",
			spotBalances: [],
			maxTradeSzs: null,
			availableToTrade: null,
			marketOrderSizing: null,
		});
		expect(derived.sizeForOrder).toBe("2");
		expect(derived.orderValue).toBe(120);

		const derivedFor = (overrides: Partial<Parameters<typeof deriveOrderEntry>[0]>) =>
			deriveOrderEntry({
				isConnected: true,
				market: { kind: "perp", name: "COARSE", pairName: "COARSE-USDC", szDecimals: 0 } as never,
				side: "buy",
				conversionPrice: 60,
				orderValueForSize: (size) => getOrderEntryValueForSize(input, size),
				sizeMode: "quote",
				sizeInput: "180",
				spotBalances: [],
				maxTradeSzs: null,
				availableToTrade: null,
				marketOrderSizing: null,
				...overrides,
			});
		expect(derivedFor({ sizeInput: "220" })).toMatchObject({ sizeForOrder: "3", orderValue: 220 });
		expect(derivedFor({ sizeMode: "base", sizeInput: "3" })).toMatchObject({ sizeForOrder: "3", orderValue: 220 });
		expect(
			derivedFor({ sizeMode: "base", sizeInput: "3", orderValueForSize: (size) => Number(size) * 1.4 }).sizeForOrder,
		).toBe("3");
		expect(derivedFor({ selectedBaseSize: "3" })).toMatchObject({ sizeForOrder: "3", orderValue: 220 });
	});
});
