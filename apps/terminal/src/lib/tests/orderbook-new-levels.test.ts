import { describe, expect, it } from "vitest";
import {
	collectOrderbookPrices,
	findNewOrderbookPrices,
	getOrderbookLevelKey,
	getOrderbookPriceKey,
	type OrderbookPulseSnapshot,
} from "@/lib/trade/orderbook-new-levels";

function book(bids: string[], asks: string[]): OrderbookPulseSnapshot {
	return { levels: [bids.map((px) => ({ px })), asks.map((px) => ({ px }))] };
}

describe("orderbook new price levels", () => {
	it("normalizes equivalent decimal prices without floating point conversion", () => {
		expect(getOrderbookPriceKey("83.950")).toBe("83.95");
		expect(getOrderbookPriceKey("9007199254740993.0010")).toBe("9007199254740993.001");
		expect(getOrderbookLevelKey("ask", "83.950")).toBe("ask:83.95");
		for (const value of ["", "0", "-3", "NaN", "Infinity", "broken"]) {
			expect(getOrderbookPriceKey(value)).toBeNull();
		}
	});

	it("establishes each side silently on its first nonempty snapshot", () => {
		const current = collectOrderbookPrices(book(["99"], ["101"]));
		expect(findNewOrderbookPrices(undefined, current)).toEqual({ bid: new Set(), ask: new Set() });
		const emptyAsk = collectOrderbookPrices(book(["99"], []));
		expect(findNewOrderbookPrices(emptyAsk, collectOrderbookPrices(book(["100", "99"], ["102", "101"])))).toEqual({
			bid: new Set(["100"]),
			ask: new Set(),
		});
	});

	it("ignores rank, decimal formatting, duplicate and size changes", () => {
		const previous = collectOrderbookPrices(book(["98", "99"], ["101.00", "102"]));
		const current = collectOrderbookPrices({
			levels: [
				[{ px: "99.0" }, { px: "98" }, { px: "99" }],
				[{ px: "102" }, { px: "101" }],
			],
		});
		expect(findNewOrderbookPrices(previous, current)).toEqual({ bid: new Set(), ask: new Set() });
	});

	it("compares complete sides independently and recognizes deletion followed by reentry", () => {
		const first = collectOrderbookPrices(book(["99", "98", "97"], ["100", "101", "102"]));
		const second = collectOrderbookPrices(book(["100", "99", "98"], ["101", "102", "103"]));
		expect(findNewOrderbookPrices(first, second)).toEqual({ bid: new Set(["100"]), ask: new Set(["103"]) });
		const third = collectOrderbookPrices(book(["99", "98", "97"], ["100", "101", "102"]));
		expect(findNewOrderbookPrices(second, third)).toEqual({ bid: new Set(["97"]), ask: new Set(["100"]) });
	});
});
