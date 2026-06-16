import { get24hChange } from "@/domain/market";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { useSelectedMarketInfo } from "@/lib/hyperliquid";
import { toNumberOrZero } from "@/lib/trade/numbers";
import { getValueColorClass } from "@/lib/ui/value-color";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useMarketActions } from "@/stores/use-market-store";
import { TokenSelector } from "../chart/token-selector";
import { MobileBookView } from "./mobile-book-view";
import { MobilePositionsView } from "./mobile-positions-view";
import { MobileTradeView } from "./mobile-trade-view";

export function MobileTradeLayout() {
	const { data: market } = useSelectedMarketInfo();
	const { scope } = useExchangeScope();
	const { setSelectedMarket } = useMarketActions();

	const markPx = toNumberOrZero(market?.markPx);
	const change24h = get24hChange(market?.prevDayPx, market?.markPx);

	return (
		<div className="flex flex-col h-full min-h-0 bg-background">
			<div className="shrink-0 px-3 py-2 border-b border-stroke-weak/60 bg-surface flex items-center justify-between">
				<TokenSelector selectedMarket={market} onValueChange={(name) => setSelectedMarket(scope, name)} />
				<div className="text-right">
					<div
						className={cn(
							"text-sm font-semibold tabular-nums",
							change24h !== null ? getValueColorClass(change24h) : "text-fg",
						)}
					>
						{formatPrice(markPx || null, { szDecimals: market?.szDecimals })}
					</div>
					{typeof change24h === "number" && (
						<div className={cn("text-xs tabular-nums", getValueColorClass(change24h))}>
							{change24h >= 0 ? "+" : ""}
							{change24h.toFixed(2)}%
						</div>
					)}
				</div>
			</div>

			<div className="flex-[1.4] min-h-0 flex">
				<MobileTradeView embedded className="flex-[1.7] min-w-0 border-r border-stroke-weak/60" />
				<MobileBookView embedded className="flex-1 min-w-0" />
			</div>

			<div className="flex-1 min-h-0 border-t border-stroke-weak/60">
				<MobilePositionsView />
			</div>
		</div>
	);
}
