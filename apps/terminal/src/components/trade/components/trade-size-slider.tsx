import { TradeSlider, type TradeSliderCommitDetails } from "./trade-slider";

interface Props {
	value: number;
	onPercentChange: (value: number) => void;
	onPercentCancel: (startValue: number) => void;
	onPercentCommit: (value: number, details: TradeSliderCommitDetails) => void;
	onPercentInteractionStart?: (startValue: number) => void;
	onPercentInteractionEnd?: () => void;
	interactionIdentity?: string;
	disabled?: boolean;
	paused?: boolean;
	ariaLabel: string;
	ariaValueText?: string;
	ariaDescribedBy?: string;
	ariaInvalid?: boolean;
	className?: string;
}

export function TradeSizeSlider({
	onPercentChange,
	onPercentCancel,
	onPercentCommit,
	onPercentInteractionStart,
	onPercentInteractionEnd,
	...props
}: Props) {
	return (
		<TradeSlider
			{...props}
			min={0}
			max={100}
			showTicks
			onPreview={onPercentChange}
			onCancel={onPercentCancel}
			onCommit={onPercentCommit}
			onInteractionStart={onPercentInteractionStart}
			onInteractionEnd={onPercentInteractionEnd}
			ariaValueText={props.ariaValueText ?? `${Math.round(props.value)}%`}
		/>
	);
}
