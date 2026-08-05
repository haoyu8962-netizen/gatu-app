import { describe, expect, it } from "vitest";
import {
	getMobileOrderbookRowsForLadderHeight,
	MOBILE_ORDERBOOK_ROW_METRICS,
} from "@/components/trade/mobile/mobile-orderbook-layout";

describe("mobile orderbook ladder layout", () => {
	it("keeps the default and compact row geometry explicit", () => {
		expect(MOBILE_ORDERBOOK_ROW_METRICS.default).toEqual({
			rowHeightPx: 23,
			rowGapPx: 2,
			ladderPaddingPx: 8,
		});
		expect(MOBILE_ORDERBOOK_ROW_METRICS.compact).toEqual({
			rowHeightPx: 24,
			rowGapPx: 4,
			ladderPaddingPx: 0,
		});
	});

	it("derives exact visible row counts for both geometries", () => {
		expect(getMobileOrderbookRowsForLadderHeight(131, MOBILE_ORDERBOOK_ROW_METRICS.default, 3)).toBe(5);
		expect(getMobileOrderbookRowsForLadderHeight(136, MOBILE_ORDERBOOK_ROW_METRICS.compact, 3)).toBe(5);
		expect(getMobileOrderbookRowsForLadderHeight(135, MOBILE_ORDERBOOK_ROW_METRICS.compact, 3)).toBe(4);
	});

	it("rejects invalid heights and clamps supported row counts", () => {
		expect(getMobileOrderbookRowsForLadderHeight(0, MOBILE_ORDERBOOK_ROW_METRICS.compact, 3)).toBeNull();
		expect(getMobileOrderbookRowsForLadderHeight(Number.NaN, MOBILE_ORDERBOOK_ROW_METRICS.compact, 3)).toBeNull();
		expect(getMobileOrderbookRowsForLadderHeight(1, MOBILE_ORDERBOOK_ROW_METRICS.compact, 3)).toBe(3);
		expect(getMobileOrderbookRowsForLadderHeight(10_000, MOBILE_ORDERBOOK_ROW_METRICS.compact, 3)).toBe(24);
	});
});
