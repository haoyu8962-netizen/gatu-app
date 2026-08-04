import { Slider, type SliderProps, type SliderThumbSize } from "@gatu/ui";
import Big from "big.js";

interface Props {
	value: number;
	onPercentChange: (value: number) => void;
	disabled?: boolean;
	thumbSize?: SliderThumbSize;
	ariaLabel: string;
	ariaValueText?: string;
	ariaDescribedBy?: string;
	ariaInvalid?: boolean;
	thumbAlignment?: SliderProps["thumbAlignment"];
	className?: string;
	controlClassName?: string;
	trackClassName?: string;
	indicatorClassName?: string;
	thumbClassName?: string;
}

export function TradeSizeSlider({
	value,
	onPercentChange,
	disabled,
	thumbSize,
	ariaLabel,
	ariaValueText,
	ariaDescribedBy,
	ariaInvalid,
	thumbAlignment,
	className,
	controlClassName,
	trackClassName,
	indicatorClassName,
	thumbClassName,
}: Props) {
	return (
		<Slider
			aria-describedby={ariaDescribedBy}
			aria-invalid={ariaInvalid}
			className={className}
			label={ariaLabel}
			labelHidden
			format={{ style: "unit", unit: "percent", maximumFractionDigits: 1 }}
			getAriaValueText={ariaValueText ? () => ariaValueText : undefined}
			thumbSize={thumbSize}
			thumbAlignment={thumbAlignment}
			controlClassName={controlClassName}
			trackClassName={trackClassName}
			indicatorClassName={indicatorClassName}
			thumbClassName={thumbClassName}
			value={value}
			onPointerDown={(event) => {
				if (disabled || !event.currentTarget.setPointerCapture) return;
				event.currentTarget.setPointerCapture(event.pointerId);
			}}
			onValueChange={(nextValue, eventDetails) => {
				if (typeof nextValue !== "number" || eventDetails.reason === "none") return;
				onPercentChange(normalizePercent(nextValue));
			}}
			max={100}
			step={0.1}
			disabled={disabled}
		/>
	);
}

function normalizePercent(value: number): number {
	try {
		const normalized = Big(String(value)).round(1, Big.roundHalfUp);
		if (normalized.lt(0)) return 0;
		if (normalized.gt(100)) return 100;
		return normalized.toNumber();
	} catch {
		return 0;
	}
}
