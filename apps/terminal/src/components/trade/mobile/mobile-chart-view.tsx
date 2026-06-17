import { ClientOnly } from "@tanstack/react-router";
import { Suspense } from "react";
import { getPositionDex } from "@/domain/market";
import { cn } from "@/lib/cn";
import { useSelectedMarketInfo } from "@/lib/hyperliquid";
import { createLazyComponent } from "@/lib/lazy";
import { useTheme } from "@/stores/use-global-settings-store";

const KlineChart = createLazyComponent(() => import("../chart/kline-chart"), "KlineChart");

interface MobileChartViewProps {
	className?: string;
}

export function MobileChartView({ className }: MobileChartViewProps) {
	const theme = useTheme();
	const { data: selectedMarket } = useSelectedMarketInfo();

	return (
		<div className={cn("flex flex-col flex-1 min-h-0", className)}>
			<ClientOnly
				fallback={
					<div className="h-full flex items-center justify-center">
						<ChartSkeleton />
					</div>
				}
			>
				<Suspense fallback={<ChartSkeleton />}>
					{selectedMarket && (
						<KlineChart
							symbol={selectedMarket.name}
							positionDex={getPositionDex(selectedMarket)}
							theme={theme === "dark" ? "dark" : "light"}
							yAxisInside
						/>
					)}
				</Suspense>
			</ClientOnly>
		</div>
	);
}

function ChartSkeleton() {
	return <div className="w-full h-full animate-pulse bg-surface" />;
}
