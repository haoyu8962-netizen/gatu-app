import { Tooltip } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { memo } from "react";
import { useLongPressTooltip } from "@/hooks/ui/use-long-press-tooltip";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { type BookLevel, getDepthPercentage, getOrderbookQuoteDecimals } from "@/lib/trade/orderbook";
import { useOrderbookActions } from "@/stores/use-orderbook-actions-store";
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
	disabled?: boolean;
	baseAsset?: string;
	quoteAsset?: string;
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
	disabled = false,
	baseAsset,
	quoteAsset,
}: Props) {
	const { t } = useLingui();
	useNumberFormatRevision();
	const { setSelectedPrice } = useOrderbookActions();
	const isAsk = side === "ask";

	const sizeValue = showInQuote ? level.quoteSize : level.size;
	const totalValue = showInQuote ? level.quoteTotal : level.total;
	const depthPct = getDepthPercentage(totalValue, maxTotal);

	const sizeDecimals = showInQuote ? getOrderbookQuoteDecimals(sizeValue) : szDecimals;
	const totalDecimals = showInQuote ? getOrderbookQuoteDecimals(totalValue) : szDecimals;
	const priceText = formatNumber(level.price, priceDecimals);
	const sizeText = formatNumber(sizeValue, { decimals: sizeDecimals, compact: true });
	const totalText = formatNumber(totalValue, { decimals: totalDecimals, compact: true });
	const cumulativeBaseText = formatNumber(level.total, { decimals: szDecimals, compact: true });
	const cumulativeQuoteText = formatNumber(level.quoteTotal, {
		decimals: getOrderbookQuoteDecimals(level.quoteTotal),
		compact: true,
	});
	const sideText = isAsk ? t`Ask` : t`Bid`;
	const ariaLabel = `${sideText}, ${t`Price`} ${priceText}, ${t`Size`} ${sizeText}, ${t`Total`} ${totalText}. ${t`Use ${priceText} as limit price`}`;
	const longPressTooltip = useLongPressTooltip({ enabled: compact && !disabled });

	const row = (
		<button
			type="button"
			disabled={disabled}
			onClick={() => {
				if (longPressTooltip.consumeLongPressClick()) return;
				setSelectedPrice(marketName, level.price);
			}}
			title={compact ? undefined : priceText}
			aria-label={ariaLabel}
			{...longPressTooltip.handlers}
			className={cn(
				"group relative block w-full shrink-0 cursor-pointer bg-surface text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stroke-focus disabled:cursor-default",
				compact ? "hover:bg-trading-panel-card" : "hover:bg-fill-hover",
				compact ? "h-[24px]" : "h-[23px]",
			)}
		>
			<span
				className={cn("absolute inset-y-0 pointer-events-none", isAsk ? "depth-bar-ask" : "depth-bar-bid")}
				style={{
					width: `${depthPct}%`,
					left: 0,
				}}
			/>
			<span
				className={cn(
					"grid gap-1 tabular-nums py-0.5 relative z-10",
					compact ? "grid-cols-2 pl-2 pr-3 text-xs" : "orderbook-grid px-2 text-xs",
				)}
			>
				<span title={compact ? undefined : priceText} className="min-w-0 truncate text-left">
					<span
						data-slot="orderbook-price-text"
						className={cn(
							"inline-block max-w-full truncate align-top bg-surface",
							compact ? "group-hover:bg-trading-panel-card" : "group-hover:bg-fill-hover",
							isAsk ? "orderbook-price-ask" : "orderbook-price-bid",
						)}
					>
						{priceText}
					</span>
				</span>
				<OrderbookSizeCell
					className={cn("min-w-0 truncate text-right", compact ? "text-trading-panel-muted" : "orderbook-value-text")}
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

	if (!compact) return row;

	return (
		<Tooltip
			open={longPressTooltip.open}
			onOpenChange={longPressTooltip.onOpenChange}
			closeOnClick={false}
			delay={300}
			side="left"
			sideOffset={4}
			content={
				<span data-slot="orderbook-cumulative-tooltip" className="grid gap-1 tabular-nums">
					<span>
						{t`Total`}
						{baseAsset ? ` (${baseAsset})` : ""}: {cumulativeBaseText}
					</span>
					<span>
						{t`Total notional`}
						{quoteAsset ? ` (${quoteAsset})` : ""}: {cumulativeQuoteText}
					</span>
				</span>
			}
		>
			{row}
		</Tooltip>
	);
}

function areEqual(prev: Props, next: Props): boolean {
	return (
		prev.flashResetKey === next.flashResetKey &&
		prev.marketName === next.marketName &&
		prev.side === next.side &&
		prev.maxTotal === next.maxTotal &&
		prev.priceDecimals === next.priceDecimals &&
		prev.showInQuote === next.showInQuote &&
		prev.szDecimals === next.szDecimals &&
		prev.disabled === next.disabled &&
		prev.baseAsset === next.baseAsset &&
		prev.quoteAsset === next.quoteAsset &&
		prev.level.price === next.level.price &&
		prev.level.size === next.level.size &&
		prev.level.total === next.level.total &&
		prev.level.quoteSize === next.level.quoteSize &&
		prev.level.quoteTotal === next.level.quoteTotal &&
		prev.compact === next.compact
	);
}

export const OrderbookRow = memo(OrderbookRowComponent, areEqual);
