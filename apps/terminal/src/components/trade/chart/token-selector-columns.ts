import { t } from "@lingui/core/macro";
import { createColumnHelper, type SortingFn } from "@tanstack/react-table";
import { get24hChange, getOiUsd } from "@/domain/market";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";

export type MarketScope = "all" | "perp" | "spot" | "hip3";

export type MarketRow = UnifiedMarketInfo;

const columnHelper = createColumnHelper<MarketRow>();

const numericStringSortFn: SortingFn<MarketRow> = (rowA, rowB, columnId) => {
	const a = Number(rowA.getValue(columnId));
	const b = Number(rowB.getValue(columnId));
	if (isNaN(a) || isNaN(b)) return 0;
	return a - b;
};

export const TOKEN_SELECTOR_COLUMNS = [
	columnHelper.accessor("pairName", {
		header: t`Market`,
		size: 220,
		enableSorting: false,
	}),
	columnHelper.accessor("markPx", {
		id: "price",
		header: t`Price`,
		size: 80,
		sortUndefined: "last",
		sortingFn: numericStringSortFn,
	}),
	columnHelper.accessor((row: MarketRow) => get24hChange(row.prevDayPx, row.markPx) ?? undefined, {
		id: "24h-change",
		header: t`24h Change`,
		size: 112,
		sortUndefined: "last",
	}),
	columnHelper.accessor((row: MarketRow) => getOiUsd(row.openInterest, row.markPx) ?? undefined, {
		id: "oi",
		header: t`Open Interest`,
		size: 128,
		sortUndefined: "last",
	}),
	columnHelper.accessor("dayNtlVlm", {
		id: "volume",
		header: t`Volume`,
		size: 80,
		sortUndefined: "last",
		sortingFn: numericStringSortFn,
	}),
	columnHelper.accessor("funding", {
		id: "funding",
		header: t`Funding`,
		size: 80,
		sortUndefined: "last",
		sortingFn: numericStringSortFn,
	}),
];
