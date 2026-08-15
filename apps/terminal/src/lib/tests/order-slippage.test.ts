import { describe, expect, it } from "vitest";
import { estimateMarketSlippage } from "@/domain/trade/order/slippage";
import type { RawBookLevel, RawBookSides } from "@/lib/trade/orderbook";

function level(px: string, sz: string): RawBookLevel {
	return { px, sz, n: 1 };
}

const bids = [level("99.9", "2"), level("99.8", "5"), level("99.5", "10")];
const asks = [level("100.1", "2"), level("100.2", "5"), level("100.5", "10")];
const book = [bids, asks] as const;

describe("market slippage estimate", () => {
	it("walks the asks for a buy and the bids for a sell with positive slippage on both sides", () => {
		const buy = estimateMarketSlippage({ levels: book, side: "buy", size: 1 });
		const sell = estimateMarketSlippage({ levels: book, side: "sell", size: 1 });

		expect(buy).toEqual({ avgPx: 100.1, exceedsVisibleDepth: false, refPx: 100, slippageBps: 10 });
		expect(sell).toEqual({ avgPx: 99.9, exceedsVisibleDepth: false, refPx: 100, slippageBps: 10 });
	});

	it("prices an exact best-level fill at the best price and half the spread", () => {
		const estimate = estimateMarketSlippage({ levels: book, side: "buy", size: 2 });

		expect(estimate?.avgPx).toBe(100.1);
		expect(estimate?.refPx).toBe(100);
		expect(estimate?.slippageBps).toBe(10);
		expect(estimate?.exceedsVisibleDepth).toBe(false);
	});

	it("averages a multi-level walk from the API price strings without float drift", () => {
		const estimate = estimateMarketSlippage({
			levels: [[level("0.1", "1")], [level("0.1", "1"), level("0.2", "1")]],
			side: "buy",
			size: "2",
		});

		expect(estimate).toEqual({ avgPx: 0.15, exceedsVisibleDepth: false, refPx: 0.1, slippageBps: 5000 });
		expect(estimate?.avgPx).not.toBe((0.1 + 0.2) / 2);
	});

	it("reports no estimate for a size that is missing, zero, or not a number", () => {
		expect(estimateMarketSlippage({ levels: book, side: "buy", size: 0 })).toBeNull();
		expect(estimateMarketSlippage({ levels: book, side: "buy", size: Number.NaN })).toBeNull();
		expect(estimateMarketSlippage({ levels: book, side: "buy", size: -1 })).toBeNull();
		expect(estimateMarketSlippage({ levels: book, side: "buy", size: null })).toBeNull();
	});

	it("reports no estimate without a two-sided book", () => {
		expect(estimateMarketSlippage({ levels: undefined, side: "buy", size: 1 })).toBeNull();
		expect(estimateMarketSlippage({ levels: [[], asks], side: "buy", size: 1 })).toBeNull();
		expect(estimateMarketSlippage({ levels: [bids, []], side: "sell", size: 1 })).toBeNull();
	});

	it("survives a malformed payload that is missing whole sides", () => {
		expect(estimateMarketSlippage({ levels: [] as unknown as RawBookSides, side: "buy", size: 1 })).toBeNull();
		expect(estimateMarketSlippage({ levels: [bids] as unknown as RawBookSides, side: "buy", size: 1 })).toBeNull();
		expect(
			estimateMarketSlippage({ levels: [[undefined], asks] as unknown as RawBookSides, side: "buy", size: 1 }),
		).toBeNull();
	});

	it("reports no estimate for a crossed or non-positive book", () => {
		expect(
			estimateMarketSlippage({ levels: [[level("100.5", "5")], [level("100.1", "5")]], side: "buy", size: 1 }),
		).toBeNull();
		expect(
			estimateMarketSlippage({ levels: [[level("0", "5")], [level("100.1", "5")]], side: "buy", size: 1 }),
		).toBeNull();
	});

	it("flags a size beyond the visible depth as a lower bound instead of hiding the worst case", () => {
		const beyondDepth = estimateMarketSlippage({ levels: book, side: "buy", size: 17.1 });
		const exactDepth = estimateMarketSlippage({ levels: book, side: "buy", size: 17 });

		expect(beyondDepth?.exceedsVisibleDepth).toBe(true);
		expect(beyondDepth?.avgPx).toBe(exactDepth?.avgPx);
		expect(beyondDepth?.slippageBps).toBe(exactDepth?.slippageBps);
		expect(exactDepth?.exceedsVisibleDepth).toBe(false);
		expect(estimateMarketSlippage({ levels: book, side: "sell", size: 17.1 })?.exceedsVisibleDepth).toBe(true);
	});

	it("skips malformed levels while walking the remaining depth", () => {
		const estimate = estimateMarketSlippage({
			levels: [[level("99.9", "2")], [level("100.1", "1"), level("", "5"), level("100.3", "0"), level("100.3", "1")]],
			side: "buy",
			size: 2,
		});

		expect(estimate?.avgPx).toBe(100.2);
		expect(estimate?.refPx).toBe(100);
		expect(estimate?.slippageBps).toBe(20);
	});
});
