import { useLingui } from "@lingui/react/macro";
import { ArrowsLeftRightIcon } from "@phosphor-icons/react";
import { useMemo, useRef } from "react";
import { getBaseQuoteFromPairName } from "@/domain/market";
import { cn } from "@/lib/cn";
import { useSelectedMarketInfo, useSubscription } from "@/lib/hyperliquid";
import { getTradePriceDecimals, processTrades } from "@/lib/trade/trades";
import { useGlobalSettings, useGlobalSettingsActions, useIsTestnet } from "@/stores/use-global-settings-store";
import { TradeRow } from "./trade-row";

export function TradesPanel({ compact = false }: { compact?: boolean }) {
	const { t } = useLingui();
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
	const isTestnet = useIsTestnet();

	const { baseToken, quoteToken } = useMemo(() => {
		if (!selectedMarket) return { baseToken: "", quoteToken: "" };
		return getBaseQuoteFromPairName(selectedMarket.pairName, selectedMarket.kind);
	}, [selectedMarket]);

	const szDecimals = selectedMarket?.szDecimals ?? 4;
	const marketType = selectedMarket?.kind === "spot" ? "spot" : "perp";
	const priceDecimals = getTradePriceDecimals(selectedMarket?.markPx, szDecimals, marketType);
	const processed = useMemo(() => processTrades(trades ?? []), [trades]);
	const initialTradeIds = useRef<Set<string> | null>(null);
	if (initialTradeIds.current === null && processed.length > 0) {
		initialTradeIds.current = new Set(processed.map((trade) => trade.id));
	}
	const displayAsset = showOrderbookInQuote ? quoteToken : baseToken;
	const toggleAssetDisplay = () => setShowOrderbookInQuote(!showOrderbookInQuote);

	return (
		<div className="flex-1 min-h-0 flex flex-col">
			<div
				className={cn(
					"grid items-center text-fg uppercase tracking-wider border-b border-stroke-weak/40",
					compact ? "grid-cols-2 gap-2 px-1.5 h-7 text-2xs" : "trades-grid gap-1 px-2 h-8 text-xs",
				)}
			>
				<div className="min-w-0 truncate text-left">{t`Price`}</div>
				<button
					type="button"
					onClick={toggleAssetDisplay}
					className="min-w-0 overflow-hidden text-right hover:text-fg transition-colors"
				>
					<span className="flex min-w-0 items-center justify-end gap-0.5">
						<span className="shrink-0">{t`Size`}</span>
						<span className="trades-asset-heading min-w-0 truncate text-fg">({displayAsset})</span>
						<ArrowsLeftRightIcon className="size-2 shrink-0 opacity-40" />
					</span>
				</button>
				{!compact && <div className="min-w-0 truncate text-right">{t`Time`}</div>}
			</div>

			{status === "error" ? (
				<div className="flex-1 flex items-center justify-center px-2 py-6 text-xs text-fg">
					{error instanceof Error ? error.message : t`Failed to load trades.`}
				</div>
			) : processed.length > 0 ? (
				<div className="flex-1 min-h-0 overflow-y-auto">
					<div className={cn("py-1 space-y-px", compact ? "px-1.5" : "px-2")}>
						{processed.map((trade) => (
							<TradeRow
								key={trade.id}
								trade={trade}
								priceDecimals={priceDecimals}
								szDecimals={szDecimals}
								showInQuote={showOrderbookInQuote}
								isTestnet={isTestnet}
								compact={compact}
								initial={initialTradeIds.current?.has(trade.id)}
							/>
						))}
					</div>
				</div>
			) : status === "active" && trades !== undefined ? (
				<div className="flex-1 flex items-center justify-center px-2 py-6 text-xs text-fg-muted">
					{t`No recent trades.`}
				</div>
			) : (
				<div data-slot="trades-pending" className="flex-1 min-h-0" aria-hidden="true" />
			)}
		</div>
	);
}
