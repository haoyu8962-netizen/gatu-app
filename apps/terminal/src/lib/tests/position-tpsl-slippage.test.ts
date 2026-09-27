import type { MaxMarketOrderNtlsResponse } from "@nktkas/hyperliquid";
import { describe, expect, it } from "vitest";
import { getMaxMarketOrderNotional, shouldWarnPositionTpSlSlippage } from "@/domain/trade/position-tpsl-slippage";

const MAINNET_TIERS: MaxMarketOrderNtlsResponse = [
	[25, "30000000.0"],
	[20, "5000000.0"],
	[10, "2000000.0"],
	[1, "500000.0"],
];

function warns(positionValue: string, positionLeverage: number, tiers: unknown = MAINNET_TIERS): boolean {
	return shouldWarnPositionTpSlSlippage({ tiers, positionLeverage, positionValue });
}

describe("getMaxMarketOrderNotional", () => {
	it.each([
		[40, "30000000"],
		[25, "30000000"],
		[24, "5000000"],
		[20, "5000000"],
		[19, "2000000"],
		[10, "2000000"],
		[9, "500000"],
		[1, "500000"],
	])("selects the highest tier at or below %sx leverage", (leverage, expected) => {
		expect(getMaxMarketOrderNotional(MAINNET_TIERS, leverage)?.toString()).toBe(expected);
	});

	it("does not depend on the response order", () => {
		const shuffled: MaxMarketOrderNtlsResponse = [
			[10, "2000000.0"],
			[1, "500000.0"],
			[25, "30000000.0"],
			[20, "5000000.0"],
		];
		for (const leverage of [1, 9, 10, 19, 20, 24, 25, 40]) {
			expect(getMaxMarketOrderNotional(shuffled, leverage)?.toString()).toBe(
				getMaxMarketOrderNotional(MAINNET_TIERS, leverage)?.toString(),
			);
		}
	});

	it.each([
		["a leverage below every tier", MAINNET_TIERS, 0.5],
		["a NaN leverage", MAINNET_TIERS, Number.NaN],
		["an infinite leverage", MAINNET_TIERS, Number.POSITIVE_INFINITY],
		["an empty table", [], 20],
		["a missing table", undefined, 20],
	])("returns no limit for %s", (_label, tiers, leverage) => {
		expect(getMaxMarketOrderNotional(tiers, leverage)).toBeNull();
	});
});

describe("shouldWarnPositionTpSlSlippage", () => {
	it("compares the whole position value strictly above the selected limit", () => {
		expect(warns("5000000", 20)).toBe(false);
		expect(warns("5000000.0", 20)).toBe(false);
		expect(warns("5000000.000001", 20)).toBe(true);
		expect(warns("4999999.99", 20)).toBe(false);
		expect(warns("6000000", 20)).toBe(true);
	});

	it("keeps decimal-string precision beyond floating point", () => {
		expect(warns("5000000.0000000001", 20)).toBe(true);
		expect(Number("5000000.0000000001") > 5_000_000).toBe(false);
	});

	it("uses the position's current leverage rather than the asset maximum", () => {
		expect(warns("3000000", 10)).toBe(true);
		expect(warns("3000000", 20)).toBe(false);
		expect(warns("600000", 9)).toBe(true);
		expect(warns("600000", 10)).toBe(false);
	});

	it.each(["", "abc", "0", "-7000000", "NaN"])("does not warn for the position value %j", (positionValue) => {
		expect(warns(positionValue, 20)).toBe(false);
	});

	it("does not warn without a usable table or qualifying tier", () => {
		expect(shouldWarnPositionTpSlSlippage({ tiers: undefined, positionLeverage: 20, positionValue: "600000000" })).toBe(
			false,
		);
		expect(warns("600000000", 20, null)).toBe(false);
		expect(warns("600000000", 20, [])).toBe(false);
		expect(warns("600000000", 0.5)).toBe(false);
		expect(warns("600000000", Number.NaN)).toBe(false);
	});

	it.each([
		["a string leverage", [["20", "5000000.0"]]],
		["a zero leverage", [[0, "5000000.0"]]],
		["a negative leverage", [[-20, "5000000.0"]]],
		["an exponent notional", [[20, "1e7"]]],
		["a negative notional", [[20, "-5"]]],
		["a non-numeric notional", [[20, "abc"]]],
		["a zero notional", [[20, "0.0"]]],
		["a numeric notional", [[20, 5000000]]],
		["a short tuple", [[20]]],
		["an over-long tuple", [[20, "5000000.0", "extra"]]],
		["an object entry", [{ maxLeverage: 20, maxMarketOrderNtl: "5000000.0" }]],
	])("rejects the whole table when one entry has %s", (_label, badEntries) => {
		const tiers = [...MAINNET_TIERS, ...badEntries];
		expect(getMaxMarketOrderNotional(tiers, 25)).toBeNull();
		expect(warns("600000000", 25, tiers)).toBe(false);
	});

	it("does not warn from an over-long tuple that would otherwise select the tier", () => {
		expect(warns("6000000", 20, [[20, "5000000.0"]])).toBe(true);
		expect(warns("6000000", 20, [[20, "5000000.0", "extra"]])).toBe(false);
	});

	it.each([
		["an object", { 20: "5000000.0" }],
		["a string", '[[20,"5000000.0"]]'],
		["a number", 5000000],
	])("rejects a non-array response: %s", (_label, tiers) => {
		expect(warns("600000000", 20, tiers)).toBe(false);
	});
});
