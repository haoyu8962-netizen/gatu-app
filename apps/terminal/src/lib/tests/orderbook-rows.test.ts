import { describe, expect, it } from "vitest";
import { getVisibleOrderbookRowCount } from "@/components/trade/orderbook/use-orderbook-rows";

describe("getVisibleOrderbookRowCount", () => {
	it("accounts for 23px rows and 2px gaps on both sides of the spread", () => {
		expect(getVisibleOrderbookRowCount(230, 30)).toBe(4);
	});

	it("keeps the row count within the supported bounds", () => {
		expect(getVisibleOrderbookRowCount(0, 0)).toBe(3);
		expect(getVisibleOrderbookRowCount(2_000, 30)).toBe(20);
	});
});
