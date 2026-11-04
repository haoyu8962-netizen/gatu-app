import { PencilIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const summary = "mt-auto border-t border-trading-panel-stroke-row pt-2";
export const summaryRow = "flex min-w-0 items-center justify-between";
export const summaryCompactRow = "gap-1 py-0.5";
export const summaryLabel = "min-w-0 truncate text-trading-panel-muted";
export const summaryValue = "shrink-0 whitespace-nowrap text-right font-semibold tabular-nums";

interface Props {
	children: ReactNode;
	embedded?: boolean;
}
export function MobileTradeSummaryView({ children, embedded }: Props) {
	return (
		<div data-slot="mobile-order-summary" className={cn(summary, embedded ? "text-2xs" : "text-xs")}>
			{children}
		</div>
	);
}
export function MobileSummaryRowView({
	label,
	value,
	valueClass,
	compact,
}: {
	label: string;
	value: ReactNode;
	valueClass?: string;
	compact?: boolean;
}) {
	return (
		<div className={cn(summaryRow, compact ? summaryCompactRow : "gap-2 py-1.5")}>
			<span className={summaryLabel}>{label}</span>
			<span className={cn(summaryValue, valueClass ?? "text-trading-panel-fg")}>{value}</span>
		</div>
	);
}

export function MobileSlippageRowView({
	labels,
	value,
	slippagePercent,
	onClick,
	embedded,
}: {
	labels: { slippage: string; estimatedSlippage: string; max: string };
	value: string;
	slippagePercent: string;
	onClick?: () => void;
	embedded?: boolean;
}) {
	return (
		<div className={cn(summaryRow, embedded ? "gap-1 py-1" : "gap-2 py-1.5")}>
			<span className={summaryLabel}>{labels.slippage}</span>
			<span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap tabular-nums">
				<span title={labels.estimatedSlippage} className="text-trading-panel-muted">
					<span className="sr-only">{labels.estimatedSlippage}: </span>
					{value}
				</span>
				<span aria-hidden="true" className="text-trading-panel-subtle">
					/
				</span>
				<button
					type="button"
					onClick={onClick}
					aria-label={labels.slippage}
					className="relative inline-flex cursor-pointer items-center gap-1 rounded-8 transition-opacity active:opacity-60 after:absolute after:left-1/2 after:top-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
				>
					<span className="text-trading-panel-muted">{labels.max}</span>
					<span className="text-signal">{slippagePercent}%</span>
					<PencilIcon className="size-2.5 text-trading-panel-subtle" />
				</button>
			</span>
		</div>
	);
}
