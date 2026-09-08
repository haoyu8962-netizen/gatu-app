export const ORDERBOOK_ROW_METRICS = {
	default: { rowHeightPx: 23, rowGapPx: 2 },
	compact: { rowHeightPx: 24, rowGapPx: 4 },
} as const;

export type OrderbookRowMetrics = (typeof ORDERBOOK_ROW_METRICS)[keyof typeof ORDERBOOK_ROW_METRICS];

export function getOrderbookLadderLayout(height: number, metrics: OrderbookRowMetrics) {
	if (!Number.isFinite(height) || height <= 0) return { rowCount: 0, fullRowCount: 0 };
	const count = (height + metrics.rowGapPx) / (metrics.rowHeightPx + metrics.rowGapPx);
	return { rowCount: Math.ceil(count), fullRowCount: Math.floor(count) };
}

export function getOrderbookPlaceholderKeys(count: number) {
	return Array.from({ length: Math.max(0, count) }, (_, index) => `placeholder-${index}`);
}
