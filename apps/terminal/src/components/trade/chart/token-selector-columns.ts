import { createColumnHelper, type SortingFn } from "@tanstack/react-table";
import { get24hChange, getEightHourFundingRate, getMarketCapUsd, getOiUsd } from "@/domain/market";
import type { MarketRow } from "./token-selector-categories";

export type { MarketRow, MarketScope } from "./token-selector-categories";

export type MarketTableLayout = "default" | "spot";

const DEFAULT_MARKET_TABLE_GRID_CLASS = "grid-cols-[minmax(150px,1fr)_100px_160px_130px_140px_150px]";
const SPOT_MARKET_TABLE_GRID_CLASS = "grid-cols-[minmax(150px,1fr)_100px_160px_140px_150px]";

/**
 * The desktop selector is 960px wide with 16px horizontal padding. The default
 * grid has a 890px minimum footprint including its five 12px gaps; with the
 * 32px padding budget that is 922px, inside the 926px bordered content box.
 */
export function getMarketTableGridClass(layout: MarketTableLayout): string {
	return layout === "spot" ? SPOT_MARKET_TABLE_GRID_CLASS : DEFAULT_MARKET_TABLE_GRID_CLASS;
}

const columnHelper = createColumnHelper<MarketRow>();

const numericStringSortFn: SortingFn<MarketRow> = (rowA, rowB, columnId) => {
	const a = Number(rowA.getValue(columnId));
	const b = Number(rowB.getValue(columnId));
	if (Number.isNaN(a) || Number.isNaN(b)) return 0;
	return a - b;
};

export const TOKEN_SELECTOR_COLUMNS = [
	columnHelper.accessor("pairName", {
		size: 220,
		enableSorting: false,
	}),
	columnHelper.accessor("markPx", {
		id: "price",
		size: 80,
		sortUndefined: "last",
		sortingFn: numericStringSortFn,
	}),
	columnHelper.accessor((row: MarketRow) => get24hChange(row.prevDayPx, row.markPx) ?? undefined, {
		id: "24h-change",
		size: 112,
		sortUndefined: "last",
	}),
	columnHelper.accessor((row: MarketRow) => getEightHourFundingRate(row.funding) ?? undefined, {
		id: "funding",
		size: 112,
		sortUndefined: "last",
		sortingFn: numericStringSortFn,
	}),
	columnHelper.accessor("dayNtlVlm", {
		id: "volume",
		size: 80,
		sortUndefined: "last",
		sortingFn: numericStringSortFn,
	}),
	columnHelper.accessor(
		(row: MarketRow) =>
			row.kind === "spot" ? (getMarketCapUsd(row.circulatingSupply, row.markPx) ?? undefined) : undefined,
		{
			id: "market-cap",
			size: 160,
			sortUndefined: "last",
			sortingFn: numericStringSortFn,
		},
	),
	columnHelper.accessor((row: MarketRow) => getOiUsd(row.openInterest, row.markPx) ?? undefined, {
		id: "oi",
		size: 128,
		sortUndefined: "last",
	}),
];
