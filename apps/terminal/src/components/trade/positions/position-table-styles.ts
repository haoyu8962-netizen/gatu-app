// Keep the desktop overflow distance aligned with Hyperliquid's compact account table.
export const POSITION_TABLE_MIN_WIDTH = 1136;

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
	{ id: "actions", width: 184 },
] as const;

export const positionTableHeaderClass = "bg-surface [&_tr]:border-stroke-weak [&_tr]:border-t-0";

export const positionTableBodyClass = "[&_tr]:border-0";

export const positionTableHeadClass =
	"sticky top-0 z-[1] h-[33px] whitespace-nowrap bg-surface px-[7px] py-0 text-right text-[11px] leading-4 font-semibold normal-case tracking-normal text-market-close-subtle";

export const positionTableCellClass = "h-14 whitespace-nowrap px-[7px] py-2 text-right text-xs leading-4";

export const positionTableInlineActionClass =
	"inline-flex h-[26px] min-h-0 items-center rounded-[4px] px-0.5 py-0 text-xs leading-4 font-semibold text-market-close-success transition-colors duration-[120ms] hover:bg-market-close-hover hover:text-market-close-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-focus disabled:cursor-not-allowed disabled:text-market-close-subtle disabled:opacity-50";
