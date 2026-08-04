import { Slider } from "@gatu/ui";
import { t } from "@lingui/core/macro";

interface Props {
	value: number;
	onChange: (value: number) => void;
	max: number;
	disabled?: boolean;
	className?: string;
}

export function LeverageSlider({ value, onChange, max, disabled, className }: Props) {
	return (
		<Slider
			className={className}
			label={t`Leverage`}
			labelHidden
			value={value}
			onValueChange={(v) => {
				if (typeof v === "number") onChange(v);
			}}
			min={1}
			max={max}
			step={1}
			disabled={disabled}
		/>
	);
}
