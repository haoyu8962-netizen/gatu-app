const MAX_LEVEL_COUNT = 24;

export const COMPACT_ORDERBOOK_DEFAULT_SLOT_COUNT = 11;
export const COMPACT_ORDERBOOK_MIN_SLOT_COUNT = 3;
export const COMPACT_ORDERBOOK_MAX_SLOT_COUNT = 19;

export const MOBILE_ORDERBOOK_ROW_METRICS = {
	default: { rowHeightPx: 23, rowGapPx: 2, ladderPaddingPx: 8 },
	compact: { rowHeightPx: 24, rowGapPx: 4, ladderPaddingPx: 0 },
} as const;

export type MobileOrderbookRowMetrics =
	(typeof MOBILE_ORDERBOOK_ROW_METRICS)[keyof typeof MOBILE_ORDERBOOK_ROW_METRICS];

export function getMobileOrderbookRowOffsetPx(rank: number, metrics: MobileOrderbookRowMetrics): number {
	return rank * (metrics.rowHeightPx + metrics.rowGapPx);
}

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

export function getCompactOrderbookSlotCount(height: number): number | null {
	if (!Number.isFinite(height) || height <= 0) return null;

	const { rowHeightPx, rowGapPx } = MOBILE_ORDERBOOK_ROW_METRICS.compact;
	const measuredSlots = Math.floor((height + rowGapPx) / (rowHeightPx + rowGapPx));
	const clampedSlots = Math.min(
		COMPACT_ORDERBOOK_MAX_SLOT_COUNT,
		Math.max(COMPACT_ORDERBOOK_MIN_SLOT_COUNT, measuredSlots),
	);

	return clampedSlots % 2 === 0 ? clampedSlots - 1 : clampedSlots;
}
