import { CaretDownIcon } from "@phosphor-icons/react";
import type { ChangeEvent } from "react";
import { NumberInput } from "@/components/ui/number-input";
import { SIZE_PERCENT_OPTIONS } from "@/config/trade";
import { cn } from "@/lib/cn";
import type { Side } from "@/lib/trade/types";
import { tradingInputFrameClass } from "@/lib/ui/trading-input";
import { SizePercentInput } from "../components/size-percent-input";
import { SliderTickMarks } from "../components/slider-tick-marks";
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
	onSizeChange,
	onSizeModeToggle,
	percentAriaLabel,
	side,
	sizeAriaLabel,
	sizeInput,
	sizeLabel,
	sizeModeLabel,
	sliderValue,
}: Props) {
	const accentBgClass = side === "buy" ? "bg-trading-panel-success" : "bg-trading-panel-error";
	const accentBorderClass = side === "buy" ? "border-trading-panel-success" : "border-trading-panel-error";

	return (
		<div className="space-y-2">
			<div className={cn(tradingInputFrameClass, "h-8 px-2.5", disabled && "opacity-50")}>
				<span className="me-2 shrink-0 whitespace-nowrap text-2xs text-trading-panel-subtle">{sizeLabel}</span>
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
					className="h-7 min-w-0 flex-1 bg-transparent px-0 text-right text-base font-semibold tabular-nums text-trading-panel-fg"
					disabled={disabled}
				/>
				<button
					type="button"
					onClick={onSizeModeToggle}
					disabled={disabled}
					className="relative ms-2 inline-flex h-8 min-w-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap text-xs font-semibold text-trading-panel-fg after:absolute after:inset-0 after:content-[''] disabled:cursor-not-allowed"
				>
					{sizeModeLabel}
					<CaretDownIcon className="size-3 text-trading-panel-subtle" />
				</button>
			</div>

			<div className="flex items-center gap-2 pt-0.5">
				<div className="relative min-w-0 flex-1">
					<TradeSizeSlider
						value={sliderValue}
						interactionIdentity={interactionIdentity}
						onPercentChange={onPercentChange}
						onPercentCancel={onPercentCancel}
						onPercentCommit={onPercentCommit}
						onPercentInteractionStart={onPercentInteractionStart}
						disabled={!canUsePercent}
						ariaLabel={percentAriaLabel}
						ariaDescribedBy={hasError ? errorId : undefined}
						ariaInvalid={hasError || undefined}
						thumbSize="md"
						thumbAlignment="edge"
						controlClassName="h-[33px]"
						trackClassName="mx-[9px] h-1 rounded-xs bg-trading-panel-stroke-card ring-0 shadow-none inset-shadow-none"
						indicatorClassName={cn("min-w-0 rounded-xs shadow-none inset-shadow-none", accentBgClass)}
						thumbClassName={cn(
							"size-[18px] border-[3px] bg-trading-panel-slider-thumb shadow-trading-panel-slider",
							accentBorderClass,
						)}
					/>
					<SliderTickMarks
						insetClassName="inset-x-[9px]"
						activeClassName={cn(accentBorderClass, accentBgClass)}
						positions={SIZE_PERCENT_OPTIONS.map((percent) => ({
							key: percent,
							leftPercent: percent,
							active: sliderValue >= percent,
						}))}
					/>
				</div>

				<SizePercentInput
					value={sliderValue}
					onPercentChange={onPercentChange}
					disabled={!canUsePercent}
					ariaLabel={percentAriaLabel}
					ariaDescribedBy={hasError ? errorId : undefined}
					ariaInvalid={hasError || undefined}
					frameClassName="h-[31px] w-20 shrink-0 rounded-[8px] px-2"
					mobileSafe
				/>
			</div>
		</div>
	);
}
