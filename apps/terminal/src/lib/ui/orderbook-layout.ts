import type { CSSProperties } from "react";

export const ORDERBOOK_ROW_METRICS = {
	default: { rowHeightPx: 23, rowGapPx: 2 },
	compact: { rowHeightPx: 24, rowGapPx: 4 },
} as const;

export type OrderbookRowMetrics = (typeof ORDERBOOK_ROW_METRICS)[keyof typeof ORDERBOOK_ROW_METRICS];

export function getOrderbookLadderLayout(height: number, metrics: OrderbookRowMetrics) {
	const rowCount = Number.isFinite(height)
		? Math.max(0, Math.floor((height + metrics.rowGapPx) / (metrics.rowHeightPx + metrics.rowGapPx)))
		: 0;
	const rowHeightPx = rowCount > 0 ? (height - (rowCount - 1) * metrics.rowGapPx) / rowCount : metrics.rowHeightPx;
	return { rowCount, fullRowCount: rowCount, rowHeightPx };
}

export function getOrderbookPlaceholderKeys(count: number) {
	return Array.from({ length: Math.max(0, count) }, (_, index) => `placeholder-${index}`);
}

export function getOrderbookLadderStyle(rowHeightPx: number, measured: boolean): CSSProperties {
	return {
		"--orderbook-row-height": `${rowHeightPx}px`,
		visibility: measured ? undefined : "hidden",
	} as CSSProperties;
}

export const COMPACT_ORDERBOOK_ROW_GRID_CLASS = "grid-cols-2 pl-2 pr-3 text-xs";
const COMPACT_ORDERBOOK_ROW_TEXT_INSET_PX = 24;
const COMPACT_ORDERBOOK_FONT_SIZE_PX = 12;
const NARROW_CHARACTERS = new Set([",", ".", "'", " ", " ", " "]);

/**
 * Upper bound, in em, of the width the order book's tabular figures give `text`: digits are measured at 0.6 em,
 * group and decimal separators at 0.27 em and letters at about 0.81 em, so every class is rounded up.
 */
function getOrderbookTextWidthEm(text: string): number {
	let width = 0;
	for (const character of text) {
		if (NARROW_CHARACTERS.has(character)) width += 0.3;
		else if (character >= "0" && character <= "9") width += 0.62;
		else width += 0.85;
	}
	return width;
}

/**
 * Whether a compact ladder row of `ladderWidthPx` holds the price and size side by side; the inset is the row's
 * 8 px and 12 px side padding plus the 4 px column gap of `COMPACT_ORDERBOOK_ROW_GRID_CLASS` rows.
 */
export function fitsCompactOrderbookRow(priceText: string, sizeText: string, ladderWidthPx: number): boolean {
	const textWidthPx =
		(getOrderbookTextWidthEm(priceText) + getOrderbookTextWidthEm(sizeText)) * COMPACT_ORDERBOOK_FONT_SIZE_PX;
	return textWidthPx <= ladderWidthPx - COMPACT_ORDERBOOK_ROW_TEXT_INSET_PX;
}
