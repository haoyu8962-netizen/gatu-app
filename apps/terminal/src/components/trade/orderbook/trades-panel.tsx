import { t } from "@lingui/core/macro";
import { ArrowSquareOutIcon, ArrowsLeftRightIcon } from "@phosphor-icons/react";
import { memo, useMemo } from "react";
import { getBaseQuoteFromPairName } from "@/domain/market";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { getExplorerTxUrl, useSelectedMarketInfo, useSubscription } from "@/lib/hyperliquid";
import { type ProcessedTrade, processTrades } from "@/lib/trade/trades";
import { useGlobalSettings, useGlobalSettingsActions } from "@/stores/use-global-settings-store";

interface Props {
	trade: ProcessedTrade;
	szDecimals: number;
	showInQuote: boolean;
	compact?: boolean;
}

const TradeRow = memo(function TradeRow({ trade, szDecimals, showInQuote, compact = false }: Props) {
	const sizeDisplay = showInQuote ? formatNumber(trade.price * trade.size, 2) : formatNumber(trade.size, szDecimals);

	return (
		<a
			href={getExplorerTxUrl(trade.hash)}
			target="_blank"
			rel="noopener noreferrer"
			className={cn(
				"grid gap-2 tabular-nums py-0.5 hover:bg-fill-hover group",
				compact ? "grid-cols-2 text-2xs" : "grid-cols-3 text-xs",
				trade.side === "buy" ? "trade-row-buy" : "trade-row-sell",
			)}
		>
			{!compact && (
				<div className="text-fg flex items-center gap-1">
					{trade.time}
					<ArrowSquareOutIcon className="size-2.5 opacity-100 hover:opacity-80" aria-hidden="true" />
				</div>
			)}
			<div
				className={cn(
					"font-medium",
					compact ? "text-left" : "text-right",
					trade.side === "buy" ? "text-success" : "text-error",
				)}
			>
				{formatNumber(trade.price, 2)}
			</div>
			<div className="text-right text-fg">{sizeDisplay}</div>
		</a>
	);
});

export function TradesPanel({ compact = false }: { compact?: boolean }) {
	const { data: selectedMarket } = useSelectedMarketInfo();
	const subscriptionCoin = selectedMarket?.name ?? "";
	const params = useMemo(() => ({ coin: subscriptionCoin }), [subscriptionCoin]);
	const {
		data: trades,
		status,
		error,
	} = useSubscription("trades", params, {
		enabled: !!selectedMarket && !!subscriptionCoin,
	});
	const { showOrderbookInQuote } = useGlobalSettings();
	const { setShowOrderbookInQuote } = useGlobalSettingsActions();

	const { baseToken, quoteToken } = useMemo(() => {
		if (!selectedMarket) return { baseToken: "", quoteToken: "" };
		return getBaseQuoteFromPairName(selectedMarket.pairName, selectedMarket.kind);
	}, [selectedMarket]);

	const szDecimals = selectedMarket?.szDecimals ?? 4;
	const processed = useMemo(() => processTrades(trades ?? []), [trades]);
	const displayAsset = showOrderbookInQuote ? quoteToken : baseToken;
	const toggleAssetDisplay = () => setShowOrderbookInQuote(!showOrderbookInQuote);

	return (
		<div className="flex-1 min-h-0 flex flex-col">
			<div
				className={cn(
					"grid gap-2 items-center text-fg uppercase tracking-wider border-b border-stroke-weak/40",
					compact ? "grid-cols-2 px-1.5 h-7 text-2xs" : "grid-cols-3 px-2 h-9 text-xs",
				)}
			>
				{!compact && <div>{t`Time`}</div>}
				<div className={compact ? "text-left" : "text-right"}>{t`Price`}</div>
				<button
					type="button"
					onClick={toggleAssetDisplay}
					className="text-right hover:text-fg transition-colors inline-flex items-center justify-end gap-0.5"
				>
					{t`Size`}
					<span className="text-fg">({displayAsset})</span>
					<ArrowsLeftRightIcon className="size-2 opacity-40" />
				</button>
			</div>

			{status === "error" ? (
				<div className="flex-1 flex items-center justify-center px-2 py-6 text-xs text-fg">
					{error instanceof Error ? error.message : t`Failed to load trades.`}
				</div>
			) : processed.length === 0 ? (
				<div className="flex-1 flex items-center justify-center px-2 py-6 text-xs text-fg">
					{t`Waiting for trades...`}
				</div>
			) : (
				<div className="flex-1 min-h-0 overflow-y-auto">
					<div className={cn("py-1 space-y-px", compact ? "px-1.5" : "px-2")}>
						{processed.map((trade) => (
							<TradeRow
								key={trade.id}
								trade={trade}
								szDecimals={szDecimals}
								showInQuote={showOrderbookInQuote}
								compact={compact}
							/>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
