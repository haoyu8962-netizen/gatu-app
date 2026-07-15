import { memo } from "react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import type { BookLevel } from "@/lib/trade/orderbook";
import { useOrderbookActions } from "@/stores/use-orderbook-actions-store";
import { OrderbookSizeCell } from "./orderbook-size-cell";

interface Props {
	flashResetKey: string;
	level: BookLevel;
	side: "ask" | "bid";
	maxTotal: number;
	priceDecimals: number;
	showInQuote?: boolean;
	szDecimals: number;
	compact?: boolean;
}

function OrderbookRowComponent({
	flashResetKey,
	level,
	side,
	maxTotal,
	priceDecimals,
	showInQuote = false,
	szDecimals,
	compact = false,
}: Props) {
	const { setSelectedPrice } = useOrderbookActions();
	const depthPct = maxTotal > 0 ? (level.total / maxTotal) * 100 : 0;
	const isAsk = side === "ask";

	const sizeValue = showInQuote ? level.size * level.price : level.size;
	const totalValue = showInQuote ? level.total * level.price : level.total;

	const displayDecimals = showInQuote ? 2 : szDecimals;
	const sizeText = formatNumber(sizeValue, { decimals: displayDecimals, compact: true });
	const totalText = formatNumber(totalValue, { decimals: displayDecimals, compact: true });

	return (
		<div className="relative h-[23px] shrink-0 hover:bg-fill-hover cursor-pointer group">
			<div
				className={cn("absolute inset-y-0 pointer-events-none", isAsk ? "depth-bar-ask" : "depth-bar-bid")}
				style={{ width: `${depthPct}%`, left: 0 }}
			/>
			<div
				className={cn(
					"grid gap-1 text-2xs tabular-nums py-0.5 relative z-10",
					compact ? "grid-cols-2 px-1.5" : "grid-cols-3 px-2",
				)}
			>
				<button
					type="button"
					onClick={() => setSelectedPrice(level.price)}
					className={cn("text-left justify-start font-medium", isAsk ? "orderbook-price-ask" : "orderbook-price-bid")}
				>
					{formatNumber(level.price, priceDecimals)}
				</button>
				<OrderbookSizeCell
					className="text-right orderbook-value-text"
					displayValue={sizeText}
					resetKey={flashResetKey}
					value={level.size}
				/>
				{!compact && <div className="text-right orderbook-value-text">{totalText}</div>}
			</div>
		</div>
	);
}

function areEqual(prev: Props, next: Props): boolean {
	return (
		prev.flashResetKey === next.flashResetKey &&
		prev.side === next.side &&
		prev.maxTotal === next.maxTotal &&
		prev.priceDecimals === next.priceDecimals &&
		prev.showInQuote === next.showInQuote &&
		prev.szDecimals === next.szDecimals &&
		prev.level.price === next.level.price &&
		prev.level.size === next.level.size &&
		prev.level.total === next.level.total &&
		prev.compact === next.compact
	);
}

export const OrderbookRow = memo(OrderbookRowComponent, areEqual);
