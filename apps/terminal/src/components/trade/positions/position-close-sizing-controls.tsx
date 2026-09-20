import { useLingui } from "@lingui/react/macro";
import { type ChangeEvent, type ReactNode, useRef, useState } from "react";
import { NumberInput } from "@/components/ui/number-input";
import {
	formatPositionMarketClosePercent,
	type PositionCloseSizingIntent,
	type PositionMarketCloseResolution,
} from "@/domain/trade/position-market-close";
import { toBig, toFixed } from "@/lib/trade/numbers";
import type { PositionCloseSizingViewModel } from "@/lib/trade/position-close-sizing-presentation";
import { TradeSizeSlider } from "../components/trade-size-slider";

interface Props {
	testId: string;
	sliderTestId: string;
	interactionIdentity: string;
	intent: PositionCloseSizingIntent;
	resolution: PositionMarketCloseResolution;
	viewModel: PositionCloseSizingViewModel;
	szDecimals: number;
	symbol: string;
	disabled: boolean;
	paused: boolean;
	errorId?: string;
	hasDescribedError: boolean;
	visibleSizingError: string | null;
	priceLabel: ReactNode;
	onIntentChange: (intent: PositionCloseSizingIntent) => void;
	onInteractionChange?: (interacting: boolean) => void;
	children?: ReactNode;
}

export function PositionCloseSizingControls({
	testId,
	sliderTestId,
	interactionIdentity,
	intent,
	resolution,
	viewModel,
	szDecimals,
	symbol,
	disabled,
	paused,
	errorId,
	hasDescribedError,
	visibleSizingError,
	priceLabel,
	onIntentChange,
	onInteractionChange,
	children,
}: Props) {
	const { t } = useLingui();
	const requestedPercent = formatPositionMarketClosePercent(viewModel.requestedPercent);
	const effectivePercent = viewModel.effectivePercent;
	const requestedValue = toBig(requestedPercent);
	const effectiveValue = toBig(effectivePercent);
	const sliderStartIntentRef = useRef<{ identity: string; intent: PositionCloseSizingIntent } | null>(null);
	const [percentDraft, setPercentDraft] = useState<{ identity: string; value: string } | null>(null);
	if (percentDraft && percentDraft.identity !== interactionIdentity) setPercentDraft(null);
	const percentInput = percentDraft?.identity === interactionIdentity ? percentDraft.value : viewModel.percentInput;
	const sliderAriaValueText =
		requestedValue && effectiveValue && requestedValue.eq(effectiveValue)
			? `${requestedPercent}%`
			: t`${requestedPercent}% requested; ${effectivePercent}% after size precision`;

	function handleSizeBlur() {
		if (intent.kind !== "size" || resolution.errors.length > 0) return;
		onIntentChange({ kind: "size", value: toFixed(resolution.normalizedSize, szDecimals) });
	}

	function handlePercentChange(event: ChangeEvent<HTMLInputElement>) {
		if (disabled) return;
		const text = event.target.value;
		if (!/^\d*$/.test(text)) return;
		const value = text === "" ? "" : String(Math.min(100, Number(text)));
		setPercentDraft({ identity: interactionIdentity, value });
		onIntentChange(value === "100" ? { kind: "max" } : { kind: "percent", value });
	}

	function handlePercentBlur() {
		setPercentDraft(null);
	}

	function handleSliderChange(value: number) {
		if (disabled) return;
		const snapshot = sliderStartIntentRef.current;
		if (snapshot && snapshot.identity !== interactionIdentity) return;
		setPercentDraft(null);
		onIntentChange(value === 100 ? { kind: "max" } : { kind: "percent", value: String(value) });
	}

	function handleSliderInteractionStart() {
		sliderStartIntentRef.current = { identity: interactionIdentity, intent };
		setPercentDraft(null);
		onInteractionChange?.(true);
	}

	function handleSliderInteractionEnd() {
		sliderStartIntentRef.current = null;
		onInteractionChange?.(false);
	}

	function handleSliderCancel() {
		const snapshot = sliderStartIntentRef.current;
		sliderStartIntentRef.current = null;
		if (snapshot?.identity === interactionIdentity) onIntentChange(snapshot.intent);
	}

	function handleSliderCommit(value: number) {
		const snapshot = sliderStartIntentRef.current;
		sliderStartIntentRef.current = null;
		if (snapshot && snapshot.identity !== interactionIdentity) return;
		handleSliderChange(value);
	}

	return (
		<section data-testid={testId} aria-label={t`Close size`} className="flex flex-col gap-3.5 min-[1001px]:gap-2.5">
			<div className="hidden items-center justify-between gap-3 min-[1001px]:flex">
				<span className="text-2sm leading-[18px] font-semibold text-market-close-fg">{t`Close size`}</span>
				<span className="text-xs leading-[18px] text-market-close-muted">{priceLabel}</span>
			</div>

			<div className="grid grid-cols-[minmax(0,1fr)_94px] gap-2.5 min-[1001px]:grid-cols-[minmax(0,1fr)_114px]">
				<NumberInput
					aria-label={t`Close size`}
					aria-describedby={hasDescribedError ? errorId : undefined}
					aria-invalid={intent.kind === "size" && visibleSizingError !== null}
					value={viewModel.sizeInput}
					onChange={(event) => onIntentChange({ kind: "size", value: event.target.value })}
					onBlur={handleSizeBlur}
					maxAllowedDecimals={szDecimals}
					suffix={symbol}
					disabled={disabled}
					inputSize="xl"
					mobileSafe
					dir="ltr"
					className="h-[46px] !rounded-[10px] border-market-close-stroke-input bg-modal px-3 pr-12 text-base leading-5 font-semibold text-market-close-fg tabular-nums transition-[border-color] duration-[120ms] focus-visible:border-market-close-focus focus-visible:ring-0 min-[1001px]:h-11"
					suffixClassName="right-3 text-2sm leading-[18px] font-normal text-market-close-muted min-[1001px]:font-medium"
				/>

				<NumberInput
					aria-label={t`Close percentage`}
					aria-describedby={hasDescribedError ? errorId : undefined}
					aria-invalid={intent.kind === "percent" && visibleSizingError !== null}
					value={percentInput}
					onChange={handlePercentChange}
					onBlur={handlePercentBlur}
					allowDecimals={false}
					min={0}
					max={100}
					step={1}
					suffix="%"
					disabled={disabled}
					inputSize="xl"
					mobileSafe
					dir="ltr"
					className="h-[46px] !rounded-[10px] border-market-close-stroke-input bg-modal px-2.5 pr-[22px] text-right text-base leading-5 font-semibold text-market-close-fg tabular-nums transition-[border-color] duration-[120ms] focus-visible:border-market-close-focus focus-visible:ring-0 min-[1001px]:h-11"
					suffixClassName="right-2.5 text-2sm leading-[18px] font-normal text-market-close-muted"
				/>
			</div>

			<div className="min-h-0 min-[1001px]:mt-0.5" data-testid={sliderTestId}>
				<TradeSizeSlider
					value={viewModel.sliderValue}
					interactionIdentity={interactionIdentity}
					onPercentChange={handleSliderChange}
					onPercentCancel={handleSliderCancel}
					onPercentCommit={handleSliderCommit}
					onPercentInteractionStart={handleSliderInteractionStart}
					onPercentInteractionEnd={handleSliderInteractionEnd}
					disabled={disabled && !paused}
					paused={paused}
					ariaLabel={t`Close percentage slider`}
					ariaDescribedBy={hasDescribedError ? errorId : undefined}
					ariaInvalid={visibleSizingError !== null}
					ariaValueText={sliderAriaValueText}
				/>
			</div>

			{children}
		</section>
	);
}
