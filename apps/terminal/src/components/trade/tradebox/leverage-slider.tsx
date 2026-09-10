import { useLingui } from "@lingui/react/macro";
import { TradeSlider } from "../components/trade-slider";

interface Props {
	value: number;
	onChange: (value: number) => void;
	onCommit?: (value: number) => void;
	onCancel?: () => void;
	onInteractionStart?: (startValue: number) => void;
	onInteractionEnd?: () => void;
	max: number;
	interactionIdentity?: string;
	disabled?: boolean;
	className?: string;
}

export function LeverageSlider({ value, onChange, onCommit, onCancel, max, ...props }: Props) {
	const { t } = useLingui();
	return (
		<TradeSlider
			{...props}
			value={value}
			min={1}
			max={max}
			ariaLabel={t`Leverage`}
			ariaValueText={`${value}x`}
			onPreview={onChange}
			onCommit={(next) => (onCommit ?? onChange)(next)}
			onCancel={(startValue) => {
				if (onCancel) onCancel();
				else onChange(startValue);
			}}
		/>
	);
}
