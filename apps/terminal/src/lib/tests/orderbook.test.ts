import { describe, expect, expectTypeOf, it } from "vitest";
import {
	compareOrderbookValues,
	getDepthPercentage,
	getL2BookSubscriptionParams,
	getOrderbookQuoteDecimals,
	getPriceGroupingKey,
	getPriceGroupingOptions,
	getRawSpreadInfo,
	getSideMaxTotal,
	getSnapshotPriceDecimals,
	type L2BookPriceGroupSelection,
	processLevels,
} from "@/lib/trade/orderbook";

describe("processLevels", () => {
	it("preserves source decimals and builds exact base and quote totals", () => {
		const levels = processLevels([
			{ px: "100", sz: "1", n: 1 },
			{ px: "99", sz: "2", n: 2 },
		]);

		expect(levels).toEqual([
			{ price: "100", size: "1", total: "1", quoteSize: "100", quoteTotal: "100" },
			{ price: "99", size: "2", total: "3", quoteSize: "198", quoteTotal: "298" },
		]);
	});

	it("does not round API price and size strings through JavaScript numbers", () => {
		const [level] = processLevels([{ px: "999.9500", sz: "0.100000000000000001", n: 1 }]);

		expect(level).toEqual({
			price: "999.9500",
			size: "0.100000000000000001",
			total: "0.100000000000000001",
			quoteSize: "99.99500000000000099995",
			quoteTotal: "99.99500000000000099995",
		});
	});

	it("returns empty array for undefined/empty input", () => {
		expect(processLevels(undefined)).toEqual([]);
		expect(processLevels([])).toEqual([]);
	});
});

describe("getRawSpreadInfo", () => {
	it("calculates sub-cent spreads from raw price strings without losing precision", () => {
		const info = getRawSpreadInfo([[{ px: "0.0027810", sz: "1", n: 1 }], [{ px: "0.0027880", sz: "1", n: 1 }]]);

		expect(info).not.toBeNull();
		expect(info?.mid).toBe("0.0027845");
		expect(info?.spread).toBe("0.000007");
		expect(Number(info?.spreadPct)).toBeCloseTo(0.2513916322, 8);
	});

	it("rejects crossed or incomplete books", () => {
		expect(getRawSpreadInfo([[], []])).toBeNull();
		expect(getRawSpreadInfo([[{ px: "102", sz: "1", n: 1 }], [{ px: "101", sz: "1", n: 1 }]])).toBeNull();
	});

	it("prefers the event spread and accepts a BBO midpoint for aggregated books", () => {
		const info = getRawSpreadInfo([[{ px: "65245", sz: "1", n: 1 }], [{ px: "65250", sz: "1", n: 1 }]], {
			eventSpread: "1",
			bboMid: "65247.5",
		});

		expect(info).toEqual({ mid: "65247.5", spread: "1", spreadPct: "0.001532625771102341" });
	});
});

describe("order book display derivations", () => {
	it("normalizes depth against each side independently", () => {
		const bids = processLevels([
			{ px: "100", sz: "1", n: 1 },
			{ px: "99", sz: "2", n: 1 },
		]);
		const asks = processLevels([
			{ px: "101", sz: "0.25", n: 1 },
			{ px: "102", sz: "0.75", n: 1 },
		]);

		const bidMax = getSideMaxTotal(bids);
		const askMax = getSideMaxTotal(asks);
		expect(bidMax).toBe("3");
		expect(askMax).toBe("1");
		expect(getDepthPercentage(bids[0].total, bidMax)).toBeCloseTo(100 / 3);
		expect(getDepthPercentage(bids[1].total, bidMax)).toBe(100);
		expect(getDepthPercentage(asks[1].total, askMax)).toBe(100);
	});

	it("keeps non-zero sub-cent quote values visible", () => {
		expect(getOrderbookQuoteDecimals("0")).toBe(2);
		expect(getOrderbookQuoteDecimals("0.0042")).toBe(4);
		expect(getOrderbookQuoteDecimals("0.00000001")).toBe(8);
	});

	it("compares size updates without number precision loss", () => {
		expect(compareOrderbookValues("9007199254740992", "9007199254740993")).toBe(1);
		expect(compareOrderbookValues("1.00", "1")).toBe(0);
		expect(compareOrderbookValues("invalid", "1")).toBeNull();
	});

	it("derives decimals from the snapshot when the reference price crosses a power of ten", () => {
		const levels = [[{ px: "999.95", sz: "1", n: 1 }], [{ px: "1000", sz: "1", n: 1 }]] as const;

		expect(getSnapshotPriceDecimals(levels, 0)).toBe(2);
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

	it("caps and deduplicates groupings at the market price-decimal limit", () => {
		const options = getPriceGroupingOptions(0.6058, 4);

		expect(options.map((option) => option.label)).toEqual(["0.0001", "0.001", "0.01"]);
		expect(options.map((option) => option.decimals)).toEqual([4, 3, 2]);
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

	it("preserves native integer precision above the five-significant-figure boundary", () => {
		const options = getPriceGroupingOptions(100_000, 1);

		expect(options.map((option) => option.label)).toEqual(["1", "10", "20", "50", "100", "1000", "10000"]);
		expect(options[0]).toMatchObject({ key: "full", nSigFigs: null, tickSize: 1, decimals: 0 });
		expect(options[1]).toMatchObject({ key: "5:default", nSigFigs: 5, tickSize: 10 });
	});

	it("subscribes to the native book by omitting aggregation fields", () => {
		const full = getPriceGroupingOptions(100_000, 1)[0];

		expect(getL2BookSubscriptionParams("BTC", full)).toEqual({ coin: "BTC" });
		expect(getL2BookSubscriptionParams("BTC", { nSigFigs: 5, mantissa: 2 })).toEqual({
			coin: "BTC",
			nSigFigs: 5,
			mantissa: 2,
		});
		expect(getL2BookSubscriptionParams("BTC", { nSigFigs: 5, mantissa: 5 }, { fast: true })).toEqual({
			coin: "BTC",
			fast: true,
			mantissa: 5,
			nSigFigs: 5,
		});
	});

	it("only permits mantissa grouping with five significant figures", () => {
		expectTypeOf<{ nSigFigs: 5; mantissa: 2 }>().toMatchTypeOf<L2BookPriceGroupSelection>();
		expectTypeOf<{ nSigFigs: 4; mantissa: 2 }>().not.toMatchTypeOf<L2BookPriceGroupSelection>();
	});
});
