import { describe, expect, it } from "vitest";
import { getOrderbookLadderLayout, ORDERBOOK_ROW_METRICS } from "@/lib/ui/orderbook-layout";

describe("orderbook ladder coverage", () => {
	it("covers the reported desktop gap without stretching the rows", () => {
		expect(getOrderbookLadderLayout(290.5, ORDERBOOK_ROW_METRICS.default)).toEqual({ rowCount: 12, fullRowCount: 11 });
	});

	it.each(Object.values(ORDERBOOK_ROW_METRICS))(
		"covers arbitrary heights with fixed $rowHeightPx px rows",
		(metrics) => {
			for (let height = 0.5; height <= 1200; height += 0.5) {
				const { rowCount, fullRowCount } = getOrderbookLadderLayout(height, metrics);
				const contentHeight = rowCount * metrics.rowHeightPx + (rowCount - 1) * metrics.rowGapPx;
				expect(contentHeight).toBeGreaterThanOrEqual(height);
				expect(contentHeight - height).toBeLessThan(metrics.rowHeightPx + metrics.rowGapPx);
				for (let rank = 0; rank < rowCount; rank++) {
					const bottom = rank * (metrics.rowHeightPx + metrics.rowGapPx) + metrics.rowHeightPx;
					expect(rank < fullRowCount).toBe(bottom <= height);
				}
			}
		},
	);

	it("has no feed-depth cap and fails closed for unavailable geometry", () => {
		expect(getOrderbookLadderLayout(985, ORDERBOOK_ROW_METRICS.default).rowCount).toBe(40);
		for (const height of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(getOrderbookLadderLayout(height, ORDERBOOK_ROW_METRICS.default)).toEqual({ rowCount: 0, fullRowCount: 0 });
		}
	});
});
