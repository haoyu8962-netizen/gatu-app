import { useDirection } from "@base-ui/react/direction-provider";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { type KeyboardEvent, useEffect, useState } from "react";
import { NumberInput } from "@/components/ui/number-input";
import { cn } from "@/lib/cn";
import { tradingInputFrameClass } from "@/lib/ui/trading-input";
import { SliderTickMarks } from "../components/slider-tick-marks";
import { LeverageSlider } from "./leverage-slider";

function getLeverageStops(max: number): number[] {
	if (max <= 1) return [1];
	const quarter = (max - 1) / 4;
	const stops = [1, Math.round(1 + quarter), Math.round(1 + 2 * quarter), Math.round(1 + 3 * quarter), max];
	return [...new Set(stops)];
}

function getLeverageStopFraction(stop: number, max: number): number {
	if (max <= 1) return 0;
	return ((stop - 1) / (max - 1)) * 100;
}

type LeverageEditorVariant = "sheet" | "modal";

interface LeverageEditorProps {
	value: number;
	riskValue?: number;
	max: number;
	disabled: boolean;
	onChange: (value: number) => void;
	onDraftChange?: (value: number | null) => void;
	onInputValidityChange?: (isValid: boolean) => void;
	variant?: LeverageEditorVariant;
}

export function parseLeverageInput(text: string, max: number): number | null {
	if (!/^[1-9]\d*$/.test(text)) return null;
	const parsed = Number(text);
	if (!Number.isSafeInteger(parsed) || parsed > max) return null;
	return parsed;
}

export function LeverageEditor({
	value,
	riskValue = value,
	max,
	disabled,
	onChange,
	onDraftChange,
	onInputValidityChange,
	variant = "sheet",
}: LeverageEditorProps) {
	const direction = useDirection();
	const isSheet = variant === "sheet";
	const [draftText, setDraftText] = useState<string | null>(null);
	const stops = getLeverageStops(max);
	const controlInsetClassName = isSheet ? "mx-3" : "mx-2.5";

	useEffect(() => {
		if (!disabled || draftText === null) return;
		setDraftText(null);
		onInputValidityChange?.(true);
	}, [disabled, draftText, onInputValidityChange]);

	function getPhysicalStopFraction(stop: number): number {
		const fraction = getLeverageStopFraction(stop, max);
		return direction === "rtl" ? 100 - fraction : fraction;
	}

	function handlePick(next: number) {
		clearTextDraft();
		onDraftChange?.(null);
		onChange(next);
	}

	function handleSliderDrag(next: number) {
		clearTextDraft();
		if (!onDraftChange) {
			onChange(next);
			return;
		}
		onDraftChange(next);
	}

	function handleSliderCancel() {
		clearTextDraft();
		onDraftChange?.(null);
	}

	function handleInputChange(text: string) {
		setDraftText(text);
		onDraftChange?.(null);
		const parsed = parseLeverageInput(text, max);
		onInputValidityChange?.(parsed !== null);
		if (parsed !== null) onChange(parsed);
	}

	function clearTextDraft() {
		if (draftText === null) return;
		setDraftText(null);
		onInputValidityChange?.(true);
	}

	function restoreCanonicalValue() {
		clearTextDraft();
	}

	function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		if (event.key !== "Escape" && event.key !== "Enter") return;
		event.preventDefault();
		event.stopPropagation();
		if (event.key === "Enter" && draftText !== null && parseLeverageInput(draftText, max) === null) return;
		restoreCanonicalValue();
	}

	return (
		<div className="space-y-3">
			<div className="relative min-w-0">
				<LeverageSlider
					value={value}
					onChange={handleSliderDrag}
					onCommit={handlePick}
					onCancel={onDraftChange ? handleSliderCancel : undefined}
					max={max}
					disabled={disabled}
					controlClassName={cn("w-auto", controlInsetClassName, isSheet ? "h-9" : "h-8")}
					trackClassName="h-1 rounded-xs bg-trading-panel-stroke-card ring-0 shadow-none inset-shadow-none"
					indicatorClassName="min-w-0 rounded-xs bg-trading-panel-control shadow-none inset-shadow-none"
					thumbClassName={cn(
						"border-[3px] border-trading-panel-control bg-trading-panel-slider-thumb shadow-trading-panel-slider",
						isSheet ? "size-6" : "size-5",
					)}
				/>
				<SliderTickMarks
					insetClassName={isSheet ? "inset-x-3" : "inset-x-2.5"}
					activeClassName="border-trading-panel-control bg-trading-panel-control"
					positions={stops.map((stop) => ({
						key: stop,
						leftPercent: getPhysicalStopFraction(stop),
						active: value >= stop,
					}))}
				/>
			</div>
			<div
				dir="ltr"
				className="grid h-11 items-center text-2xs tabular-nums"
				style={{ gridTemplateColumns: `repeat(${stops.length}, minmax(44px, 1fr))` }}
			>
				{stops.map((stop, index) => {
					return (
						<button
							key={stop}
							type="button"
							disabled={disabled}
							onClick={() => handlePick(stop)}
							style={{ gridColumn: direction === "rtl" ? stops.length - index : index + 1 }}
							className={cn(
								"grid size-11 cursor-pointer place-items-center justify-self-center whitespace-nowrap p-0 disabled:cursor-not-allowed",
								value === stop
									? "font-bold text-trading-panel-fg"
									: "text-trading-panel-subtle hover:text-trading-panel-fg",
							)}
						>
							{stop}x
						</button>
					);
				})}
			</div>
			<div className={cn(tradingInputFrameClass, disabled && "opacity-50")}>
				<NumberInput
					aria-label={t`Leverage`}
					allowDecimals={false}
					min={1}
					max={max}
					mobileSafe={isSheet}
					value={draftText ?? String(value)}
					onChange={(e) => handleInputChange(e.target.value)}
					onBlur={restoreCanonicalValue}
					onKeyDown={handleInputKeyDown}
					aria-invalid={draftText !== null && parseLeverageInput(draftText, max) === null}
					className="h-9 min-w-0 flex-1 bg-transparent px-0 text-base font-semibold tabular-nums text-trading-panel-fg"
					disabled={disabled}
				/>
				<span className="ml-2 shrink-0 text-xs text-trading-panel-muted">x</span>
			</div>
			{riskValue > 10 && (
				<p className="rounded-[10px] border border-stroke-error-weak bg-trading-panel-error-soft px-2.5 py-2 text-xs leading-relaxed text-trading-panel-error">
					<Trans>High leverage significantly increases liquidation risk. Use with caution.</Trans>
				</p>
			)}
		</div>
	);
}
