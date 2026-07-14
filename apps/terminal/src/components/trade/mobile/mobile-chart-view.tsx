import { cn } from "@/lib/cn";
import { ChartPanel } from "../chart/chart-panel";

interface MobileChartViewProps {
	active?: boolean;
	className?: string;
}

export function MobileChartView({ active = true, className }: MobileChartViewProps) {
	return (
		<div data-testid="mobile-chart-view" className={cn("mobile-chart-view flex flex-col flex-1 min-h-0", className)}>
			<ChartPanel active={active} yAxisInside />
		</div>
	);
}
