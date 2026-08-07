import { CaretDownIcon } from "@phosphor-icons/react";
import type { ChangeEvent } from "react";
import { useState } from "react";
import { NumberInput } from "@/components/ui/number-input";
import { SIZE_PERCENT_OPTIONS } from "@/config/trade";
import { cn } from "@/lib/cn";
import { TradeSizeSlider } from "../components/trade-size-slider";

interface Props {
	canUsePercent: boolean;
	disabled: boolean;
	maxAllowedDecimals: number;
	onPercentChange: (percent: number) => void;
	onSizeChange: (event: ChangeEvent<HTMLInputElement>) => void;
	onSizeModeToggle: () => void;
	percentAriaLabel: string;
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
	sizeAriaLabel,
	sizeInput,
	sizeLabel,
	sizeModeLabel,
	sliderValue,
}: Props) {
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
			<div
				className={cn(
					"flex min-h-11 min-w-0 items-center rounded-[10px] border border-trading-panel-stroke-input bg-surface px-2.5",
					"focus-within:border-trading-panel-control focus-within:ring-2 focus-within:ring-trading-panel-control/10",
					"[&_[data-slot=input]]:border-0 [&_[data-slot=input]]:rounded-none [&_[data-slot=input]]:ring-0",
					disabled && "opacity-50",
				)}
			>
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
					className="h-10 min-w-0 flex-1 bg-transparent px-0 text-right text-base font-semibold tabular-nums text-trading-panel-fg"
					disabled={disabled}
				/>
				<button
					type="button"
					onClick={onSizeModeToggle}
					disabled={disabled}
					className="ml-2 inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-trading-panel-fg disabled:cursor-not-allowed"
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
						controlClassName="h-[33px]"
						trackClassName="mx-[9px] h-1 bg-trading-panel-card ring-0 shadow-none"
						indicatorClassName="bg-trading-panel-control shadow-none"
						thumbClassName="size-[18px] border-[3px] border-trading-panel-control bg-trading-panel-slider-thumb shadow-trading-panel-slider"
					/>
					<div className="pointer-events-none absolute inset-x-[9px] top-1/2 flex -translate-y-1/2 justify-between">
						{SIZE_PERCENT_OPTIONS.map((percent) => (
							<span
								key={percent}
								className={cn(
									"size-2 rounded-full border-2 bg-surface",
									sliderValue >= percent ? "border-trading-panel-control" : "border-trading-panel-stroke-card",
								)}
							/>
						))}
					</div>
				</div>

				<div
					className={cn(
						"flex h-[31px] w-[63px] shrink-0 items-center rounded-[8px] border border-trading-panel-stroke-input bg-surface px-2",
						"focus-within:border-trading-panel-control focus-within:ring-2 focus-within:ring-trading-panel-control/10",
						"[&_[data-slot=input]]:border-0 [&_[data-slot=input]]:rounded-none [&_[data-slot=input]]:ring-0",
					)}
				>
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
						className="h-7 min-w-0 bg-transparent px-0 text-right font-semibold tabular-nums text-trading-panel-fg"
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
