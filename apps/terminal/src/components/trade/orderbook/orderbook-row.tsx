import { t } from "@lingui/core/macro";
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
	const priceText = formatNumber(level.price, priceDecimals);
	const sizeText = formatNumber(sizeValue, { decimals: displayDecimals, compact: true });
	const totalText = formatNumber(totalValue, { decimals: displayDecimals, compact: true });

	return (
		<button
			type="button"
			onClick={() => setSelectedPrice(level.price)}
			title={priceText}
			aria-label={t`Use ${priceText} as limit price`}
			className={cn(
				"group relative block w-full shrink-0 cursor-pointer text-left hover:bg-fill-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stroke-focus",
				compact ? "h-[24px]" : "h-[23px]",
			)}
		>
			<span
				className={cn("absolute inset-y-0 pointer-events-none", isAsk ? "depth-bar-ask" : "depth-bar-bid")}
				style={{ width: `${depthPct}%`, left: 0 }}
			/>
			<span
				className={cn(
					"grid gap-1 tabular-nums py-0.5 relative z-10",
					compact ? "grid-cols-2 pl-2 pr-3 text-xs" : "orderbook-grid px-2 text-2xs",
				)}
			>
				<span
					title={priceText}
					className={cn(
						"min-w-0 truncate text-left justify-start",
						!compact && "font-medium",
						isAsk ? "orderbook-price-ask" : "orderbook-price-bid",
					)}
				>
					{priceText}
				</span>
				<OrderbookSizeCell
					className="min-w-0 truncate text-right orderbook-value-text"
					displayValue={sizeText}
					resetKey={flashResetKey}
					value={level.size}
				/>
				{!compact && (
					<span className="min-w-0 truncate text-right orderbook-value-text" title={totalText}>
						{totalText}
					</span>
				)}
			</span>
		</button>
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
