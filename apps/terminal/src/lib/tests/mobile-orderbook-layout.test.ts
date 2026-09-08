import { describe, expect, it } from "vitest";
import {
	getCompactOrderbookLayout,
	getMobileOrderbookRowOffsetPx,
	MOBILE_ORDERBOOK_ROW_METRICS,
} from "@/components/trade/mobile/mobile-orderbook-layout";

describe("mobile orderbook ladder layout", () => {
	it("keeps readable minimums and positions ranks using the resolved row height", () => {
		expect(MOBILE_ORDERBOOK_ROW_METRICS.default).toEqual({ rowHeightPx: 23, rowGapPx: 2 });
		expect(MOBILE_ORDERBOOK_ROW_METRICS.compact).toEqual({ rowHeightPx: 24, rowGapPx: 4 });
		expect(getMobileOrderbookRowOffsetPx(4, MOBILE_ORDERBOOK_ROW_METRICS.compact)).toBe(112);
		expect(getMobileOrderbookRowOffsetPx(4, MOBILE_ORDERBOOK_ROW_METRICS.compact, 29.5)).toBe(134);
	});
	it.each([
		{ height: 359, count: 5, rowHeight: 29.5 },
		{ height: 360, count: 6, rowHeight: 24 },
		{ height: 361, count: 6, rowHeight: 24 + 0.5 / 6 },
	])("fits complete rows on both sides at $height px", ({ height, count, rowHeight }) => {
		const layout = getCompactOrderbookLayout(height, "both");
		expect(layout.rowCount).toBe(count);
		expect(layout.fullRowCount).toBe(count);
		expect(layout.rowHeightPx).toBeCloseTo(rowHeight, 8);
	});
	it("uses the complete height in single-side modes without an odd-count constraint", () => {
		for (const mode of ["asks", "bids"] as const) {
			expect(getCompactOrderbookLayout(332, mode)).toEqual({ rowCount: 12, fullRowCount: 12, rowHeightPx: 24 });
			expect(getCompactOrderbookLayout(331.5, mode)).toEqual({ rowCount: 11, fullRowCount: 11, rowHeightPx: 26.5 });
		}
	});
	it("fills heights above the former nineteen-slot cap", () => {
		expect(getCompactOrderbookLayout(700, "both")).toEqual({ rowCount: 12, fullRowCount: 12, rowHeightPx: 290 / 12 });
		expect(getCompactOrderbookLayout(700, "asks")).toEqual({ rowCount: 25, fullRowCount: 25, rowHeightPx: 604 / 25 });
	});
});
