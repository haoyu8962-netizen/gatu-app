import type { CSSProperties } from "react";

// Preserve the dense desktop canvas while allowing nowrap content to widen individual columns.
export const POSITION_TABLE_MIN_WIDTH = 1096;

export const positionTableHeaderClass = "bg-surface [&_tr]:border-stroke-weak [&_tr]:border-t-0";

export const positionTableBodyClass = "[&_tr]:border-0";

export const positionTableHeadClass =
	"sticky top-0 z-[1] h-6 whitespace-nowrap bg-surface px-2 py-0 text-left text-xs font-normal normal-case tracking-normal text-fg-muted";

export const positionTableCellClass =
	"h-6 overflow-y-hidden whitespace-nowrap px-2 py-0 text-left text-xs leading-none";

export const positionTableInlineActionClass =
	"h-6 min-h-0 rounded-xs px-0.5 py-0 text-2xs font-medium hover:bg-transparent";

export const positionLongMarketCellStyle = {
	backgroundImage:
		"linear-gradient(90deg, var(--orderbook-depth-bid) 0 4px, oklch(from var(--orderbook-depth-bid) l c h / 0.14) 4px, transparent 100%)",
} satisfies CSSProperties;

export const positionShortMarketCellStyle = {
	backgroundImage:
		"linear-gradient(90deg, var(--orderbook-depth-ask) 0 4px, oklch(from var(--orderbook-depth-ask) l c h / 0.14) 4px, transparent 100%)",
} satisfies CSSProperties;
