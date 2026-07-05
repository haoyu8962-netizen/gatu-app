import { ClientOnly } from "@tanstack/react-router";
import { Suspense } from "react";
import { useSelectedMarketInfo } from "@/lib/hyperliquid";
import { createLazyComponent } from "@/lib/lazy";
import { useRenderCommitTrack } from "@/lib/performance/render-profile";
import { useTheme } from "@/stores/use-global-settings-store";

const TradingViewChart = createLazyComponent(() => import("./tradingview-chart"), "TradingViewChart");

interface Props {
	yAxisInside?: boolean;
}

export function ChartPanel({ yAxisInside = false }: Props) {
	useRenderCommitTrack("chart");
	const theme = useTheme();
	const { data: selectedMarket } = useSelectedMarketInfo();
	const chartTheme = theme === "dark" ? "dark" : "light";

	return (
		<div className="h-full flex flex-col overflow-hidden">
			{!selectedMarket && <ChartLoadingFallback />}
			{selectedMarket && (
				<ClientOnly>
					<Suspense fallback={<ChartLoadingFallback />}>
						<TradingViewChart
							symbol={selectedMarket.name}
							market={selectedMarket}
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
