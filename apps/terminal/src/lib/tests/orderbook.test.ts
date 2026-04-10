import { describe, expect, it } from "vitest";
import {
	aggregateLevels,
	getMaxTotal,
	getPriceGroupingKey,
	getPriceGroupingOptions,
	getSpreadInfo,
	getTickSizes,
	processLevels,
} from "@/lib/trade/orderbook";

describe("processLevels", () => {
	it("builds levels and accumulates totals", () => {
		const levels = processLevels([
			{ px: "101", sz: "1", n: 1 },
			{ px: "100", sz: "2", n: 2 },
		]);

		expect(levels).toHaveLength(2);
		expect(levels[0]).toEqual({ price: 101, size: 1, total: 1 });
		expect(levels[1]).toEqual({ price: 100, size: 2, total: 3 });
	});

	it("returns empty array for undefined/empty input", () => {
		expect(processLevels(undefined)).toEqual([]);
		expect(processLevels([])).toEqual([]);
	});
});

describe("getSpreadInfo", () => {
	it("calculates mid, spread, and spreadPct", () => {
		const bids = [{ price: 100, size: 1, total: 1 }];
		const asks = [{ price: 102, size: 1, total: 1 }];
		const info = getSpreadInfo(bids, asks);

		expect(info.mid).toBe(101);
		expect(info.spread).toBe(2);
		expect(info.spreadPct).toBeCloseTo(1.98, 1);
	});

	it("returns undefined values when no bids/asks", () => {
		const info = getSpreadInfo([], []);
		expect(info.mid).toBeUndefined();
		expect(info.spread).toBeUndefined();
		expect(info.spreadPct).toBeUndefined();
	});
});

describe("getTickSizes", () => {
	it("generates tick sizes based on price magnitude", () => {
		const ticks = getTickSizes(95000);
		expect(ticks[0]).toBe(1);
		expect(ticks[1]).toBe(2);
		expect(ticks[2]).toBe(5);
		expect(ticks[3]).toBe(10);
	});

	it("returns empty array for invalid price", () => {
		expect(getTickSizes(undefined)).toEqual([]);
		expect(getTickSizes(0)).toEqual([]);
		expect(getTickSizes(-100)).toEqual([]);
	});
});

describe("aggregateLevels", () => {
	it("aggregates bids by tick size", () => {
		const levels = [
			{ price: 101, size: 1, total: 1 },
			{ price: 100.5, size: 2, total: 3 },
			{ price: 100, size: 3, total: 6 },
		];
		const aggregated = aggregateLevels(levels, 1, "bid");

		expect(aggregated).toHaveLength(2);
		expect(aggregated[0]).toEqual({ price: 101, size: 1, total: 1 });
		expect(aggregated[1]).toEqual({ price: 100, size: 5, total: 6 });
	});

	it("returns original levels when tickSize is 0", () => {
		const levels = [{ price: 100, size: 1, total: 1 }];
		expect(aggregateLevels(levels, 0, "bid")).toEqual(levels);
	});
});

describe("getMaxTotal", () => {
	it("returns max total from bids and asks", () => {
		const bids = [
			{ price: 100, size: 1, total: 1 },
			{ price: 99, size: 2, total: 3 },
		];
		const asks = [
			{ price: 101, size: 1, total: 1 },
			{ price: 102, size: 4, total: 5 },
		];
		expect(getMaxTotal(bids, asks)).toBe(5);
	});

	it("returns 0 for empty arrays", () => {
		expect(getMaxTotal([], [])).toBe(0);
	});
});

describe("getPriceGroupingOptions", () => {
	it("matches Hyperliquid l2Book groupings for four-digit prices", () => {
		const options = getPriceGroupingOptions(2178.8);

		expect(options.map((option) => option.label)).toEqual(["0.1", "0.2", "0.5", "1", "10", "100"]);
		expect(options.map((option) => option.tickSize)).toEqual([0.1, 0.2, 0.5, 1, 10, 100]);
		expect(options.map((option) => option.decimals)).toEqual([1, 1, 1, 0, 0, 0]);
	});

	it("formats low-price groupings without scientific notation", () => {
		const options = getPriceGroupingOptions(0.95);

		expect(options.map((option) => option.label)).toEqual(["0.00001", "0.00002", "0.00005", "0.0001", "0.001", "0.01"]);
	});

	it("keeps the same grouping key while labels retarget to the current market price", () => {
		const btcWide = getPriceGroupingOptions(70910).at(-1);
		const ethWide = getPriceGroupingOptions(2178.8).at(-1);

		expect(btcWide).toBeDefined();
		expect(ethWide).toBeDefined();
		expect(getPriceGroupingKey(btcWide)).toBe(getPriceGroupingKey(ethWide));
		expect(btcWide?.label).toBe("1000");
		expect(ethWide?.label).toBe("100");
	});
});
