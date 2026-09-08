import { describe, expect, it } from "vitest";
import {
	getCompactOrderbookLayout,
	getMobileOrderbookRowOffsetPx,
	MOBILE_ORDERBOOK_ROW_METRICS,
} from "@/components/trade/mobile/mobile-orderbook-layout";

describe("mobile orderbook ladder layout", () => {
	it("keeps fixed row geometry without vertical ladder padding", () => {
		expect(MOBILE_ORDERBOOK_ROW_METRICS.default).toEqual({ rowHeightPx: 23, rowGapPx: 2 });
		expect(MOBILE_ORDERBOOK_ROW_METRICS.compact).toEqual({ rowHeightPx: 24, rowGapPx: 4 });
		expect(getMobileOrderbookRowOffsetPx(4, MOBILE_ORDERBOOK_ROW_METRICS.compact)).toBe(112);
	});

	it("fills the reported mobile gap and disables its cropped edge", () => {
		expect(getCompactOrderbookLayout(359, "both")).toEqual({ rowCount: 6, fullRowCount: 5 });
		expect(getCompactOrderbookLayout(360, "both")).toEqual({ rowCount: 6, fullRowCount: 6 });
		expect(getCompactOrderbookLayout(361, "both")).toEqual({ rowCount: 7, fullRowCount: 6 });
	});

	it("uses the complete height in single-side modes without an odd-count constraint", () => {
		for (const mode of ["asks", "bids"] as const) {
			expect(getCompactOrderbookLayout(332, mode)).toEqual({ rowCount: 12, fullRowCount: 12 });
			expect(getCompactOrderbookLayout(331.5, mode)).toEqual({ rowCount: 12, fullRowCount: 11 });
		}
	});

	it("covers heights above the former nineteen-slot cap", () => {
		expect(getCompactOrderbookLayout(700, "both")).toEqual({ rowCount: 13, fullRowCount: 12 });
		expect(getCompactOrderbookLayout(700, "asks")).toEqual({ rowCount: 26, fullRowCount: 25 });
	});
});
