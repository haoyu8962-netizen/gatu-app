import { cn } from "@/lib/cn";
import { MobileChartView } from "./mobile-chart-view";
import { MobileHeader } from "./mobile-header";
import { MobilePositionsView } from "./mobile-positions-view";
import { OfflineBanner } from "./offline-banner";

interface Props {
	className?: string;
}

export function MobileTerminal({ className }: Props) {
	return (
		<div
			className={cn("h-dvh w-full flex flex-col bg-surface-base text-text-950 font-mono", "overflow-hidden", className)}
		>
			<MobileHeader />
			<OfflineBanner />
			<main className="flex-1 min-h-0 flex flex-col overflow-hidden">
				<MobileChartView />
				<MobilePositionsView />
			</main>
		</div>
	);
}
