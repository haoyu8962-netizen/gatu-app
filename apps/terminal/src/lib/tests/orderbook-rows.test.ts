import { describe, expect, it } from "vitest";
import { formatNumber } from "@/lib/format";
import {
	getCompactOrderbookSizeText,
	getOrderbookLadderLayout,
	ORDERBOOK_ROW_METRICS,
} from "@/lib/ui/orderbook-layout";

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

describe("compact order book size text", () => {
	function sizeText(priceText: string, value: string, decimals: number, ladderWidthPx: number) {
		return getCompactOrderbookSizeText({
			value,
			fullText: formatNumber(value, decimals),
			decimals,
			priceText,
			ladderWidthPx,
			formatNumber,
		});
	}

	it("keeps a full kPEPE size beside its price on a 390 px phone and abbreviates it on a 320 px phone", () => {
		expect(sizeText("0.004812", "4472287", 0, 153.75)).toBe("4,472,287");
		expect(sizeText("0.004812", "4472287", 0, 124)).toBe("4.47M");
	});

	it("drops decimals before overlapping when a size below 10,000 does not fit", () => {
		expect(sizeText("77,677.0", "123.45678", 5, 153.75)).toBe("123.45678");
		expect(sizeText("77,677.0", "123.45678", 5, 124)).toBe("123.46");
	});

	it("never rounds a non-zero size to zero and keeps compact notation only when it is narrower", () => {
		expect(sizeText("77,677.0", "0.00012", 5, 100)).toBe("0.0001");
		expect(sizeText("0.004812", "698254", 0, 140)).toBe("698,254");
		expect(sizeText("0.004812", "698254", 0, 124)).toBe("698.3K");
		expect(sizeText("0.004812", "698254", 0, 100)).toBe("698K");
	});

	it("never claims a fit below the measured widths of IBM Plex Sans figures at 12 px", () => {
		const measuredPx = 7.203125 * 15 + 3.265625 * 4;
		expect(sizeText("123,456.7", "12345678", 0, measuredPx + 24 - 1)).not.toBe("12,345,678");
	});
});
