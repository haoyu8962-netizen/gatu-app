import { Slider, type SliderThumbSize } from "@gatu/ui";

interface Props {
	value: number;
	onPercentChange: (value: number) => void;
	disabled?: boolean;
	thumbSize?: SliderThumbSize;
}

export function TradeSizeSlider({ value, onPercentChange, disabled, thumbSize }: Props) {
	return (
		<Slider
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
