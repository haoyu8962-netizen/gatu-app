import { t } from "@lingui/core/macro";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useSelectedMarketInfo } from "@/lib/hyperliquid";
import type { SizeMode } from "@/lib/trade/types";
import { useExchangeScope } from "@/providers/exchange-scope";
import { MobileBalancesTab } from "./mobile-balances-tab";
import { MobileBookView } from "./mobile-book-view";
import { MobileChartView } from "./mobile-chart-view";
import { MobileMarketBar } from "./mobile-market-bar";
import { MobilePositionsView } from "./mobile-positions-view";
import { MobileTradeView } from "./mobile-trade-view";
import type { MobilePositionsDisclosureStates } from "./use-mobile-disclosure-set";

type TopView = "chart" | "book" | "trades";

interface Props {
	active?: boolean;
	showMarketBar?: boolean;
	showOrderForm?: boolean;
	disclosureStates: MobilePositionsDisclosureStates;
}

export function MobileTradeLayout({
	active = true,
	showMarketBar = false,
	showOrderForm = true,
	disclosureStates,
}: Props) {
	return showOrderForm ? (
		<TradeOrderView active={active} showMarketBar={showMarketBar} disclosureStates={disclosureStates} />
	) : (
		<MarketsDataView active={active} showMarketBar={showMarketBar} disclosureStates={disclosureStates} />
	);
}

function TradeOrderView({
	active,
	showMarketBar,
	disclosureStates,
}: {
	active: boolean;
	showMarketBar: boolean;
	disclosureStates: MobilePositionsDisclosureStates;
}) {
	const { data: selectedMarket } = useSelectedMarketInfo();
	const { routeMarketName } = useExchangeScope();
	const [sizeMode, setSizeMode] = useState<SizeMode>("quote");
	const marketKey = routeMarketName ?? selectedMarket?.name ?? "default";

	return (
		<div
			className={cn(
				"h-full min-h-0 bg-background [overflow-anchor:none]",
				"overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
			)}
		>
			{showMarketBar && <MobileMarketBar className="min-h-[61px]" />}

			<div className="w-full min-w-0 min-h-[370px] flex items-stretch">
				<MobileTradeView
					key={marketKey}
					embedded
					sizeMode={sizeMode}
					onSizeModeChange={setSizeMode}
					className="flex-[1.53] min-w-0 border-r border-stroke-weak/60"
				/>
				<div className="relative flex-1 min-w-0 self-stretch">
					<MobileBookView compact inTabLayout view="book" className="absolute inset-0" />
				</div>
			</div>

			{active && (
				<div className="w-full min-w-0 min-h-0 flex flex-col border-t border-stroke-weak/60">
					<MobilePositionsView
						scrollMode="page"
						includeBottomNavSpacer={false}
						balancesContent={<MobileBalancesTab />}
						disclosureStates={disclosureStates}
					/>
				</div>
			)}
		</div>
	);
}

function MarketsDataView({
	active,
	showMarketBar,
	disclosureStates,
}: {
	active: boolean;
	showMarketBar: boolean;
	disclosureStates: MobilePositionsDisclosureStates;
}) {
	const [topView, setTopView] = useState<TopView>("chart");

	const tabs: { value: TopView; label: string }[] = [
		{ value: "chart", label: t`Chart` },
		{ value: "book", label: t`Order Book` },
		{ value: "trades", label: t`Trades` },
	];

	const bookView = topView === "trades" ? "trades" : "book";

	return (
		<div
			className={cn(
				"h-full min-h-0 bg-background [overflow-anchor:none]",
				"overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
			)}
		>
			{showMarketBar && <MobileMarketBar className="min-h-[61px]" />}

			<div className="h-[35px] min-h-[35px] shrink-0 flex overflow-hidden">
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

			<div className="relative h-[45dvh] min-h-[320px] overflow-hidden">
				<div
					aria-hidden={topView !== "chart"}
					className={cn(
						"absolute inset-0 flex min-h-0 flex-col",
						topView === "chart" ? "z-10 opacity-100 pointer-events-auto" : "z-0 opacity-0 pointer-events-none",
					)}
				>
					<MobileChartView active={active && topView === "chart"} />
				</div>
				{topView !== "chart" && active && (
					<div className="absolute inset-0 z-10 flex min-h-0 flex-col bg-background">
						<MobileBookView inTabLayout view={bookView} className="flex-1 min-h-0" />
					</div>
				)}
			</div>

			{active && (
				<div className="w-full min-w-0 min-h-0 flex flex-col border-t border-stroke-weak/60">
					<MobilePositionsView
						scrollMode="page"
						includeBottomNavSpacer={false}
						balancesContent={<MobileBalancesTab />}
						disclosureStates={disclosureStates}
					/>
				</div>
			)}
		</div>
	);
}
