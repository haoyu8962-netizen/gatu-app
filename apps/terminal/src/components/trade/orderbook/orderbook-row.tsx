import { useLingui } from "@lingui/react/macro";
import { memo } from "react";
import { cn } from "@/lib/cn";
import { useNumberFormat } from "@/lib/format";
import {
	type BookLevel,
	formatCompactOrderbookSize,
	getDepthPercentage,
	getOrderbookQuoteDecimals,
} from "@/lib/trade/orderbook";
import { COMPACT_ORDERBOOK_ROW_GRID_CLASS, fitsCompactOrderbookRow } from "@/lib/ui/orderbook-layout";
import type { OrderbookLevelPulseEvent } from "@/lib/ui/orderbook-level-pulses";
import { useOrderbookActions } from "@/stores/use-orderbook-actions-store";
import { OrderbookLevelPulse } from "./orderbook-level-pulse";
import { OrderbookSizeCell } from "./orderbook-size-cell";

interface Props {
	flashResetKey: string;
	level: BookLevel;
	marketName: string;
	side: "ask" | "bid";
	maxTotal: string;
	priceDecimals: number;
	showInQuote?: boolean;
	szDecimals: number;
	compact?: boolean;
	ladderWidthPx?: number;
	disabled?: boolean;
	rank?: number;
	hoverState?: "active" | "range";
	tooltipId?: string;
	pulse?: OrderbookLevelPulseEvent;
	onPulseEnd?: (id: number) => void;
}

function OrderbookRowComponent({
	flashResetKey,
	level,
	marketName,
	side,
	maxTotal,
	priceDecimals,
	showInQuote = false,
	szDecimals,
	compact = false,
	ladderWidthPx,
	disabled = false,
	rank,
	hoverState,
	tooltipId,
	pulse,
	onPulseEnd,
}: Props) {
	const { t } = useLingui();
	const { formatNumber } = useNumberFormat();
	const { setSelectedPrice } = useOrderbookActions();
	const isAsk = side === "ask";

	const sizeValue = showInQuote ? level.quoteSize : level.size;
	const totalValue = showInQuote ? level.quoteTotal : level.total;
	const depthPct = getDepthPercentage(totalValue, maxTotal);

	const sizeDecimals = showInQuote ? getOrderbookQuoteDecimals(sizeValue) : szDecimals;
	const totalDecimals = showInQuote ? getOrderbookQuoteDecimals(totalValue) : szDecimals;
	const priceText = formatNumber(level.price, priceDecimals);
	const fullSizeText = formatNumber(sizeValue, sizeDecimals);
	const sizeText =
		compact && ladderWidthPx && !fitsCompactOrderbookRow(priceText, fullSizeText, ladderWidthPx)
			? formatCompactOrderbookSize(sizeValue, fullSizeText, formatNumber)
			: fullSizeText;
	const totalText = formatNumber(totalValue, totalDecimals);
	const sideText = isAsk ? t`Ask` : t`Bid`;
	const ariaLabel = `${sideText}, ${t`Price`} ${priceText}, ${t`Size`} ${fullSizeText}, ${t`Total`} ${totalText}. ${t`Use ${priceText} as limit price`}`;

	return (
		<button
			type="button"
			disabled={disabled}
			onClick={() => {
				setSelectedPrice(marketName, level.price);
			}}
			data-orderbook-side={side}
			data-orderbook-rank={rank}
			data-orderbook-price={level.price}
			data-orderbook-hover={disabled ? undefined : hoverState}
			data-orderbook-hover-edge={isAsk ? "top" : "bottom"}
			aria-describedby={!disabled && hoverState === "active" ? tooltipId : undefined}
			aria-label={ariaLabel}
			className={cn(
				"orderbook-row group relative block w-full shrink-0 cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stroke-focus disabled:cursor-default",
				compact ? "h-[var(--orderbook-row-height,24px)]" : "h-[var(--orderbook-row-height,23px)]",
			)}
		>
			<span
				className={cn("absolute inset-y-0 pointer-events-none", isAsk ? "depth-bar-ask" : "depth-bar-bid")}
				style={{
					width: `${depthPct}%`,
					left: 0,
				}}
			/>
			{!disabled && pulse && onPulseEnd && (
				<OrderbookLevelPulse key={pulse.id} event={pulse} onAnimationEnd={onPulseEnd} />
			)}
			<span
				className={cn(
					"grid h-full items-center gap-1 tabular-nums py-0.5 relative z-10",
					compact ? COMPACT_ORDERBOOK_ROW_GRID_CLASS : "orderbook-grid px-2 text-xs",
				)}
			>
				<span className="min-w-0 whitespace-nowrap text-start">
					<span
						data-slot="orderbook-price-text"
						className={cn("inline-block align-top", isAsk ? "orderbook-price-ask" : "orderbook-price-bid")}
					>
						{priceText}
					</span>
				</span>
				<OrderbookSizeCell
					className="flex min-w-0 justify-end whitespace-nowrap orderbook-value-text"
					displayValue={sizeText}
					resetKey={flashResetKey}
					value={level.size}
				/>
				{!compact && (
					<span className="flex min-w-0 justify-end whitespace-nowrap orderbook-value-text">
						<span data-slot="orderbook-total-value">{totalText}</span>
					</span>
				)}
			</span>
		</button>
	);
}

function areEqual(prev: Props, next: Props): boolean {
	return (
		prev.pulse === next.pulse &&
		prev.onPulseEnd === next.onPulseEnd &&
		prev.flashResetKey === next.flashResetKey &&
		prev.marketName === next.marketName &&
		prev.side === next.side &&
		prev.maxTotal === next.maxTotal &&
		prev.priceDecimals === next.priceDecimals &&
		prev.showInQuote === next.showInQuote &&
		prev.szDecimals === next.szDecimals &&
		prev.disabled === next.disabled &&
		prev.rank === next.rank &&
		prev.hoverState === next.hoverState &&
		prev.tooltipId === next.tooltipId &&
		prev.level.price === next.level.price &&
		prev.level.size === next.level.size &&
		prev.level.total === next.level.total &&
		prev.level.quoteSize === next.level.quoteSize &&
		prev.level.quoteTotal === next.level.quoteTotal &&
		prev.compact === next.compact &&
		prev.ladderWidthPx === next.ladderWidthPx
	);
}

export const OrderbookRow = memo(OrderbookRowComponent, areEqual);
