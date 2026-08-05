const MAX_LEVEL_COUNT = 24;

export const MOBILE_ORDERBOOK_ROW_METRICS = {
	default: { rowHeightPx: 23, rowGapPx: 2, ladderPaddingPx: 8 },
	compact: { rowHeightPx: 24, rowGapPx: 4, ladderPaddingPx: 0 },
} as const;

export type MobileOrderbookRowMetrics =
	(typeof MOBILE_ORDERBOOK_ROW_METRICS)[keyof typeof MOBILE_ORDERBOOK_ROW_METRICS];

export function getMobileOrderbookRowsForLadderHeight(
	height: number,
	metrics: MobileOrderbookRowMetrics,
	minRows: number,
): number | null {
	if (!Number.isFinite(height) || height <= 0) return null;
	const availableHeight = Math.max(0, height - metrics.ladderPaddingPx);
	const rows = Math.floor((availableHeight + metrics.rowGapPx) / (metrics.rowHeightPx + metrics.rowGapPx));
	return Math.min(MAX_LEVEL_COUNT, Math.max(minRows, rows));
}
