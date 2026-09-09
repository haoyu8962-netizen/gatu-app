import { useLingui } from "@lingui/react/macro";
import { type KeyboardEvent, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useSelectedMarketInfo } from "@/lib/hyperliquid";
import type { SizeMode } from "@/lib/trade/types";
import { useExchangeScope } from "@/providers/exchange-scope";
import { MobileBalancesTab } from "./mobile-balances-tab";
import { MobileBookView } from "./mobile-book-view";
import { MobileChartView } from "./mobile-chart-view";
import { MobileMarketBar } from "./mobile-market-bar";
import { MobilePositionsView } from "./mobile-positions-view";
import { MobileTradeOrderSplit } from "./mobile-trade-order-split";
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
	const { data: selectedMarket } = useSelectedMarketInfo();
	const { routeMarketName } = useExchangeScope();
	const marketKey = routeMarketName ?? selectedMarket?.name ?? "default";

	return showOrderForm ? (
		<TradeOrderView
			active={active}
			showMarketBar={showMarketBar}
			marketKey={marketKey}
			disclosureStates={disclosureStates}
		/>
	) : (
		<MarketsDataView
			active={active}
			showMarketBar={showMarketBar}
			marketKey={marketKey}
			disclosureStates={disclosureStates}
		/>
	);
}

function TradeOrderView({
	active,
	showMarketBar,
	marketKey,
	disclosureStates,
}: {
	active: boolean;
	showMarketBar: boolean;
	marketKey: string;
	disclosureStates: MobilePositionsDisclosureStates;
}) {
	const [sizeMode, setSizeMode] = useState<SizeMode>("quote");

	return (
		<div
			className={cn(
				"h-full min-h-0 bg-background [overflow-anchor:none]",
				"overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
			)}
		>
			{showMarketBar && <MobileMarketBar key={marketKey} className="min-h-[61px]" />}

			<MobileTradeOrderSplit
				orderbook={
					<MobileBookView
						active={active}
						compact
						inTabLayout
						showOrderbookInQuote={sizeMode === "quote"}
						view="book"
						className="absolute inset-0"
					/>
				}
			>
				<MobileTradeView
					key={marketKey}
					active={active}
					embedded
					sizeMode={sizeMode}
					onSizeModeChange={setSizeMode}
					className="flex-[1.53] min-w-0 border-r border-stroke-weak/60"
				/>
			</MobileTradeOrderSplit>

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
	marketKey,
	disclosureStates,
}: {
	active: boolean;
	showMarketBar: boolean;
	marketKey: string;
	disclosureStates: MobilePositionsDisclosureStates;
}) {
	const { t } = useLingui();
	const [topView, setTopView] = useState<TopView>("chart");
	const tabId = useId();
	const tabRefs = useRef<Record<TopView, HTMLButtonElement | null>>({
		chart: null,
		book: null,
		trades: null,
	});

	const tabs: { value: TopView; label: string }[] = [
		{ value: "chart", label: t`Chart` },
		{ value: "book", label: t`Order Book` },
		{ value: "trades", label: t`Trades` },
	];

	const bookView = topView === "trades" ? "trades" : "book";
	const chartPanelId = `${tabId}-chart-panel`;
	const bookPanelId = `${tabId}-book-panel`;
	const tradesPanelId = `${tabId}-trades-panel`;
	const activeBookPanelId = bookView === "book" ? bookPanelId : tradesPanelId;
	const inactiveBookPanelId = bookView === "book" ? tradesPanelId : bookPanelId;
	const activeBookTabId = `${tabId}-${bookView}-tab`;
	const inactiveBookTabId = `${tabId}-${bookView === "book" ? "trades" : "book"}-tab`;

	function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, value: TopView) {
		const currentIndex = tabs.findIndex((tab) => tab.value === value);
		const isRtl = document.documentElement.dir === "rtl";
		let nextIndex: number | null = null;

		if (event.key === "Home") nextIndex = 0;
		if (event.key === "End") nextIndex = tabs.length - 1;
		if (event.key === "ArrowRight") nextIndex = currentIndex + (isRtl ? -1 : 1);
		if (event.key === "ArrowLeft") nextIndex = currentIndex + (isRtl ? 1 : -1);
		if (nextIndex === null) return;

		event.preventDefault();
		const nextTab = tabs[(nextIndex + tabs.length) % tabs.length];
		setTopView(nextTab.value);
		tabRefs.current[nextTab.value]?.focus();
	}

	return (
		<div
			className={cn(
				"h-full min-h-0 bg-background [overflow-anchor:none]",
				"overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
			)}
		>
			{showMarketBar && <MobileMarketBar key={marketKey} className="min-h-[61px]" />}

			<div
				role="tablist"
				aria-label={t`Market data views`}
				className="relative z-20 flex h-[35px] min-h-[35px] shrink-0"
			>
				{tabs.map((tab) => {
					const isSelected = topView === tab.value;
					return (
						<button
							key={tab.value}
							ref={(node) => {
								tabRefs.current[tab.value] = node;
							}}
							type="button"
							role="tab"
							id={`${tabId}-${tab.value}-tab`}
							aria-selected={isSelected}
							aria-controls={tab.value === "chart" ? chartPanelId : tab.value === "book" ? bookPanelId : tradesPanelId}
							tabIndex={isSelected ? 0 : -1}
							onClick={() => setTopView(tab.value)}
							onKeyDown={(event) => handleTabKeyDown(event, tab.value)}
							className={cn(
								"relative flex-1 border-b-2 py-2 text-xs font-medium transition-colors after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] motion-reduce:transition-none",
								"focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stroke-focus",
								isSelected ? "border-fg text-fg" : "border-stroke-weak text-fg-muted hover:text-fg",
							)}
						>
							{tab.label}
						</button>
					);
				})}
			</div>

			<div className="relative h-[45dvh] min-h-[320px] overflow-hidden">
				<div
					role="tabpanel"
					id={chartPanelId}
					aria-labelledby={`${tabId}-chart-tab`}
					aria-hidden={topView !== "chart"}
					tabIndex={topView === "chart" ? 0 : -1}
					className={cn(
						"absolute inset-0 flex min-h-0 flex-col",
						topView === "chart"
							? "z-10 visible opacity-100 pointer-events-auto"
							: "z-0 invisible opacity-0 pointer-events-none",
					)}
				>
					<MobileChartView active={active && topView === "chart"} />
				</div>
				<div
					role="tabpanel"
					id={activeBookPanelId}
					aria-labelledby={activeBookTabId}
					aria-hidden={topView === "chart"}
					tabIndex={topView === "chart" ? -1 : 0}
					className={cn(
						"absolute inset-0 flex min-h-0 flex-col bg-background",
						topView === "chart" ? "z-0 invisible pointer-events-none" : "z-10 visible pointer-events-auto",
					)}
				>
					<MobileBookView
						active={active && topView !== "chart"}
						inTabLayout
						view={bookView}
						className="flex-1 min-h-0"
					/>
				</div>
				<div role="tabpanel" id={inactiveBookPanelId} aria-labelledby={inactiveBookTabId} aria-hidden="true" hidden />
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
