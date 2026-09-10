import type { ChangeEvent } from "react";
import { useState } from "react";
import type { InputSize } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { formatSliderPercent } from "@/domain/trade/order/size";
import { cn } from "@/lib/cn";
import { tradingInputFrameClass } from "@/lib/ui/trading-input";

interface Props {
	interactionIdentity?: string;
	ariaDescribedBy?: string;
	ariaInvalid?: boolean;
	ariaLabel: string;
	disabled: boolean;
	frameClassName?: string;
	inputClassName?: string;
	inputSize?: InputSize;
	mobileSafe?: boolean;
	onPercentChange: (percent: number) => void;
	value: number;
}

export function SizePercentInput({
	interactionIdentity,
	ariaDescribedBy,
	ariaInvalid,
	ariaLabel,
	disabled,
	frameClassName,
	inputClassName,
	inputSize = "sm",
	mobileSafe,
	onPercentChange,
	value,
}: Props) {
	const [percentDraft, setPercentDraft] = useState<string | null>(null);
	const [draftIdentity, setDraftIdentity] = useState(interactionIdentity);
	if (draftIdentity !== interactionIdentity) {
		setDraftIdentity(interactionIdentity);
		setPercentDraft(null);
	}
	const displayPercent = (draftIdentity === interactionIdentity ? percentDraft : null) ?? formatSliderPercent(value);

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
		<div className={cn(tradingInputFrameClass, frameClassName)}>
			<NumberInput
				aria-describedby={ariaDescribedBy}
				aria-invalid={ariaInvalid || undefined}
				aria-label={ariaLabel}
				inputMode="numeric"
				inputSize={inputSize}
				mobileSafe={mobileSafe}
				value={displayPercent}
				onBlur={handlePercentBlur}
				onChange={handlePercentChange}
				allowDecimals={false}
				min={0}
				max={100}
				className={cn(
					"h-7 min-w-0 bg-transparent px-0 text-right font-semibold tabular-nums",
					displayPercent === "0" ? "text-trading-panel-subtle" : "text-trading-panel-fg",
					inputClassName,
				)}
				disabled={disabled}
			/>
			<span className="ms-1 shrink-0 text-2xs text-trading-panel-subtle">%</span>
		</div>
	);
}
