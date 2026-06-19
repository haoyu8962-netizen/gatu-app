import { t } from "@lingui/core/macro";
import { useEffect, useState } from "react";
import type { MobilePositionsTabValue } from "@/config/trade";
import { cn } from "@/lib/cn";
import { usePositionsActiveTab } from "@/stores/use-global-settings-store";
import { MobileBookView } from "./mobile-book-view";
import { MobileChartView } from "./mobile-chart-view";
import { MobileMarketBar } from "./mobile-market-bar";
import type { MobileDataScrollMode } from "./mobile-positions-view";
import { MobilePositionsView } from "./mobile-positions-view";
import { MobileTradeView } from "./mobile-trade-view";

type TopView = "chart" | "book" | "trades";

const MARKETS_PAGE_SCROLL_TABS: readonly MobilePositionsTabValue[] = ["positions", "orders", "balances", "twap"];

interface Props {
	/** Trade page is a fixed order-form ∥ orderbook split; Markets page is chart/book/trades data only. */
	showOrderForm?: boolean;
}

export function MobileTradeLayout({ showOrderForm = true }: Props) {
	return showOrderForm ? <TradeOrderView /> : <MarketsDataView />;
}

function TradeOrderView() {
	const activeDataTab = usePositionsActiveTab() as MobilePositionsTabValue;
	const [dataPanelNeedsPageScroll, setDataPanelNeedsPageScroll] = useState(false);
	const dataScrollMode: MobileDataScrollMode = dataPanelNeedsPageScroll ? "page" : "contained";
	const isPageScroll = dataScrollMode === "page";

	useEffect(() => {
		void activeDataTab;
		setDataPanelNeedsPageScroll(false);
	}, [activeDataTab]);

	return (
		<div
			className={cn(
				"grid h-full min-h-0 bg-background",
				isPageScroll
					? "grid-rows-[minmax(57px,auto)_minmax(420px,52dvh)_auto] overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
					: "grid-rows-[minmax(57px,auto)_minmax(0,2.4fr)_minmax(0,0.8fr)] overflow-hidden",
			)}
		>
			<MobileMarketBar />

			<div className="w-full min-w-0 min-h-0 overflow-hidden flex items-stretch">
				<MobileTradeView embedded className="flex-[1.2] min-h-0 min-w-0 border-r border-stroke-weak/60" />
				<MobileBookView compact inTabLayout view="book" className="flex-1 min-h-0 min-w-0 self-stretch" />
			</div>

			<div
				className={cn(
					"w-full min-w-0 flex flex-col border-t border-stroke-weak/60",
					isPageScroll ? "min-h-0 overflow-visible" : "min-h-0 overflow-hidden",
				)}
			>
				<MobilePositionsView scrollMode={dataScrollMode} onNeedsPageScrollChange={setDataPanelNeedsPageScroll} />
			</div>
		</div>
	);
}

function MarketsDataView() {
	const [topView, setTopView] = useState<TopView>("chart");
	const activeDataTab = usePositionsActiveTab() as MobilePositionsTabValue;
	const [dataPanelNeedsPageScroll, setDataPanelNeedsPageScroll] = useState(false);
	const prefersPageScroll = MARKETS_PAGE_SCROLL_TABS.includes(activeDataTab);
	const dataScrollMode: MobileDataScrollMode = dataPanelNeedsPageScroll || prefersPageScroll ? "page" : "contained";
	const isPageScroll = dataScrollMode === "page";

	useEffect(() => {
		void activeDataTab;
		setDataPanelNeedsPageScroll(false);
	}, [activeDataTab]);

	const tabs: { value: TopView; label: string }[] = [
		{ value: "chart", label: t`Chart` },
		{ value: "book", label: t`Order Book` },
		{ value: "trades", label: t`Trades` },
	];

	const bookView = topView === "trades" ? "trades" : "book";

	return (
		<div
			className={cn(
				"grid h-full min-h-0 bg-background",
				isPageScroll
					? "grid-rows-[minmax(57px,auto)_auto_minmax(320px,45dvh)_auto] overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
					: "grid-rows-[minmax(57px,auto)_auto_minmax(0,1.4fr)_minmax(0,1fr)] overflow-hidden",
			)}
		>
			<MobileMarketBar />

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

			<div className="min-h-0 flex flex-col overflow-hidden">
				{topView === "chart" && <MobileChartView />}
				{topView !== "chart" && <MobileBookView inTabLayout view={bookView} className="flex-1 min-h-0" />}
			</div>

			<div
				className={cn(
					"w-full min-w-0 flex flex-col border-t border-stroke-weak/60",
					isPageScroll ? "min-h-0 overflow-visible" : "min-h-0 overflow-hidden",
				)}
			>
				<MobilePositionsView scrollMode={dataScrollMode} onNeedsPageScrollChange={setDataPanelNeedsPageScroll} />
			</div>
		</div>
	);
}
