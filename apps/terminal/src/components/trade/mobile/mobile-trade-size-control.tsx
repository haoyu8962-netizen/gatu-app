import { CaretDownIcon } from "@phosphor-icons/react";
import type { ChangeEvent } from "react";
import { useState } from "react";
import { NumberInput } from "@/components/ui/number-input";
import { SIZE_PERCENT_OPTIONS } from "@/config/trade";
import { cn } from "@/lib/cn";
import type { Side } from "@/lib/trade/types";
import { tradingInputFrameClass } from "@/lib/ui/trading-input";
import { SliderTickMarks } from "../components/slider-tick-marks";
import { TradeSizeSlider } from "../components/trade-size-slider";

interface Props {
	canUsePercent: boolean;
	disabled: boolean;
	maxAllowedDecimals: number;
	onPercentChange: (percent: number) => void;
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
	maxAllowedDecimals,
	onPercentChange,
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
	const [percentDraft, setPercentDraft] = useState<string | null>(null);
	const displayPercent = percentDraft ?? formatPercent(sliderValue);

	function handlePercentChange(event: ChangeEvent<HTMLInputElement>) {
		const nextValue = event.target.value;
		setPercentDraft(nextValue);
		if (nextValue.trim() === "") return;
		const parsedValue = Number(nextValue);
		if (!Number.isFinite(parsedValue)) return;
		const nextPercent = Math.min(100, Math.max(0, parsedValue));
		if (parsedValue > 100) setPercentDraft("100");
		onPercentChange(nextPercent);
	}

	function handlePercentBlur() {
		setPercentDraft(null);
	}

	return (
		<div className="space-y-2">
			<div className={cn(tradingInputFrameClass, "h-8 px-2.5", disabled && "opacity-50")}>
				<span className="mr-2 shrink-0 whitespace-nowrap text-2xs text-trading-panel-subtle">{sizeLabel}</span>
				<NumberInput
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
					className="relative ml-2 inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-trading-panel-fg after:absolute after:top-1/2 after:left-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] disabled:cursor-not-allowed"
				>
					{sizeModeLabel}
					<CaretDownIcon className="size-3 text-trading-panel-subtle" />
				</button>
			</div>

			<div className="flex items-center gap-2 pt-0.5">
				<div className="relative min-w-0 flex-1">
					<TradeSizeSlider
						value={sliderValue}
						onPercentChange={onPercentChange}
						disabled={!canUsePercent}
						ariaLabel={percentAriaLabel}
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

				<div className={cn(tradingInputFrameClass, "h-[31px] w-[63px] shrink-0 rounded-[8px] px-2")}>
					<NumberInput
						aria-label={percentAriaLabel}
						inputMode="decimal"
						inputSize="sm"
						mobileSafe
						value={displayPercent}
						onFocus={() => setPercentDraft(formatPercent(sliderValue))}
						onBlur={handlePercentBlur}
						onChange={handlePercentChange}
						maxAllowedDecimals={1}
						min={0}
						max={100}
						className={cn(
							"h-7 min-w-0 bg-transparent px-0 text-right font-semibold tabular-nums",
							displayPercent === "0" ? "text-trading-panel-subtle" : "text-trading-panel-fg",
						)}
						disabled={!canUsePercent}
					/>
					<span className="ml-1 shrink-0 text-2xs text-trading-panel-subtle">%</span>
				</div>
			</div>
		</div>
	);
}

function formatPercent(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return "0";
	return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}
