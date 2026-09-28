import { Trans, useLingui } from "@lingui/react/macro";
import { type KeyboardEvent, useEffect, useState } from "react";
import { NumberInput } from "@/components/ui/number-input";
import type { MarginTierInput } from "@/domain/trade/order/liquidation";
import { cn } from "@/lib/cn";
import { tradingInputFrameClass } from "@/lib/ui/trading-input";
import { LeveragePositionLimitRow } from "./leverage-position-limit-row";
import { LeverageSlider } from "./leverage-slider";

type LeverageEditorVariant = "sheet" | "modal";

const HIGH_LEVERAGE_WARNING_ABOVE = 10;

interface LeverageEditorProps {
	value: number;
	max: number;
	disabled: boolean;
	onChange: (value: number) => void;
	onDraftChange?: (value: number | null) => void;
	onInputValidityChange?: (isValid: boolean) => void;
	variant?: LeverageEditorVariant;
	marginTiers?: readonly MarginTierInput[] | null;
	quoteSymbol?: string | null;
}

export function parseLeverageInput(text: string, max: number): number | null {
	if (!/^[1-9]\d*$/.test(text)) return null;
	const parsed = Number(text);
	if (!Number.isSafeInteger(parsed) || parsed > max) return null;
	return parsed;
}

export function LeverageEditor({
	value,
	max,
	disabled,
	onChange,
	onDraftChange,
	onInputValidityChange,
	variant = "sheet",
	marginTiers,
	quoteSymbol,
}: LeverageEditorProps) {
	const { t } = useLingui();
	const isSheet = variant === "sheet";
	const [draftText, setDraftText] = useState<string | null>(null);
	const [heldHighLeverageWarning, setHeldHighLeverageWarning] = useState<boolean | null>(null);
	const showHighLeverageWarning = heldHighLeverageWarning ?? value > HIGH_LEVERAGE_WARNING_ABOVE;

	useEffect(() => {
		if (!disabled || draftText === null) return;
		setDraftText(null);
		onInputValidityChange?.(true);
	}, [disabled, draftText, onInputValidityChange]);

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

	function handleSliderInteractionStart(startValue: number) {
		setHeldHighLeverageWarning(showHighLeverageWarning);
		onDraftChange?.(startValue);
	}

	function handleSliderInteractionEnd() {
		setHeldHighLeverageWarning(null);
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
					onInteractionStart={handleSliderInteractionStart}
					onInteractionEnd={handleSliderInteractionEnd}
					onCancel={onDraftChange ? handleSliderCancel : undefined}
					max={max}
					disabled={disabled}
				/>
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
				<span className="ms-2 shrink-0 text-xs text-trading-panel-muted">x</span>
			</div>
			<LeveragePositionLimitRow marginTiers={marginTiers} quoteSymbol={quoteSymbol} leverage={value} />
			{showHighLeverageWarning && (
				<p className="rounded-[10px] border border-stroke-error-weak bg-trading-panel-error-soft px-2.5 py-2 text-xs leading-relaxed text-trading-panel-error">
					<Trans>High leverage significantly increases liquidation risk. Use with caution.</Trans>
				</p>
			)}
		</div>
	);
}
