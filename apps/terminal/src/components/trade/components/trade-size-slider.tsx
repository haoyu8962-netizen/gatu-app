import { Slider, type SliderThumbSize } from "@gatu/ui";
import { cn } from "@/lib/cn";

interface Props {
	value: number;
	onPercentChange: (value: number) => void;
	disabled?: boolean;
	thumbSize?: SliderThumbSize;
	ariaLabel?: string;
	ariaValueText?: string;
	className?: string;
}

export function TradeSizeSlider({
	value,
	onPercentChange,
	disabled,
	thumbSize,
	ariaLabel,
	ariaValueText,
	className,
}: Props) {
	return (
		<Slider
			className={cn(ariaLabel && "[&>div:first-child]:sr-only", className)}
			label={ariaLabel}
			format={ariaLabel ? { style: "unit", unit: "percent", maximumFractionDigits: 1 } : undefined}
			getAriaValueText={ariaValueText ? () => ariaValueText : undefined}
			thumbSize={thumbSize}
			value={value}
			onValueChange={(nextValue, eventDetails) => {
				if (typeof nextValue !== "number" || eventDetails.reason === "none") return;
				onPercentChange(nextValue);
			}}
			max={100}
			step={0.1}
			disabled={disabled}
		/>
	);
}
