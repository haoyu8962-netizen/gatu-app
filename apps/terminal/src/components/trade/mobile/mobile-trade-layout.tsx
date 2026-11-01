import { useLingui } from "@lingui/react/macro";
import { type KeyboardEvent, useId, useRef, useState } from "react";
import { tradeColumn } from "@/components/trade/mobile/mobile-trade-frame-view";
import { MARKET_HEADER_LABELS } from "@/config/market-header";
import { isFundingHistoryMarket } from "@/domain/market/funding-history-market";
import { useHasBeenActive } from "@/hooks/ui/use-has-been-active";
import { cn } from "@/lib/cn";
import { type UnifiedMarketInfo, useSelectedMarketInfo } from "@/lib/hyperliquid";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useOrderEntryActions, useSizeMode } from "@/stores/use-order-entry-store";
import { FundingHistoryLoadBoundary } from "../chart/funding-history-load-boundary";
import { FundingHistoryPanel, warmFundingHistoryPanel } from "../chart/lazy-funding-history-panel";
import { MobileBalancesTab } from "./mobile-balances-tab";
import { MobileBookView } from "./mobile-book-view";
import { MobileChartView } from "./mobile-chart-view";
import { MobileMarketBar } from "./mobile-market-bar";
import { MobilePositionsFrameView } from "./mobile-positions-tabs-view";
import { MobilePositionsView } from "./mobile-positions-view";
import { MobilePageView } from "./mobile-terminal-frame-view";
import { MobileTradeOrderSplit } from "./mobile-trade-order-split";
import { MobileTradeView } from "./mobile-trade-view";
import type { MobilePositionsDisclosureStates } from "./use-mobile-disclosure-set";

type TopView = "chart" | "book" | "trades" | "funding";

interface Props {
	active?: boolean;
	orderEntryDraftReady?: boolean;
	showMarketBar?: boolean;
	showOrderForm?: boolean;
	disclosureStates: MobilePositionsDisclosureStates;
}

export function MobileTradeLayout({
	active = true,
	orderEntryDraftReady = true,
	showMarketBar = false,
	showOrderForm = true,
	disclosureStates,
}: Props) {
	const { data: selectedMarket } = useSelectedMarketInfo();
	const { routeMarketName } = useExchangeScope();
	const marketKey = routeMarketName ?? selectedMarket?.name ?? "default";

	return showOrderForm ? (
		<TradeOrderView
			orderEntryDraftReady={orderEntryDraftReady}
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
			market={selectedMarket}
			disclosureStates={disclosureStates}
		/>
	);
}

function TradeOrderView({
	orderEntryDraftReady,
	active,
	showMarketBar,
	marketKey,
	disclosureStates,
}: {
	orderEntryDraftReady: boolean;
	active: boolean;
	showMarketBar: boolean;
	marketKey: string;
	disclosureStates: MobilePositionsDisclosureStates;
}) {
	const sizeMode = useSizeMode();
	const { setSizeMode } = useOrderEntryActions();

	return (
		<MobilePageView>
			{showMarketBar && <MobileMarketBar key={marketKey} className="min-h-[61px]" />}

			<MobileTradeOrderSplit
				orderbook={<MobileBookView active={active} compact inTabLayout view="book" className="absolute inset-0" />}
			>
				{orderEntryDraftReady ? (
					<MobileTradeView
						key={marketKey}
						active={active}
						embedded
						sizeMode={sizeMode}
						onSizeModeChange={setSizeMode}
						className={tradeColumn}
					/>
				) : (
					<div
						aria-hidden="true"
						data-testid="mobile-order-entry-draft-loading"
						className="flex-[1.53] min-w-0 bg-surface"
					/>
				)}
			</MobileTradeOrderSplit>

			{active && (
				<MobilePositionsFrameView>
					<MobilePositionsView
						scrollMode="page"
						includeBottomNavSpacer={false}
						balancesContent={<MobileBalancesTab />}
						disclosureStates={disclosureStates}
					/>
				</MobilePositionsFrameView>
			)}
		</MobilePageView>
	);
}

function MarketsDataView({
	active,
	showMarketBar,
	marketKey,
	market,
	disclosureStates,
}: {
	active: boolean;
	showMarketBar: boolean;
	marketKey: string;
	market: UnifiedMarketInfo | undefined;
	disclosureStates: MobilePositionsDisclosureStates;
}) {
	const { t } = useLingui();
	const [selectedTopView, setTopView] = useState<TopView>("chart");
	const tabId = useId();
	const tabRefs = useRef<Record<TopView, HTMLButtonElement | null>>({
		chart: null,
		book: null,
		trades: null,
		funding: null,
	});
	const fundingAvailable = isFundingHistoryMarket(market);
	const topView: TopView = selectedTopView === "funding" && !fundingAvailable ? "chart" : selectedTopView;
	const fundingMounted = useHasBeenActive(topView === "funding");
	const bookVisible = topView === "book" || topView === "trades";

	const tabs: { value: TopView; label: string }[] = [
		{ value: "chart", label: t`Chart` },
		{ value: "book", label: t`Order Book` },
		{ value: "trades", label: t`Trades` },
		...(fundingAvailable ? [{ value: "funding" as const, label: t(MARKET_HEADER_LABELS.funding) }] : []),
	];

	const bookView = topView === "trades" ? "trades" : "book";
	const chartPanelId = `${tabId}-chart-panel`;
	const bookPanelId = `${tabId}-book-panel`;
	const tradesPanelId = `${tabId}-trades-panel`;
	const fundingPanelId = `${tabId}-funding-panel`;
	const panelIds: Record<TopView, string> = {
		chart: chartPanelId,
		book: bookPanelId,
		trades: tradesPanelId,
		funding: fundingPanelId,
	};
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
		<MobilePageView>
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
							aria-controls={panelIds[tab.value]}
							tabIndex={isSelected ? 0 : -1}
							onClick={() => setTopView(tab.value)}
							onKeyDown={(event) => handleTabKeyDown(event, tab.value)}
							onPointerEnter={tab.value === "funding" ? warmFundingHistoryPanel : undefined}
							onFocus={tab.value === "funding" ? warmFundingHistoryPanel : undefined}
							className={cn(
								"relative min-w-0 flex-1 border-b-2 px-1 py-2 text-xs font-medium transition-colors after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] motion-reduce:transition-none",
								"focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stroke-focus",
								isSelected ? "border-fg text-fg" : "border-stroke-weak text-fg-muted hover:text-fg",
							)}
						>
							<span className="block min-w-0 truncate">{tab.label}</span>
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
					aria-hidden={!bookVisible}
					tabIndex={bookVisible ? 0 : -1}
					className={cn(
						"absolute inset-0 flex min-h-0 flex-col bg-background",
						bookVisible ? "z-10 visible pointer-events-auto" : "z-0 invisible pointer-events-none",
					)}
				>
					<MobileBookView active={active && bookVisible} inTabLayout view={bookView} className="flex-1 min-h-0" />
				</div>
				<div role="tabpanel" id={inactiveBookPanelId} aria-labelledby={inactiveBookTabId} aria-hidden="true" hidden />
				{(fundingAvailable || fundingMounted) && (
					<div
						role="tabpanel"
						id={fundingPanelId}
						aria-labelledby={`${tabId}-funding-tab`}
						aria-hidden={topView !== "funding"}
						tabIndex={topView === "funding" ? 0 : -1}
						data-funding-layer
						className={cn(
							"absolute inset-0 flex min-h-0 flex-col bg-background",
							topView === "funding" ? "z-10 visible pointer-events-auto" : "z-0 invisible pointer-events-none",
						)}
					>
						{fundingMounted && (
							<FundingHistoryLoadBoundary>
								<FundingHistoryPanel market={market} active={active && topView === "funding"} />
							</FundingHistoryLoadBoundary>
						)}
					</div>
				)}
			</div>

			{active && (
				<MobilePositionsFrameView>
					<MobilePositionsView
						scrollMode="page"
						includeBottomNavSpacer={false}
						balancesContent={<MobileBalancesTab />}
						disclosureStates={disclosureStates}
					/>
				</MobilePositionsFrameView>
			)}
		</MobilePageView>
	);
}
