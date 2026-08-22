// Keep the desktop overflow distance aligned with Hyperliquid's compact account table.
export const POSITION_TABLE_MIN_WIDTH = 1096;

// Combined columns preserve Gatu's information hierarchy while matching the official table density.
export const POSITION_TABLE_COLUMNS = [
	{ id: "market", width: 150 },
	{ id: "size", width: 134 },
	{ id: "prices", width: 126 },
	{ id: "pnl", width: 144 },
	{ id: "liquidation", width: 104 },
	{ id: "tpsl", width: 100 },
	{ id: "margin", width: 116 },
	{ id: "funding", width: 78 },
	{ id: "actions", width: 144 },
] as const;

export const positionTableHeaderClass = "bg-surface [&_tr]:border-stroke-weak [&_tr]:border-t-0";

export const positionTableBodyClass = "[&_tr]:border-0";

export const positionTableHeadClass =
	"sticky top-0 z-[1] h-[33px] whitespace-nowrap bg-surface px-[7px] py-0 text-right text-[11px] leading-4 font-semibold normal-case tracking-normal text-market-close-subtle";

export const positionTableCellClass = "h-14 whitespace-nowrap px-[7px] py-2 text-right text-xs leading-4";

export const positionTableInlineActionClass =
	"h-[26px] min-h-0 rounded-[7px] px-2.5 py-0 text-xs leading-4 font-semibold shadow-none active:not-data-disabled:scale-100";
