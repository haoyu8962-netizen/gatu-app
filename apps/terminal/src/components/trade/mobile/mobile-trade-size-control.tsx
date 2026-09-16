import { CaretDownIcon } from "@phosphor-icons/react";
import type { ChangeEvent } from "react";
import * as mobileChrome from "@/components/trade/mobile/mobile-chrome-classes";
import { NumberInput } from "@/components/ui/number-input";
import { cn } from "@/lib/cn";
import type { Side } from "@/lib/trade/types";
import { tradingInputFrameClass } from "@/lib/ui/trading-input";
import { SizePercentInput } from "../components/size-percent-input";
import { TradeSizeSlider } from "../components/trade-size-slider";

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
		<div className="space-y-2">
			<div className={cn(tradingInputFrameClass, mobileChrome.sizeFrame, disabled && "opacity-50")}>
				<span className={mobileChrome.sizeLabel}>{sizeLabel}</span>
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
					className={mobileChrome.sizeValue}
					disabled={disabled}
				/>
				<button type="button" onClick={onSizeModeToggle} disabled={disabled} className={mobileChrome.sizeUnit}>
					{sizeModeLabel}
					<CaretDownIcon className="size-3 text-trading-panel-subtle" />
				</button>
			</div>

			<div className={mobileChrome.sizeSliderRow}>
				<div className="relative min-w-0 flex-1">
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
				</div>

				<SizePercentInput
					interactionIdentity={interactionIdentity}
					value={sliderValue}
					onPercentChange={onPercentChange}
					disabled={!canUsePercent}
					ariaLabel={percentAriaLabel}
					ariaDescribedBy={hasError ? errorId : undefined}
					ariaInvalid={hasError || undefined}
					frameClassName={mobileChrome.sizePercent}
					mobileSafe
				/>
			</div>
		</div>
	);
}
