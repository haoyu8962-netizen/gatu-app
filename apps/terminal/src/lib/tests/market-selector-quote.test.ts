import { describe, expect, it } from "vitest";
import {
	getMarketSelectorChange,
	getMarketSelectorPrice,
	getMarketSelectorQuote,
	type MarketSelectorQuoteSource,
} from "@/domain/market/selector-quote";

const NOW = 1_800_000_000_000;

function source(overrides: Partial<MarketSelectorQuoteSource> = {}): MarketSelectorQuoteSource {
	return {
		markPx: "100",
		midPx: "101",
		markPriceStatus: "success",
		markPriceReceivedAt: NOW - 1_000,
		prevDayPx: "80",
		assetContextLive: true,
		...overrides,
	};
}

describe("market selector price", () => {
	it("uses the live context's mid", () => {
		expect(getMarketSelectorPrice(source(), NOW)).toBe("101");
	});

	it.each([
		["null", null],
		["missing", undefined],
	])("falls back to the same context's mark when the mid is %s", (_case, midPx) => {
		expect(getMarketSelectorPrice(source({ midPx }), NOW)).toBe("100");
	});

	it.each(["0", "-1", "abc"])("does not fall back to the mark for an unusable mid %s", (midPx) => {
		expect(getMarketSelectorPrice(source({ midPx }), NOW)).toBeUndefined();
	});

	it.each([
		["idle", { markPriceStatus: "idle" as const }],
		["loading", { markPriceStatus: "loading" as const }],
		["stale", { markPriceStatus: "stale" as const }],
		["error", { markPriceStatus: "error" as const }],
		["missing a receipt", { markPriceReceivedAt: undefined }],
		["received more than ten seconds ago", { markPriceReceivedAt: NOW - 10_001 }],
		["received after the local clock", { markPriceReceivedAt: NOW + 1 }],
		["missing a positive mark", { markPx: "0" }],
	])("has no price while the price context is %s", (_case, overrides) => {
		expect(getMarketSelectorPrice(source(overrides), NOW)).toBeUndefined();
	});

	it("still prices a context received exactly ten seconds ago", () => {
		expect(getMarketSelectorPrice(source({ markPriceReceivedAt: NOW - 10_000 }), NOW)).toBe("101");
	});
});

describe("market selector 24h change", () => {
	it("compares the selector price with the row's previous day price", () => {
		const change = getMarketSelectorChange(source(), NOW);

		expect(change?.amount.toString()).toBe("21");
		expect(change?.ratio.toString()).toBe("0.2625");
	});

	it("compares the mark with the previous day price when the mid is null", () => {
		expect(getMarketSelectorChange(source({ midPx: null }), NOW)?.ratio.toString()).toBe("0.25");
	});

	it.each([
		["the asset context is not live", { assetContextLive: false }],
		["the asset context liveness is unknown", { assetContextLive: undefined }],
		["the previous day price is missing", { prevDayPx: undefined }],
		["the previous day price is zero", { prevDayPx: "0" }],
		["the previous day price is negative", { prevDayPx: "-1" }],
		["the price context is stale", { markPriceStatus: "stale" as const }],
	])("has no change when %s", (_case, overrides) => {
		expect(getMarketSelectorChange(source(overrides), NOW)).toBeUndefined();
	});
});

describe("market selector quote", () => {
	it.each([
		["a BTC-sized perp price", "77677.5", 5, "perp", 0],
		["a mid-sized perp price", "64.45", 2, "perp", 3],
		["a perp price under the decimal cap", "0.00001234", 0, "perp", 6],
		["a spot price under the decimal cap", "0.0012345678", 2, "spot", 6],
		["a spot price within five significant figures", "0.00000011", 0, "spot", 8],
	] as const)(
		"keeps five significant figures within the market cap for %s",
		(_case, midPx, szDecimals, marketType, decimals) => {
			const quote = getMarketSelectorQuote(source({ midPx, markPx: midPx }), { szDecimals, marketType, now: NOW });

			expect(quote.price).toBe(midPx);
			expect(quote.priceDecimals).toBe(decimals);
		},
	);

	it("gives the change amount the finer precision of the two prices", () => {
		const quote = getMarketSelectorQuote(source({ midPx: "10.5", markPx: "10.5", prevDayPx: "9.8" }), {
			szDecimals: 1,
			marketType: "perp",
			now: NOW,
		});

		expect(quote.priceDecimals).toBe(3);
		expect(quote.change).toEqual({ amount: "0.7", ratio: expect.any(String), direction: 1, decimals: 4 });
	});

	it.each([
		["up", "101", 1],
		["unchanged", "80", 0],
		["down", "79", -1],
	] as const)("reports the direction of a price that went %s", (_case, midPx, direction) => {
		const quote = getMarketSelectorQuote(source({ midPx }), { szDecimals: 2, marketType: "perp", now: NOW });

		expect(quote.change?.direction).toBe(direction);
	});

	it("keeps the price and drops the change while only the price context is live", () => {
		const quote = getMarketSelectorQuote(source({ assetContextLive: false }), {
			szDecimals: 2,
			marketType: "perp",
			now: NOW,
		});

		expect(quote.price).toBe("101");
		expect(quote.change).toBeUndefined();
	});
});
