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
}

export function SideToggle({ side, onSideChange, labels, compact }: Props) {
	const indicatorClassName = cn(
		"shadow-none",
		side === "buy" ? "border-stroke-success-strong bg-success-soft" : "border-stroke-error-strong bg-error-soft",
	);

	return (
		<SegmentedControls
			value={side}
			onValueChange={(v: string) => onSideChange(v as Side)}
			fullWidth
			className={compact ? "mb-0" : "mb-2"}
			indicatorClassName={indicatorClassName}
		>
			<SegmentedControlItem
				value="buy"
				aria-label={labels.buyAria}
				className={cn("flex-1 data-[active]:text-success", compact ? "py-1.5 text-xs" : "py-2 text-sm")}
			>
				{labels.buy}
			</SegmentedControlItem>
			<SegmentedControlItem
				value="sell"
				aria-label={labels.sellAria}
				className={cn("flex-1 data-[active]:text-error", compact ? "py-1.5 text-xs" : "py-2 text-sm")}
			>
				{labels.sell}
			</SegmentedControlItem>
		</SegmentedControls>
	);
}
