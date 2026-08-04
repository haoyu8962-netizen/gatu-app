// The 1a handoff is a nine-column desktop table with a 1280px minimum canvas.
export const POSITION_TABLE_MIN_WIDTH = 1280;

// Includes the handoff's 20px outer padding and 14px inter-column rhythm.
export const POSITION_TABLE_COLUMNS = [
	{ id: "market", width: 177 },
	{ id: "size", width: 166 },
	{ id: "prices", width: 166 },
	{ id: "pnl", width: 154 },
	{ id: "liquidation", width: 144 },
	{ id: "tpsl", width: 119 },
	{ id: "margin", width: 119 },
	{ id: "funding", width: 90 },
	{ id: "actions", width: 145 },
] as const;

export const positionTableHeaderClass = "bg-surface [&_tr]:border-stroke-weak [&_tr]:border-t-0";

export const positionTableBodyClass = "[&_tr]:border-0";

export const positionTableHeadClass =
	"sticky top-0 z-[1] h-8 whitespace-nowrap bg-surface px-[7px] py-0 text-right text-[11px] leading-4 font-semibold normal-case tracking-normal text-market-close-subtle";

export const positionTableCellClass = "h-[46px] whitespace-nowrap px-[7px] py-2 text-right text-xs leading-4";

export const positionTableInlineActionClass =
	"h-[26px] min-h-0 rounded-[7px] px-2.5 py-0 text-xs leading-4 font-semibold shadow-none active:not-data-disabled:scale-100";
