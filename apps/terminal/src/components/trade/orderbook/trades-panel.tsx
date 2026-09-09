import { useLingui } from "@lingui/react/macro";
import { useMemo, useRef } from "react";
import { getBaseQuoteFromPairName } from "@/domain/market";
import { cn } from "@/lib/cn";
import { useSelectedMarketInfo, useSubscription } from "@/lib/hyperliquid";
import { getTradePriceDecimals, processTrades } from "@/lib/trade/trades";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { TradeRow } from "./trade-row";

interface Props {
	compact?: boolean;
	quietErrors?: boolean;
	showInQuote: boolean;
}

export function TradesPanel({ compact = false, quietErrors = false, showInQuote }: Props) {
	const { t } = useLingui();
	const { data: selectedMarket } = useSelectedMarketInfo();
	const subscriptionCoin = selectedMarket?.name ?? "";
	const params = useMemo(() => ({ coin: subscriptionCoin }), [subscriptionCoin]);
	const { data: trades, status } = useSubscription("trades", params, {
		enabled: !!selectedMarket && !!subscriptionCoin,
	});
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
	const displayAsset = showInQuote ? quoteToken : baseToken;
	const showError = status === "error" && !quietErrors;
	const showRows = status !== "error" && processed.length > 0;
	const showEmpty = status === "active" && trades !== undefined && processed.length === 0;

	return (
		<div className="flex-1 min-h-0 flex flex-col">
			<div
				className={cn(
					"grid items-center text-fg uppercase tracking-wider border-b border-stroke-weak/40",
					compact ? "grid-cols-2 gap-2 px-1.5 h-7 text-2xs" : "trades-grid gap-1 px-2 h-8 text-xs",
				)}
			>
				<div className="min-w-0 truncate text-left">{t`Price`}</div>
				<div className="min-w-0 overflow-hidden text-right">
					<span className="flex min-w-0 items-center justify-end gap-0.5">
						<span className="shrink-0">{t`Size`}</span>
						<span className="trades-asset-heading min-w-0 truncate text-fg">({displayAsset})</span>
					</span>
				</div>
				{!compact && <div className="min-w-0 truncate text-right">{t`Time`}</div>}
			</div>

			{showError ? (
				<div className="flex-1 flex items-center justify-center px-2 py-6 text-xs text-fg">
					{t`Failed to load trades.`}
				</div>
			) : null}
			{showRows ? (
				<div className="flex-1 min-h-0 overflow-y-auto">
					<div className={cn("py-1 space-y-px", compact ? "px-1.5" : "px-2")}>
						{processed.map((trade) => (
							<TradeRow
								key={trade.id}
								trade={trade}
								priceDecimals={priceDecimals}
								szDecimals={szDecimals}
								showInQuote={showInQuote}
								isTestnet={isTestnet}
								compact={compact}
								initial={initialTradeIds.current?.has(trade.id)}
							/>
						))}
					</div>
				</div>
			) : null}
			{showEmpty ? (
				<div className="flex-1 flex items-center justify-center px-2 py-6 text-xs text-fg-muted">
					{t`No recent trades.`}
				</div>
			) : null}
			{!showError && !showRows && !showEmpty ? (
				<div data-slot="trades-pending" className="flex-1 min-h-0" aria-hidden="true" />
			) : null}
		</div>
	);
}
