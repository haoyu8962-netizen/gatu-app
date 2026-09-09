import { getOrderbookLadderLayout, ORDERBOOK_ROW_METRICS, type OrderbookRowMetrics } from "@/lib/ui/orderbook-layout";

export const COMPACT_ORDERBOOK_DEFAULT_SLOT_COUNT = 11;
export const MOBILE_ORDERBOOK_ROW_METRICS = ORDERBOOK_ROW_METRICS;
export type MobileOrderbookRowMetrics = OrderbookRowMetrics;

export function getMobileOrderbookRowOffsetPx(
	rank: number,
	metrics: MobileOrderbookRowMetrics,
	rowHeightPx: number = metrics.rowHeightPx,
): number {
	return rank * (rowHeightPx + metrics.rowGapPx);
}

export function getCompactOrderbookLayout(height: number, mode: "both" | "asks" | "bids") {
	const metrics = MOBILE_ORDERBOOK_ROW_METRICS.compact;
	const sideHeight = mode === "both" ? (height - metrics.rowHeightPx - 2 * metrics.rowGapPx) / 2 : height;
	return getOrderbookLadderLayout(sideHeight, metrics);
}
