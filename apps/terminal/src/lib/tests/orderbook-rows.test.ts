import { describe, expect, it } from "vitest";
import { fitsCompactOrderbookRow, getOrderbookLadderLayout, ORDERBOOK_ROW_METRICS } from "@/lib/ui/orderbook-layout";

describe("orderbook complete-row layout", () => {
	it.each([287, 290.5])("fills the reported %s px ladder with eleven complete rows", (height) => {
		const layout = getOrderbookLadderLayout(height, ORDERBOOK_ROW_METRICS.default);
		expect(layout.rowCount).toBe(11);
		expect(layout.fullRowCount).toBe(11);
		expect(layout.rowHeightPx * 11 + 20).toBeCloseTo(height, 8);
	});
	it.each(Object.values(ORDERBOOK_ROW_METRICS))(
		"fills arbitrary heights with readable $rowHeightPx px minimum rows",
		(metrics) => {
			for (let height = 0.5; height <= 1200; height += 0.5) {
				const { rowCount, fullRowCount, rowHeightPx } = getOrderbookLadderLayout(height, metrics);
				expect(fullRowCount).toBe(rowCount);
				if (height < metrics.rowHeightPx) {
					expect(rowCount).toBe(0);
					continue;
				}
				expect(rowCount).toBeGreaterThan(0);
				expect(rowHeightPx).toBeGreaterThanOrEqual(metrics.rowHeightPx);
				expect(rowCount * rowHeightPx + (rowCount - 1) * metrics.rowGapPx).toBeCloseTo(height, 8);
				for (let rank = 0; rank < rowCount; rank++) {
					expect(rank * (rowHeightPx + metrics.rowGapPx) + rowHeightPx).toBeLessThanOrEqual(height + 1e-8);
				}
			}
		},
	);
	it("has no feed-depth cap and fails closed for unavailable geometry", () => {
		expect(getOrderbookLadderLayout(985, ORDERBOOK_ROW_METRICS.default).rowCount).toBe(39);
		for (const height of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(getOrderbookLadderLayout(height, ORDERBOOK_ROW_METRICS.default)).toEqual({
				rowCount: 0,
				fullRowCount: 0,
				rowHeightPx: 23,
			});
		}
	});
});

describe("compact order book text fit", () => {
	it("holds a full kPEPE size beside its price on a 390 px phone but not on a 320 px phone", () => {
		expect(fitsCompactOrderbookRow("0.004812", "4,472,287", 153.75)).toBe(true);
		expect(fitsCompactOrderbookRow("0.004812", "4,472,287", 124)).toBe(false);
		expect(fitsCompactOrderbookRow("0.004812", "4.47M", 124)).toBe(true);
	});

	it("never claims a fit below the measured widths of IBM Plex Sans figures at 12 px", () => {
		const measuredPx = 7.203125 * 15 + 3.265625 * 4;
		expect(fitsCompactOrderbookRow("123,456.7", "12,345,678", measuredPx + 24 - 1)).toBe(false);
		expect(fitsCompactOrderbookRow("123,456.7", "12,345,678", 0)).toBe(false);
	});
});
