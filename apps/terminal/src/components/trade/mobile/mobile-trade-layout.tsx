import { t } from "@lingui/core/macro";
import { useState } from "react";
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
import { MobileChartView } from "./mobile-chart-view";
import { MobilePositionsView } from "./mobile-positions-view";
import { MobileTradeView } from "./mobile-trade-view";

type TopView = "chart" | "book" | "trades";

export function MobileTradeLayout() {
	const { data: market } = useSelectedMarketInfo();
	const { scope } = useExchangeScope();
	const { setSelectedMarket } = useMarketActions();
	const [topView, setTopView] = useState<TopView>("book");

	const markPx = toNumberOrZero(market?.markPx);
	const change24h = get24hChange(market?.prevDayPx, market?.markPx);

	const tabs: { value: TopView; label: string }[] = [
		{ value: "chart", label: t`Chart` },
		{ value: "book", label: t`Order Book` },
		{ value: "trades", label: t`Trades` },
	];

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

			<div className="shrink-0 flex">
				{tabs.map((tab) => {
					const active = topView === tab.value;
					return (
						<button
							key={tab.value}
							type="button"
							onClick={() => setTopView(tab.value)}
							className={cn(
								"flex-1 py-2 text-xs font-medium border-b-2 transition-colors motion-reduce:transition-none",
								active ? "text-fg border-fg" : "text-fg-muted border-stroke-weak hover:text-fg",
							)}
						>
							{tab.label}
						</button>
					);
				})}
			</div>

			<div className="flex-[1.4] min-h-0">
				{topView === "chart" ? (
					<MobileChartView />
				) : (
					<div className="flex h-full">
						<MobileTradeView embedded className="flex-[1.7] min-w-0 border-r border-stroke-weak/60" />
						<MobileBookView embedded view={topView === "trades" ? "trades" : "book"} className="flex-1 min-w-0" />
					</div>
				)}
			</div>

			<div className="flex-1 min-h-0 border-t border-stroke-weak/60">
				<MobilePositionsView />
			</div>
		</div>
	);
}
