import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { memo } from "react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { getExplorerTxUrl } from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { getTradeQuoteSize, type ProcessedTrade } from "@/lib/trade/trades";

interface Props {
	trade: ProcessedTrade;
	priceDecimals: number;
	szDecimals: number;
	showInQuote: boolean;
	isTestnet: boolean;
	compact?: boolean;
}

function TradeRowComponent({ trade, priceDecimals, szDecimals, showInQuote, isTestnet, compact = false }: Props) {
	useNumberFormatRevision();
	const priceDisplay = formatNumber(trade.price, priceDecimals);
	const sizeDisplay = showInQuote
		? formatNumber(getTradeQuoteSize(trade.price, trade.size), 2)
		: formatNumber(trade.size, szDecimals);

	return (
		<a
			href={getExplorerTxUrl(trade.hash, isTestnet)}
			target="_blank"
			rel="noopener noreferrer"
			className={cn(
				"grid h-6 items-center tabular-nums hover:bg-fill-hover group",
				compact ? "grid-cols-2 gap-2 text-2xs" : "trades-grid gap-1 text-xs",
				trade.side === "buy" ? "trade-row-buy" : "trade-row-sell",
			)}
		>
			<div
				className={cn("min-w-0 truncate text-left font-medium", trade.side === "buy" ? "text-success" : "text-error")}
				title={priceDisplay}
			>
				{priceDisplay}
			</div>
			<div className="min-w-0 truncate text-right text-fg" title={sizeDisplay}>
				{sizeDisplay}
			</div>
			{!compact && (
				<div className="min-w-0 overflow-hidden text-right text-fg" title={trade.time}>
					<span className="flex min-w-0 items-center justify-end gap-1 overflow-hidden">
						<span className="min-w-0 truncate">{trade.time}</span>
						<ArrowSquareOutIcon className="size-2.5 shrink-0 opacity-100 group-hover:opacity-80" aria-hidden="true" />
					</span>
				</div>
			)}
		</a>
	);
}

export const TradeRow = memo(TradeRowComponent);
