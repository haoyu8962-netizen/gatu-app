import { AdaptiveModal, Button, ModalContent, ModalFooter, ModalHeader } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { type ChangeEvent, type ReactNode, useRef, useState } from "react";
import { NumberInput } from "@/components/ui/number-input";
import {
	formatPositionMarketClosePercent,
	type PositionCloseSizingIntent,
	type PositionMarketCloseResolution,
} from "@/domain/trade/position-market-close";
import { cn } from "@/lib/cn";
import { toBig, toFixed } from "@/lib/trade/numbers";
import { TradeSizeSlider } from "../components/trade-size-slider";

const QUICK_PERCENTAGES = [25, 50, 75, 100] as const;

interface PositionCloseDialogShellProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onOpenChangeComplete?: (open: boolean) => void;
	isMobile: boolean;
	dismissible: boolean;
	showMobileClose?: boolean;
	closeLabel: string;
	children: ReactNode;
}

export function PositionCloseDialogShell({
	open,
	onOpenChange,
	onOpenChangeComplete,
	isMobile,
	dismissible,
	showMobileClose = false,
	closeLabel,
	children,
}: PositionCloseDialogShellProps) {
	return (
		<AdaptiveModal
			open={open}
			onOpenChange={onOpenChange}
			onOpenChangeComplete={onOpenChangeComplete}
			presentation={isMobile ? "drawer" : "modal"}
			size="lg"
			dismissible={dismissible}
			showClose={dismissible && (!isMobile || showMobileClose)}
			showHandle={isMobile && dismissible}
			closeLabel={closeLabel}
			handleClassName="top-2.5 h-1 w-9 !rounded-[2px] bg-market-close-stroke-input"
			overlayClassName="!bg-scrim/60 !backdrop-blur-none"
			className="font-market-close max-h-[calc(100dvh-1rem)] !rounded-t-[20px] max-[1000px]:!border-0 !shadow-none min-[1001px]:max-w-[27.5rem] min-[1001px]:!rounded-[16px] min-[1001px]:!shadow-overlay min-[1001px]:[&>button]:!top-6 min-[1001px]:[&>button]:!right-6 min-[1001px]:[&>button]:!rounded-[8px] min-[1001px]:[&>button]:text-market-close-muted min-[1001px]:[&>button:hover]:bg-market-close-hover min-[1001px]:[&>button:hover]:text-market-close-fg min-[1001px]:[&>button:active]:bg-market-close-hover min-[1001px]:[&>button>svg]:size-[18px]"
		>
			{children}
		</AdaptiveModal>
	);
}

interface PositionCloseDialogHeaderProps {
	children: ReactNode;
}

export function PositionCloseDialogHeader({ children }: PositionCloseDialogHeaderProps) {
	return (
		<ModalHeader divider={false} className="gap-1 px-5 pt-7 pb-0 text-start min-[1001px]:px-6 min-[1001px]:pt-6">
			{children}
		</ModalHeader>
	);
}

interface PositionCloseDialogContentProps {
	children: ReactNode;
}

export function PositionCloseDialogContent({ children }: PositionCloseDialogContentProps) {
	return (
		<ModalContent className="flex flex-col gap-3.5 px-5 pt-3.5 pb-0 min-[1001px]:gap-5 min-[1001px]:px-6 min-[1001px]:pt-5">
			{children}
		</ModalContent>
	);
}

interface PositionCloseDialogFooterProps {
	children: ReactNode;
}

export function PositionCloseDialogFooter({ children }: PositionCloseDialogFooterProps) {
	return (
		<ModalFooter className="flex-col items-stretch gap-2 px-5 pt-3.5 pb-5 min-[1001px]:px-6 min-[1001px]:pt-5 min-[1001px]:pb-6">
			{children}
		</ModalFooter>
	);
}

export interface PositionCloseSummaryItem {
	key: string;
	label: ReactNode;
	value: ReactNode;
	valueClassName?: string;
	emphasized?: boolean;
}

interface PositionCloseSummaryProps {
	testId: string;
	ariaLabel: string;
	items: PositionCloseSummaryItem[];
}

export function PositionCloseSummary({ testId, ariaLabel, items }: PositionCloseSummaryProps) {
	return (
		<section data-testid={testId} aria-label={ariaLabel} className="py-3 min-[1001px]:py-3.5">
			<div className="flex justify-between gap-2 min-[1001px]:block min-[1001px]:space-y-2.5">
				{items.map((item) => (
					<div
						key={item.key}
						className={cn(
							"flex min-w-0 flex-col gap-[3px] text-start min-[1001px]:flex-row min-[1001px]:items-center min-[1001px]:justify-between min-[1001px]:gap-4",
							item.emphasized && "items-end text-right min-[1001px]:items-center min-[1001px]:text-start",
							item.emphasized &&
								"min-[1001px]:border-t min-[1001px]:border-dashed min-[1001px]:border-market-close-stroke-card min-[1001px]:pt-2.5",
						)}
					>
						<span className="max-w-full truncate text-[11px] leading-4 text-market-close-muted min-[1001px]:text-[13px] min-[1001px]:leading-[18px]">
							{item.label}
						</span>
						<span
							className={cn(
								"max-w-full truncate text-sm leading-[18px] tabular-nums min-[1001px]:text-[13px]",
								item.valueClassName,
							)}
						>
							{item.value}
						</span>
					</div>
				))}
			</div>
		</section>
	);
}

export interface PositionCloseSizingViewModel {
	effectivePercent: string;
	requestedPercent: string;
	sizeInput: string;
	percentInput: string;
	sliderValue: number;
}

export function createPositionCloseSizingViewModel(
	intent: PositionCloseSizingIntent,
	resolution: PositionMarketCloseResolution,
	szDecimals: number,
): PositionCloseSizingViewModel {
	const effectivePercent = formatPositionMarketClosePercent(resolution.effectivePercent);
	const requestedPercent = intent.kind === "max" ? "100" : intent.kind === "percent" ? intent.value : effectivePercent;
	return {
		effectivePercent,
		requestedPercent,
		sizeInput: intent.kind === "size" ? intent.value : toFixed(resolution.normalizedSize, szDecimals),
		percentInput: formatPercentInput(resolution.effectivePercent),
		sliderValue: getSliderValue(resolution.effectivePercent),
	};
}

interface PositionCloseSizingControlsProps {
	testId: string;
	sliderTestId: string;
	interactionIdentity: string;
	intent: PositionCloseSizingIntent;
	resolution: PositionMarketCloseResolution;
	viewModel: PositionCloseSizingViewModel;
	szDecimals: number;
	symbol: string;
	disabled: boolean;
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
	errorId,
	hasDescribedError,
	visibleSizingError,
	priceLabel,
	onIntentChange,
	onInteractionChange,
	children,
}: PositionCloseSizingControlsProps) {
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
				<span className="text-[13px] leading-[18px] font-semibold text-market-close-fg">{t`Close size`}</span>
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
					suffixClassName="right-3 text-[13px] leading-[18px] font-normal text-market-close-muted min-[1001px]:font-medium"
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
					suffixClassName="right-2.5 text-[13px] leading-[18px] font-normal text-market-close-muted"
				/>
			</div>

			<div className="grid grid-cols-4 gap-2">
				{QUICK_PERCENTAGES.map((percent) => {
					const selected =
						percent === 100 ? intent.kind === "max" : isSelectedPercentage(viewModel.requestedPercent, percent);
					return (
						<Button
							key={percent}
							type="button"
							variant="outline"
							intent="neutral"
							size="xs"
							aria-pressed={selected}
							disabled={disabled}
							onClick={() =>
								onIntentChange(percent === 100 ? { kind: "max" } : { kind: "percent", value: String(percent) })
							}
							className={cn(
								"h-auto min-h-0 !rounded-[8px] px-0 py-2 text-[13px] leading-[18px] font-semibold tabular-nums !shadow-none transition-all duration-[120ms] focus-visible:!border-market-close-focus focus-visible:!outline-none active:not-data-disabled:!scale-100 data-disabled:!cursor-not-allowed data-disabled:!border-market-close-stroke-card data-disabled:!bg-modal data-disabled:!text-market-close-subtle min-[1001px]:py-[7px]",
								selected
									? "!border-market-close-control !bg-market-close-control !text-market-close-on-control hover:!bg-market-close-control active:!bg-market-close-control"
									: "!border-market-close-stroke-card !bg-modal !text-market-close-muted hover:!bg-modal active:!bg-modal min-[1001px]:hover:!border-market-close-control min-[1001px]:hover:!text-market-close-control",
							)}
						>
							{percent === 100 ? t`Max` : `${percent}%`}
						</Button>
					);
				})}
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
					disabled={disabled}
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

function getSliderValue(value: string): number {
	const parsed = toBig(value);
	if (!parsed) return 0;
	if (parsed.lte(0)) return 0;
	if (parsed.gte(100)) return 100;
	return parsed.toNumber();
}

function formatPercentInput(value: string): string {
	const parsed = toBig(value);
	if (!parsed || parsed.lte(0)) return "0";
	if (parsed.gte(100)) return "100";
	return parsed.round(0, 1).toFixed(0);
}

function isSelectedPercentage(value: string, percentage: number): boolean {
	const parsed = toBig(value);
	return parsed?.eq(percentage) ?? false;
}
