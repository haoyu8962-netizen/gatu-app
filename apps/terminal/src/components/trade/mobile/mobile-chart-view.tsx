import { cn } from "@/lib/cn";
import { ChartPanel } from "../chart/chart-panel";

interface MobileChartViewProps {
	className?: string;
}

export function MobileChartView({ className }: MobileChartViewProps) {
	return (
		<div className={cn("flex flex-col flex-1 min-h-0", className)}>
			<ChartPanel yAxisInside />
		</div>
	);
}
