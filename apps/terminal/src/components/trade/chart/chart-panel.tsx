import { useLingui } from "@lingui/react/macro";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense, useEffect, useRef } from "react";
import { resolveChartLocale } from "@/config/chart";
import { useSelectedMarketInfo } from "@/lib/hyperliquid";
import { createLazyComponent } from "@/lib/lazy";
import { useRenderCommitTrack } from "@/lib/performance/render-profile";
import { useTheme } from "@/stores/use-global-settings-store";

const TradingViewChart = createLazyComponent(() => import("./tradingview-chart"), "TradingViewChart");

interface Props {
	active?: boolean;
	yAxisInside?: boolean;
}

export function ChartPanel({ active = true, yAxisInside = false }: Props) {
	useRenderCommitTrack("chart");
	const { i18n } = useLingui();
	const theme = useTheme();
	const { data: selectedMarket } = useSelectedMarketInfo();
	const lastSelectedMarketRef = useRef(selectedMarket);
	useEffect(() => {
		if (selectedMarket) {
			lastSelectedMarketRef.current = selectedMarket;
		}
	}, [selectedMarket]);
	const chartMarket = selectedMarket ?? lastSelectedMarketRef.current;
	const chartTheme = theme === "dark" ? "dark" : "light";
	const chartLocale = resolveChartLocale(i18n.locale);

	return (
		<div className="h-full flex flex-col overflow-hidden">
			{!chartMarket && <ChartLoadingFallback />}
			{chartMarket && (
				<ClientOnly>
					<Suspense fallback={<ChartLoadingFallback />}>
						<TradingViewChart
							active={active}
							symbol={chartMarket.name}
							market={chartMarket}
							theme={chartTheme}
							locale={chartLocale}
							yAxisInside={yAxisInside}
						/>
					</Suspense>
				</ClientOnly>
			)}
		</div>
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
