import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useState } from "react";
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
	max: number;
	disabled: boolean;
	onChange: (value: number) => void;
	onDraftChange?: (value: number | null) => void;
	variant?: LeverageEditorVariant;
}

export function LeverageEditor({
	value,
	max,
	disabled,
	onChange,
	onDraftChange,
	variant = "sheet",
}: LeverageEditorProps) {
	const isSheet = variant === "sheet";
	const [draftText, setDraftText] = useState<string | null>(null);
	const stops = getLeverageStops(max);

	function handlePick(next: number) {
		setDraftText(null);
		onDraftChange?.(null);
		onChange(next);
	}

	function handleSliderDrag(next: number) {
		if (!onDraftChange) {
			onChange(next);
			return;
		}
		setDraftText(null);
		onDraftChange(next);
	}

	function handleInputChange(text: string) {
		setDraftText(text);
		const parsed = Number.parseInt(text, 10);
		if (!Number.isFinite(parsed)) return;
		onDraftChange?.(null);
		onChange(Math.min(max, Math.max(1, parsed)));
	}

	return (
		<div className="space-y-3">
			<div className="relative min-w-0">
				<LeverageSlider
					value={value}
					onChange={handleSliderDrag}
					onCommit={handlePick}
					max={max}
					disabled={disabled}
					thumbAlignment="edge"
					controlClassName={isSheet ? "h-9" : "h-8"}
					trackClassName={cn(
						"h-1 rounded-xs bg-trading-panel-stroke-card ring-0 shadow-none inset-shadow-none",
						isSheet ? "mx-3" : "mx-2.5",
					)}
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
						leftPercent: getLeverageStopFraction(stop, max),
						active: value >= stop,
					}))}
				/>
			</div>
			<div className="relative -mt-1 h-5 text-2xs tabular-nums">
				{stops.map((stop, index) => {
					const isFirst = index === 0;
					const isLast = index === stops.length - 1;
					return (
						<button
							key={stop}
							type="button"
							disabled={disabled}
							onClick={() => handlePick(stop)}
							style={isFirst || isLast ? undefined : { left: `${getLeverageStopFraction(stop, max)}%` }}
							className={cn(
								"absolute top-0 cursor-pointer whitespace-nowrap px-1 py-1 -my-1 disabled:cursor-not-allowed",
								isFirst && "left-0 -ml-1",
								isLast && "right-0 -mr-1",
								!isFirst && !isLast && "-translate-x-1/2",
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
					onBlur={() => setDraftText(null)}
					className="h-9 min-w-0 flex-1 bg-transparent px-0 text-base font-semibold tabular-nums text-trading-panel-fg"
					disabled={disabled}
				/>
				<span className="ml-2 shrink-0 text-xs text-trading-panel-muted">x</span>
			</div>
			{value > 10 && (
				<p className="rounded-[10px] border border-trading-panel-error-disabled-fill bg-trading-panel-error-soft px-2.5 py-2 text-xs leading-relaxed text-trading-panel-error">
					<Trans>High leverage significantly increases liquidation risk. Use with caution.</Trans>
				</p>
			)}
		</div>
	);
}
