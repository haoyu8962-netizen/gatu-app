import { Slider, type SliderProps } from "@gatu/ui";
import { t } from "@lingui/core/macro";

interface Props {
	value: number;
	onChange: (value: number) => void;
	onCommit?: (value: number) => void;
	max: number;
	disabled?: boolean;
	className?: string;
	thumbAlignment?: SliderProps["thumbAlignment"];
	controlClassName?: string;
	trackClassName?: string;
	indicatorClassName?: string;
	thumbClassName?: string;
}

export function LeverageSlider({
	value,
	onChange,
	onCommit,
	max,
	disabled,
	className,
	thumbAlignment,
	controlClassName,
	trackClassName,
	indicatorClassName,
	thumbClassName,
}: Props) {
	return (
		<Slider
			className={className}
			label={t`Leverage`}
			labelHidden
			value={value}
			onValueChange={(v) => {
				if (typeof v === "number") onChange(v);
			}}
			onValueCommitted={(v) => {
				if (typeof v === "number") onCommit?.(v);
			}}
			min={1}
			max={max}
			step={1}
			disabled={disabled}
			thumbAlignment={thumbAlignment}
			controlClassName={controlClassName}
			trackClassName={trackClassName}
			indicatorClassName={indicatorClassName}
			thumbClassName={thumbClassName}
		/>
	);
}
