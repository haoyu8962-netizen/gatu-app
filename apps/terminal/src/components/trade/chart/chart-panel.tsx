import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
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
	return (
		<output
			aria-live="polite"
			className="flex h-full w-full flex-col items-center justify-center gap-2 bg-background px-4 text-center"
		>
			<span
				aria-hidden="true"
				className="size-5 animate-spin rounded-full border-2 border-stroke-weak border-t-fg motion-reduce:animate-none"
			/>
			<p className="text-xs font-medium text-fg-muted">{t`Loading...`}</p>
		</output>
	);
}
