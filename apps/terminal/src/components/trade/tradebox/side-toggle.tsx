import { SegmentedControlItem, SegmentedControls } from "@hypeterminal/ui";
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
}

export function SideToggle({ side, onSideChange, labels }: Props) {
	const indicatorClassName = cn(
		"shadow-none",
		side === "buy"
			? "border-stroke-success-strong bg-fill-success-weak"
			: "border-stroke-error-strong bg-fill-error-weak",
	);

	return (
		<SegmentedControls
			value={side}
			onValueChange={(v) => onSideChange(v as Side)}
			fullWidth
			className="mb-2"
			indicatorClassName={indicatorClassName}
		>
			<SegmentedControlItem
				value="buy"
				aria-label={labels.buyAria}
				className="flex-1 py-2 text-sm data-[active]:text-text-success"
			>
				{labels.buy}
			</SegmentedControlItem>
			<SegmentedControlItem
				value="sell"
				aria-label={labels.sellAria}
				className="flex-1 py-2 text-sm data-[active]:text-text-error"
			>
				{labels.sell}
			</SegmentedControlItem>
		</SegmentedControls>
	);
}
