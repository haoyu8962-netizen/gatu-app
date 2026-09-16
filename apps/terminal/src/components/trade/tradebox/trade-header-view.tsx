import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Props {
	controls: ReactNode;
	tabs: ReactNode;
	sideToggle: ReactNode;
	orderTypeIndex: number;
	compact?: boolean;
}

export function TradeHeaderView({ controls, tabs, sideToggle, orderTypeIndex, compact = true }: Props) {
	return (
		<div className={compact ? "min-w-0 space-y-2" : "min-w-0 space-y-4"}>
			<div className={cn("trade-control-grid grid min-w-0 grid-cols-3", compact && "gap-1.5")}>{controls}</div>
			<div className="relative grid min-w-0 grid-cols-3">
				<div
					className="pointer-events-none absolute bottom-0 left-0 z-10 h-0.5 w-1/3 bg-trading-panel-fg transition-transform duration-300 ease-out motion-reduce:transition-none"
					style={{ transform: `translateX(${orderTypeIndex * 100}%)` }}
				/>
				{tabs}
			</div>
			{sideToggle}
		</div>
	);
}
