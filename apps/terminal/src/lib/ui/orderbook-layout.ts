import Big from "big.js";
import type { CSSProperties } from "react";
import { FORMAT_COMPACT_THRESHOLD } from "@/config/app";
import type { NumberFormatters } from "@/lib/format";
import { toBig } from "@/lib/trade/numbers";

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
const NARROW_CHARACTERS = new Set([",", ".", "'", " ", "\u00a0", "\u202f"]);

/**
 * Upper bound, in pixels, of the width the compact ladder's 12 px tabular figures give `text`: digits are measured
 * at 0.6 em, group and decimal separators at 0.27 em and letters at about 0.81 em, so every class is rounded up.
 */
function getCompactOrderbookTextWidthPx(text: string): number {
	let width = 0;
	for (const character of text) {
		if (NARROW_CHARACTERS.has(character)) width += 0.3;
		else if (character >= "0" && character <= "9") width += 0.62;
		else width += 0.85;
	}
	return width * COMPACT_ORDERBOOK_FONT_SIZE_PX;
}

interface CompactOrderbookSizeInput {
	value: string;
	fullText: string;
	decimals: number;
	priceText: string;
	ladderWidthPx: number;
	formatNumber: NumberFormatters["formatNumber"];
}

/**
 * The size a compact ladder row shows beside `priceText`. The row's inset is its 8 px and 12 px side padding plus
 * the 4 px column gap of `COMPACT_ORDERBOOK_ROW_GRID_CLASS` rows. The full number when it fits; otherwise the first
 * shorter form that fits: fewer decimals, never rounding a non-zero size to zero, then compact notation from 10,000
 * up; the narrowest of them when none fits.
 */
export function getCompactOrderbookSizeText({
	value,
	fullText,
	decimals,
	priceText,
	ladderWidthPx,
	formatNumber,
}: CompactOrderbookSizeInput): string {
	const budgetPx = ladderWidthPx - COMPACT_ORDERBOOK_ROW_TEXT_INSET_PX - getCompactOrderbookTextWidthPx(priceText);
	if (getCompactOrderbookTextWidthPx(fullText) <= budgetPx) return fullText;
	const amount = toBig(value);
	if (!amount) return fullText;

	const candidates: string[] = [];
	for (let shorter = decimals - 1; shorter >= 0; shorter -= 1) {
		if (!amount.eq(0) && amount.abs().round(shorter, Big.roundHalfUp).eq(0)) break;
		candidates.push(formatNumber(value, shorter));
	}
	if (amount.abs().gte(FORMAT_COMPACT_THRESHOLD)) {
		for (const compactDecimals of [2, 1, 0])
			candidates.push(formatNumber(value, { decimals: compactDecimals, compact: true }));
	}

	let narrowest = fullText;
	for (const candidate of candidates) {
		const widthPx = getCompactOrderbookTextWidthPx(candidate);
		if (widthPx <= budgetPx) return candidate;
		if (widthPx < getCompactOrderbookTextWidthPx(narrowest)) narrowest = candidate;
	}
	return narrowest;
}
