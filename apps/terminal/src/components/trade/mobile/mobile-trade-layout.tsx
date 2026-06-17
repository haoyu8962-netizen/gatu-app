import { t } from "@lingui/core/macro";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { MobileBookView } from "./mobile-book-view";
import { MobileChartView } from "./mobile-chart-view";
import { MobileMarketBar } from "./mobile-market-bar";
import { MobilePositionsView } from "./mobile-positions-view";
import { MobileTradeView } from "./mobile-trade-view";

type TopView = "chart" | "book" | "trades";

interface Props {
	/** Trade page shows the order form (split view); Markets page is chart/book/trades only. */
	showOrderForm?: boolean;
}

export function MobileTradeLayout({ showOrderForm = true }: Props) {
	const [topView, setTopView] = useState<TopView>(showOrderForm ? "book" : "chart");

	const tabs: { value: TopView; label: string }[] = [
		{ value: "chart", label: t`Chart` },
		{ value: "book", label: t`Order Book` },
		{ value: "trades", label: t`Trades` },
	];

	const bookView = topView === "trades" ? "trades" : "book";

	return (
		<div className="flex flex-col h-full min-h-0 bg-background">
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

			<div className="flex-[1.4] min-h-0">
				{topView === "chart" && <MobileChartView />}
				{topView !== "chart" && showOrderForm && (
					<div className="flex h-full">
						<MobileTradeView embedded className="flex-[1.7] min-w-0 border-r border-stroke-weak/60" />
						<MobileBookView compact inTabLayout view={bookView} className="flex-1 min-w-0" />
					</div>
				)}
				{topView !== "chart" && !showOrderForm && <MobileBookView inTabLayout view={bookView} className="h-full" />}
			</div>

			<div className="flex-1 min-h-0 border-t border-stroke-weak/60">
				<MobilePositionsView />
			</div>
		</div>
	);
}
