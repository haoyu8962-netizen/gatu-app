import { SegmentedControlItem, SegmentedControls } from "@gatu/ui";
import { cn } from "@/lib/cn";
import type { Side } from "@/lib/trade/types";

interface SideLabels {
	buy: string;
	sell: string;
	buyAria: string;
	sellAria: string;
}

interface Props {
	side: Side;
	onSideChange: (side: Side) => void;
	labels: SideLabels;
	compact?: boolean;
	tradingPanel?: boolean;
	mobileTouchTargets?: boolean;
}

export function SideToggle({ side, onSideChange, labels, compact, tradingPanel, mobileTouchTargets }: Props) {
	const indicatorClassName = cn(
		"shadow-none",
		tradingPanel
			? side === "buy"
				? "rounded-[9px] border-trading-panel-success bg-trading-panel-success-fill"
				: "rounded-[9px] border-trading-panel-error bg-trading-panel-error-fill"
			: side === "buy"
				? "border-stroke-success-strong bg-success-soft"
				: "border-stroke-error-strong bg-error-soft",
	);

	const control = (
		<SegmentedControls
			value={side}
			onValueChange={(v: string) => onSideChange(v as Side)}
			fullWidth
			className={cn(
				compact ? "mb-0" : "mb-2",
				tradingPanel && "rounded-[10px] border-trading-panel-stroke-card bg-surface",
				mobileTouchTargets && "overflow-visible",
			)}
			indicatorClassName={indicatorClassName}
		>
			<SegmentedControlItem
				value="buy"
				aria-label={labels.buyAria}
				className={cn(
					"flex-1 data-[active]:text-success",
					tradingPanel &&
						"relative rounded-[9px] font-bold text-trading-panel-muted after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] data-[active]:text-trading-panel-on-success",
					compact ? "py-1.5 text-2sm" : "py-[11px] text-sm",
				)}
			>
				{labels.buy}
			</SegmentedControlItem>
			<SegmentedControlItem
				value="sell"
				aria-label={labels.sellAria}
				className={cn(
					"flex-1 data-[active]:text-error",
					tradingPanel &&
						"relative rounded-[9px] font-bold text-trading-panel-muted after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] data-[active]:text-trading-panel-on-error",
					compact ? "py-1.5 text-2sm" : "py-[11px] text-sm",
				)}
			>
				{labels.sell}
			</SegmentedControlItem>
		</SegmentedControls>
	);

	return mobileTouchTargets ? <div className="py-[5px]">{control}</div> : control;
}
