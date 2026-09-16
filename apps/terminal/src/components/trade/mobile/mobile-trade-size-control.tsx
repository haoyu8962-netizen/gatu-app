import type { ChangeEvent } from "react";
import { sizePercent, sizeValue } from "@/components/trade/mobile/mobile-trade-size-view";
import { NumberInput } from "@/components/ui/number-input";
import type { Side } from "@/lib/trade/types";
import { SizePercentInput } from "../components/size-percent-input";
import { TradeSizeSlider } from "../components/trade-size-slider";
import { MobileTradeSizeView } from "./mobile-trade-size-view";

interface Props {
	canUsePercent: boolean;
	disabled: boolean;
	errorId?: string;
	hasError?: boolean;
	interactionIdentity: string;
	maxAllowedDecimals: number;
	onPercentChange: (percent: number) => void;
	onPercentCancel: (percent: number) => void;
	onPercentCommit: (percent: number) => void;
	onPercentInteractionStart?: (percent: number) => void;
	onPercentInteractionEnd?: () => void;
	onSizeChange: (event: ChangeEvent<HTMLInputElement>) => void;
	onSizeModeToggle: () => void;
	percentAriaLabel: string;
	side: Side;
	sizeAriaLabel: string;
	sizeInput: string;
	sizeLabel: string;
	sizeModeLabel: string;
	sliderValue: number;
}

export function MobileTradeSizeControl({
	canUsePercent,
	disabled,
	errorId,
	hasError = false,
	interactionIdentity,
	maxAllowedDecimals,
	onPercentChange,
	onPercentCancel,
	onPercentCommit,
	onPercentInteractionStart,
	onPercentInteractionEnd,
	onSizeChange,
	onSizeModeToggle,
	percentAriaLabel,
	sizeAriaLabel,
	sizeInput,
	sizeLabel,
	sizeModeLabel,
	sliderValue,
}: Props) {
	return (
		<MobileTradeSizeView
			label={sizeLabel}
			unit={sizeModeLabel}
			disabled={disabled}
			onUnitClick={onSizeModeToggle}
			input={
				<NumberInput
					aria-describedby={hasError ? errorId : undefined}
					aria-invalid={hasError || undefined}
					aria-label={sizeAriaLabel}
					inputMode="decimal"
					inputSize="lg"
					mobileSafe
					placeholder="0.00"
					value={sizeInput}
					onChange={onSizeChange}
					maxAllowedDecimals={maxAllowedDecimals}
					className={sizeValue}
					disabled={disabled}
				/>
			}
			slider={
				<TradeSizeSlider
					value={sliderValue}
					interactionIdentity={interactionIdentity}
					onPercentChange={onPercentChange}
					onPercentCancel={onPercentCancel}
					onPercentCommit={onPercentCommit}
					onPercentInteractionStart={onPercentInteractionStart}
					onPercentInteractionEnd={onPercentInteractionEnd}
					disabled={!canUsePercent}
					ariaLabel={percentAriaLabel}
					ariaDescribedBy={hasError ? errorId : undefined}
					ariaInvalid={hasError || undefined}
				/>
			}
			percent={
				<SizePercentInput
					interactionIdentity={interactionIdentity}
					value={sliderValue}
					onPercentChange={onPercentChange}
					disabled={!canUsePercent}
					ariaLabel={percentAriaLabel}
					ariaDescribedBy={hasError ? errorId : undefined}
					ariaInvalid={hasError || undefined}
					frameClassName={sizePercent}
					mobileSafe
				/>
			}
		/>
	);
}
