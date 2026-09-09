import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { tradingInputFrameClass } from "@/lib/ui/trading-input";

interface Props {
	compact: boolean | undefined;
	desktop?: boolean;
	range?: string;
	disabled: boolean;
	label: string;
	action?: ReactNode;
	children: ReactNode;
}

export function ScaleField({ compact, desktop, range, disabled, label, action, children }: Props) {
	if (!compact && !desktop) return <>{children}</>;
	if (desktop && range) {
		return (
			<div className="flex min-w-0 flex-col gap-0.5">
				<span className="text-2xs text-trading-panel-subtle">{label}</span>
				<div className={cn(tradingInputFrameClass, "h-9 px-2.5", disabled && "opacity-50")}>{children}</div>
				<span className="text-3xs tabular-nums text-trading-panel-subtle">{range}</span>
			</div>
		);
	}

	return (
		<div className={cn(tradingInputFrameClass, desktop ? "h-9 px-2.5" : "h-8 px-2.5", disabled && "opacity-50")}>
			<span className="me-1.5 min-w-0 shrink truncate whitespace-nowrap text-2xs text-trading-panel-subtle">
				{label}
			</span>
			<div className="min-w-0 flex-1">{children}</div>
			{action}
		</div>
	);
}
