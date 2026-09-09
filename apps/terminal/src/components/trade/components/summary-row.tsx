import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Props {
	compact?: boolean;
	label: string;
	children: ReactNode;
}

export function SummaryRow({ label, children, compact }: Props) {
	return (
		<div className={cn("flex min-w-0 items-center justify-between gap-2", compact ? "py-0.5" : "py-1.5")}>
			<span className="min-w-0 truncate text-xs text-trading-panel-muted">{label}</span>
			<span className="shrink-0 whitespace-nowrap text-right text-xs font-semibold tabular-nums text-trading-panel-fg">
				{children}
			</span>
		</div>
	);
}
