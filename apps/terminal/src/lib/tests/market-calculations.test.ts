import { describe, expect, it } from "vitest";
import {
	get24hChange,
	get24hPriceChange,
	getEightHourFundingRate,
	getFundingPeriodRates,
	getMarketCapUsd,
	getOiUsd,
} from "@/domain/market";
import { toBig } from "@/lib/trade/numbers";

describe("market calculations", () => {
	it("returns 24h change in percentage points", () => {
		expect(get24hChange(100, 110)).toBeCloseTo(10);
		expect(get24hChange("100", "90")).toBeCloseTo(-10);
	});

	it("converts back to decimal ratio by dividing by 100", () => {
		const changePct = get24hChange("100", "110");
		expect(changePct !== null ? changePct / 100 : null).toBeCloseTo(0.1);
	});

	it("handles zero edge cases safely", () => {
		expect(get24hChange(0, 100)).toBeNull();
		expect(get24hChange("0", "100")).toBeNull();
		expect(get24hChange(100, 0)).toBeCloseTo(-100);
	});

	it("calculates the absolute 24h price change", () => {
		expect(get24hPriceChange("64150.0", "63291.0")).toBeCloseTo(-859);
		expect(get24hPriceChange(null, "63291.0")).toBeNull();
	});

	it("converts the hourly funding rate to an 8h rate", () => {
		expect(getEightHourFundingRate("0.0000125")).toBeCloseTo(0.0001, 7);
		expect(getEightHourFundingRate(null)).toBeNull();
	});

	it("projects funding periods with decimal arithmetic", () => {
		const positive = getFundingPeriodRates("0.000000000000000001");
		const negative = getFundingPeriodRates("-0.000000000000000001");

		expect(toBig(positive?.sevenDays)?.eq("0.000000000000000168")).toBe(true);
		expect(toBig(positive?.thirtyDays)?.eq("0.00000000000000072")).toBe(true);
		expect(toBig(positive?.oneYear)?.eq("0.00000000000000876")).toBe(true);
		expect(toBig(negative?.sevenDays)?.eq("-0.000000000000000168")).toBe(true);
		expect(getFundingPeriodRates("0")).toEqual({ sevenDays: "0", thirtyDays: "0", oneYear: "0" });
		expect(getFundingPeriodRates(null)).toBeNull();
	});

	it("calculates open interest USD", () => {
		expect(getOiUsd(2, 100)).toBeCloseTo(200);
		expect(getOiUsd("2.5", "100")).toBeCloseTo(250);
		expect(getOiUsd(null, 100)).toBeNull();
	});

	it("calculates spot market cap without losing API string precision", () => {
		expect(getMarketCapUsd("299600000", "59.701")).toBe("17886419600");
		expect(getMarketCapUsd(undefined, "59.701")).toBeNull();
	});
});
