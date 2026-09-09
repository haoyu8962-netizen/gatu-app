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
