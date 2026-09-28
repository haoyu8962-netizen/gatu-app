import { Tabs, TabsList, TabsTrigger } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense, useEffect, useId, useRef, useState } from "react";
import { resolveChartLocale } from "@/config/chart";
import { MARKET_HEADER_LABELS } from "@/config/market-header";
import { isFundingHistoryMarket } from "@/domain/market/funding-history-market";
import { useHasBeenActive } from "@/hooks/ui/use-has-been-active";
import { cn } from "@/lib/cn";
import { useSelectedMarketInfo } from "@/lib/hyperliquid";
import { createLazyComponent, preloadLazyComponents } from "@/lib/lazy";
import { useRenderCommitTrack } from "@/lib/performance/render-profile";
import { useNumberFormatLocale, useTheme } from "@/stores/use-global-settings-store";
import { FundingHistoryLoadBoundary } from "./funding-history-load-boundary";
import { FundingHistoryPanel, warmFundingHistoryPanel } from "./lazy-funding-history-panel";

const TradingViewChart = createLazyComponent(() => import("./tradingview-chart"), "TradingViewChart");

export function preloadChartPanel(): Promise<void> {
	return preloadLazyComponents([TradingViewChart]);
}

type ChartView = "chart" | "funding";

interface Props {
	active?: boolean;
	yAxisInside?: boolean;
	showFundingTab?: boolean;
}

export function ChartPanel({ active = true, yAxisInside = false, showFundingTab = false }: Props) {
	useRenderCommitTrack("chart");
	const { i18n, t } = useLingui();
	const theme = useTheme();
	const numberFormatLocale = useNumberFormatLocale();
	const { data: selectedMarket } = useSelectedMarketInfo();
	const lastSelectedMarketRef = useRef(selectedMarket);
	const tabId = useId();
	const [selectedView, setSelectedView] = useState<ChartView>("chart");
	useEffect(() => {
		if (selectedMarket) {
			lastSelectedMarketRef.current = selectedMarket;
		}
	}, [selectedMarket]);
	const chartMarket = selectedMarket ?? lastSelectedMarketRef.current;
	const chartTheme = theme === "dark" ? "dark" : "light";
	const chartLocale = resolveChartLocale(i18n.locale);
	const fundingAvailable = showFundingTab && isFundingHistoryMarket(chartMarket);
	const view: ChartView = fundingAvailable ? selectedView : "chart";
	const fundingMounted = useHasBeenActive(view === "funding");
	const chart = (
		<>
			{!chartMarket && <ChartLoadingFallback />}
			{chartMarket && (
				<ClientOnly>
					<Suspense fallback={<ChartLoadingFallback />}>
						<TradingViewChart
							active={active && view === "chart"}
							symbol={chartMarket.name}
							market={chartMarket}
							theme={chartTheme}
							locale={chartLocale}
							numberFormatLocale={numberFormatLocale}
							yAxisInside={yAxisInside}
						/>
					</Suspense>
				</ClientOnly>
			)}
		</>
	);

	if (!showFundingTab) {
		return <div className="h-full flex flex-col overflow-hidden">{chart}</div>;
	}

	const chartTabId = `${tabId}-chart-tab`;
	const fundingTabId = `${tabId}-funding-tab`;
	const chartPanelId = `${tabId}-chart-panel`;
	const fundingPanelId = `${tabId}-funding-panel`;

	function handleViewChange(value: unknown) {
		if (value === "chart" || value === "funding") setSelectedView(value);
	}

	return (
		<Tabs
			value={view}
			onValueChange={handleViewChange}
			size="sm"
			variant="underline"
			data-chart-view={view}
			className="flex h-full flex-col overflow-hidden"
		>
			<TabsList aria-label={t`Chart views`} className="shrink-0 px-1">
				<TabsTrigger value="chart" id={chartTabId} aria-controls={chartPanelId}>
					{t`Chart`}
				</TabsTrigger>
				{fundingAvailable && (
					<TabsTrigger
						value="funding"
						id={fundingTabId}
						aria-controls={fundingPanelId}
						onPointerEnter={warmFundingHistoryPanel}
						onFocus={warmFundingHistoryPanel}
					>
						{t(MARKET_HEADER_LABELS.funding)}
					</TabsTrigger>
				)}
			</TabsList>
			<div className="relative min-h-0 flex-1">
				<div
					role="tabpanel"
					id={chartPanelId}
					aria-labelledby={chartTabId}
					aria-hidden={view !== "chart"}
					tabIndex={view === "chart" ? 0 : -1}
					data-chart-layer
					className={cn(
						"absolute inset-0 flex min-h-0 flex-col overflow-hidden",
						view === "chart"
							? "z-10 visible opacity-100 pointer-events-auto"
							: "z-0 invisible opacity-0 pointer-events-none",
					)}
				>
					{chart}
				</div>
				{(fundingAvailable || fundingMounted) && (
					<div
						role="tabpanel"
						id={fundingPanelId}
						aria-labelledby={fundingTabId}
						aria-hidden={view !== "funding"}
						tabIndex={view === "funding" ? 0 : -1}
						data-funding-layer
						className={cn(
							"absolute inset-0 flex min-h-0 flex-col overflow-hidden bg-surface",
							view === "funding" ? "z-10 visible pointer-events-auto" : "z-0 invisible pointer-events-none",
						)}
					>
						{fundingMounted && (
							<FundingHistoryLoadBoundary>
								<FundingHistoryPanel market={chartMarket} active={active && view === "funding"} />
							</FundingHistoryLoadBoundary>
						)}
					</div>
				)}
			</div>
		</Tabs>
	);
}

function ChartLoadingFallback() {
	const { t } = useLingui();

	return (
		<output aria-live="polite" className="block h-full w-full bg-surface">
			<span className="sr-only">{t`Loading...`}</span>
		</output>
	);
}
