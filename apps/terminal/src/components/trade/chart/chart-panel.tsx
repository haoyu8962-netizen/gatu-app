import { ClientOnly } from "@tanstack/react-router";
import { Suspense, useEffect, useRef } from "react";
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
							yAxisInside={yAxisInside}
						/>
					</Suspense>
				</ClientOnly>
			)}
		</div>
	);
}

function ChartLoadingFallback() {
	return <div className="h-full w-full animate-pulse bg-surface" />;
}
