import {
	AdaptiveModal,
	Button,
	Checkbox,
	ModalContent,
	ModalDescription,
	ModalFooter,
	ModalHeader,
	ModalTitle,
} from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { SpinnerGapIcon, WarningIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { NumberInput } from "@/components/ui/number-input";
import {
	estimatePositionMarketClosePnl,
	formatPositionMarketClosePercent,
	resolvePositionMarketClosePercent,
	resolvePositionMarketCloseSize,
} from "@/domain/trade/position-market-close";
import { usePositionMarketCloseSubmit } from "@/hooks/trade/use-position-market-close-submit";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { formatPrice, formatToken, formatUSD } from "@/lib/format";
import { useMarketsInfo, useUserPositions } from "@/lib/hyperliquid";
import { toBig, toFixed } from "@/lib/trade/numbers";
import { readPositionMarketCloseConfirmationPreference } from "@/lib/trade/position-market-close-confirmation-preference";
import { getPositionMarketCloseErrorMessage } from "@/lib/trade/position-market-close-errors";
import { getValueColorClass } from "@/lib/ui/value-color";
import {
	type PositionMarketCloseSizingIntent,
	usePositionMarketCloseActions,
	usePositionMarketCloseSession,
} from "@/stores/use-global-modal-store";
import { TradeSizeSlider } from "../components/trade-size-slider";
import { TradingActionButton } from "../components/trading-action-button";

const SLIDER_MARKS = [0, 25, 50, 75, 100] as const;
const QUICK_PERCENTAGES = [25, 50, 75, 100] as const;
const HOLD_TO_CONFIRM_DURATION_MS = 800;

interface Props {
	holdToConfirm?: boolean;
	showPnl?: boolean;
}

export function PositionMarketCloseModal({ holdToConfirm = true, showPnl = true }: Props) {
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const [dismissFutureConfirmation, setDismissFutureConfirmation] = useState(false);
	const session = usePositionMarketCloseSession();
	const actions = usePositionMarketCloseActions();
	const { submit, isPending, isReconciling, error, resetError } = usePositionMarketCloseSubmit();
	const userPositions = useUserPositions();
	const { getMarketInfo } = useMarketsInfo();
	const positionCoin = session?.position.coin ?? "";
	const positionDex = session?.position.dex;
	const livePosition = session ? userPositions.getPosition(positionCoin, positionDex) : null;

	if (!session) return null;

	const { position, sizingIntent, sessionId, phase } = session;
	const openingPosition = resolvePositionMarketClosePercent({
		signedPositionSize: position.signedPositionSize,
		percent: "100",
		szDecimals: position.szDecimals,
	});
	const latestPosition = resolvePositionMarketClosePercent({
		signedPositionSize: livePosition?.szi ?? "",
		percent: "100",
		szDecimals: position.szDecimals,
	});
	const hasValidLivePosition = latestPosition.errors.length === 0;
	const liveDirectionMatches =
		hasValidLivePosition && latestPosition.side !== null && latestPosition.side === openingPosition.side;
	const signedPositionSize = hasValidLivePosition
		? (livePosition?.szi ?? position.signedPositionSize)
		: position.signedPositionSize;
	const positionStatus = getPositionStatus({
		isLoading: userPositions.isLoading,
		hasError: userPositions.hasError,
		isStale: userPositions.isStale,
		hasValidLivePosition,
		liveDirectionMatches,
	});
	const positionStatusMessage =
		positionStatus === "loading"
			? t`Loading the latest position...`
			: positionStatus === "unavailable"
				? t`Live position data is unavailable. Wait for the account connection to recover.`
				: positionStatus === "stale"
					? t`Live position data is stale. Wait for the account connection to recover.`
					: positionStatus === "closed"
						? t`This position is no longer open.`
						: positionStatus === "direction-changed"
							? t`This position changed sides. Close and reopen this dialog before submitting.`
							: null;
	const sizing =
		sizingIntent.kind === "size"
			? resolvePositionMarketCloseSize({
					signedPositionSize,
					closeSize: sizingIntent.value,
					szDecimals: position.szDecimals,
				})
			: resolvePositionMarketClosePercent({
					signedPositionSize,
					percent: sizingIntent.kind === "max" ? "100" : sizingIntent.value,
					szDecimals: position.szDecimals,
				});
	const effectivePercent = formatPositionMarketClosePercent(sizing.effectivePercent);
	const requestedPercent =
		sizingIntent.kind === "max" ? "100" : sizingIntent.kind === "percent" ? sizingIntent.value : effectivePercent;
	const sizeInput =
		sizingIntent.kind === "size" ? sizingIntent.value : toFixed(sizing.normalizedSize, position.szDecimals);
	const percentInput = sizingIntent.kind === "percent" ? sizingIntent.value : formatPercentInput(requestedPercent);
	const sliderValue = getSliderValue(requestedPercent);
	const canDismiss = phase === "idle" || phase === "reconciling";
	const canEdit = phase === "idle" && !isPending && !isReconciling && positionStatusMessage === null;
	const sizingError = sizing.errors[0] ? getPositionMarketCloseErrorMessage(sizing.errors[0]) : null;
	const visibleSizingError = isEmptyOrZeroSizingIntent(sizingIntent) ? null : sizingError;
	const visibleError = positionStatusMessage ?? error ?? visibleSizingError;
	const canSubmit = canEdit && sizing.errors.length === 0;
	const confirmationPreferenceAlreadyDismissed =
		readPositionMarketCloseConfirmationPreference({ owner: session.owner, env: session.env }) === "dismissed";
	const errorId = `position-market-close-error-${sessionId}`;
	const helperId = `position-market-close-helper-${sessionId}`;
	const marketInfo = getMarketInfo(position.coin);
	const sizeSymbol = marketInfo?.shortName ?? position.coin.split(":").pop() ?? position.coin;
	const markPx = marketInfo?.markPx ?? position.markPx;
	const estimatedPnl = estimatePositionMarketClosePnl({
		signedPositionSize,
		normalizedCloseSize: sizing.normalizedSize,
		unrealizedPnl: livePosition?.unrealizedPnl,
		entryPx: livePosition?.entryPx,
		markPx,
	});
	const formattedCloseSize = formatToken(sizing.normalizedSize, { decimals: position.szDecimals });
	const summaryItems = [
		{
			key: "available",
			label: t`Available to close`,
			value: formatToken(positionStatusMessage === null ? sizing.maxSize : null, {
				decimals: position.szDecimals,
				symbol: sizeSymbol,
			}),
			valueClassName: "font-semibold text-fg",
		},
		{
			key: "entry",
			label: t`Entry price`,
			value: formatPrice(livePosition?.entryPx, { szDecimals: position.szDecimals }),
			valueClassName: "font-medium text-fg",
		},
		{
			key: "mark",
			label: t`Mark price`,
			value: formatPrice(markPx, { szDecimals: position.szDecimals }),
			valueClassName: "font-medium text-fg",
		},
		...(showPnl
			? [
					{
						key: "pnl",
						label: t`Estimated PnL`,
						value: formatUSD(estimatedPnl, { compact: false, signDisplay: "exceptZero" }),
						valueClassName: cn("font-semibold", estimatedPnl && getValueColorClass(estimatedPnl)),
					},
				]
			: []),
	];

	function setSizingIntent(nextIntent: PositionMarketCloseSizingIntent) {
		if (!canEdit) return;
		resetError();
		actions.setSizingIntent(sessionId, nextIntent);
	}

	function handleOpenChange(open: boolean) {
		if (!open) actions.close(sessionId);
	}

	function handleSizeBlur() {
		if (sizingIntent.kind !== "size" || sizing.errors.length > 0) return;
		setSizingIntent({ kind: "size", value: toFixed(sizing.normalizedSize, position.szDecimals) });
	}

	function handlePercentBlur() {
		if (sizingIntent.kind !== "percent" || sizing.errors.length > 0) return;
		if (sliderValue >= 100) {
			setSizingIntent({ kind: "max" });
			return;
		}
		setSizingIntent({ kind: "percent", value: formatPercentInput(sizingIntent.value) });
	}

	function handleSliderChange(value: number) {
		setSizingIntent(value >= 100 ? { kind: "max" } : { kind: "percent", value: String(value) });
	}

	function handleSubmit() {
		if (!canSubmit) return;
		return submit({ sessionId, dismissFutureConfirmation });
	}

	const progressLabel =
		phase === "validating"
			? t`Validating...`
			: phase === "submitting"
				? t`Submitting...`
				: phase === "reconciling"
					? t`Confirming...`
					: null;

	return (
		<AdaptiveModal
			open
			onOpenChange={handleOpenChange}
			presentation={isMobile ? "drawer" : "modal"}
			size="lg"
			dismissible={canDismiss}
			showClose={!isMobile && canDismiss}
			showHandle={isMobile && canDismiss}
			closeLabel={t`Close`}
			handleClassName="top-2.5 h-1 w-9 bg-stroke-weak"
			overlayClassName="backdrop-blur-[2px] duration-100"
			className="max-h-[calc(100dvh-1rem)] rounded-t-20 border-0 shadow-overlay min-[1001px]:max-w-[27.5rem] min-[1001px]:rounded-16"
		>
			<ModalHeader divider={false} className="gap-1 px-5 pt-7 pb-0 text-left min-[1001px]:px-6 min-[1001px]:pt-6">
				<div className="flex min-w-0 items-center justify-between gap-3">
					<ModalTitle className="flex min-w-0 items-baseline gap-1.5 text-[17px] leading-6 font-bold min-[1001px]:text-[18px]">
						<span>{t`Market Close`}</span>
						<span className="truncate text-[13px] font-medium text-fg-muted min-[1001px]:hidden">{sizeSymbol}</span>
					</ModalTitle>
					<span className="shrink-0 text-[13px] text-fg-muted tabular-nums min-[1001px]:hidden">
						{t`Price: Market`}
					</span>
				</div>
				<ModalDescription className="sr-only max-w-sm text-[13px] leading-5 min-[1001px]:not-sr-only">
					{t`Reduce this position at the current market price. Filled trades cannot be reversed.`}
				</ModalDescription>
			</ModalHeader>

			<ModalContent className="space-y-5 px-5 pt-5 pb-0 min-[1001px]:px-6">
				<section
					data-testid="position-market-close-summary"
					aria-label={t`Position summary`}
					className="rounded-12 border border-stroke-weak bg-fill-weak px-3 py-3.5 min-[1001px]:px-4"
				>
					<div
						className={cn(
							"grid gap-2 min-[1001px]:block min-[1001px]:space-y-2.5",
							showPnl ? "grid-cols-4" : "grid-cols-3",
						)}
					>
						{summaryItems.map((item) => (
							<div
								key={item.key}
								className={cn(
									"flex min-w-0 flex-col gap-1 text-center min-[1001px]:flex-row min-[1001px]:items-center min-[1001px]:justify-between min-[1001px]:gap-4 min-[1001px]:text-left",
									item.key === "pnl" &&
										"min-[1001px]:border-t min-[1001px]:border-dashed min-[1001px]:border-stroke-weak min-[1001px]:pt-2.5",
								)}
							>
								<span className="truncate text-[11px] leading-4 text-fg-muted min-[1001px]:text-[13px]">
									{item.label}
								</span>
								<span
									className={cn(
										"truncate text-sm leading-5 tabular-nums min-[1001px]:text-[13px]",
										item.valueClassName,
									)}
								>
									{item.value}
								</span>
							</div>
						))}
					</div>
				</section>

				<section data-testid="position-market-close-sizing" aria-label={t`Close size`} className="space-y-2.5">
					<div className="hidden items-center justify-between gap-3 min-[1001px]:flex">
						<span className="text-[13px] font-semibold text-fg">{t`Close size`}</span>
						<span className="text-xs text-fg-muted">{t`Price: Market`}</span>
					</div>

					<div className="grid grid-cols-[minmax(0,1fr)_5.25rem] gap-2.5 min-[1001px]:grid-cols-[minmax(0,1fr)_5.75rem]">
						<NumberInput
							aria-label={t`Close size`}
							aria-describedby={visibleError ? errorId : undefined}
							aria-invalid={sizingIntent.kind === "size" && visibleSizingError !== null}
							value={sizeInput}
							onChange={(event) => setSizingIntent({ kind: "size", value: event.target.value })}
							onBlur={handleSizeBlur}
							maxAllowedDecimals={position.szDecimals}
							suffix={sizeSymbol}
							disabled={!canEdit}
							inputSize="xl"
							mobileSafe
							dir="ltr"
							className="h-12 rounded-10 pr-16 text-base font-semibold tabular-nums min-[1001px]:h-11"
						/>

						<NumberInput
							aria-label={t`Close percentage`}
							aria-describedby={visibleError ? errorId : undefined}
							aria-invalid={sizingIntent.kind === "percent" && visibleSizingError !== null}
							value={percentInput}
							onChange={(event) => setSizingIntent({ kind: "percent", value: event.target.value })}
							onBlur={handlePercentBlur}
							maxAllowedDecimals={1}
							suffix="%"
							disabled={!canEdit}
							inputSize="xl"
							mobileSafe
							dir="ltr"
							className="h-12 rounded-10 pr-7 text-right text-base font-semibold tabular-nums min-[1001px]:h-11"
						/>
					</div>

					<div className="grid grid-cols-4 gap-2">
						{QUICK_PERCENTAGES.map((percent) => {
							const selected = isSelectedPercentage(requestedPercent, percent);
							return (
								<Button
									key={percent}
									type="button"
									variant={selected ? "filled" : "outline"}
									intent="neutral"
									size="xs"
									aria-pressed={selected}
									disabled={!canEdit}
									onClick={() =>
										setSizingIntent(percent === 100 ? { kind: "max" } : { kind: "percent", value: String(percent) })
									}
									className="h-9 rounded-8 px-0 text-[13px] font-semibold shadow-none tabular-nums transition-all duration-100 min-[1001px]:h-8"
								>
									{percent === 100 ? t`Max` : `${percent}%`}
								</Button>
							);
						})}
					</div>

					<div className="relative flex min-h-11 items-center" data-testid="position-market-close-slider">
						<TradeSizeSlider
							value={sliderValue}
							onPercentChange={handleSliderChange}
							disabled={!canEdit}
							thumbSize="lg"
							thumbAlignment="edge"
							ariaLabel={t`Close percentage slider`}
							ariaDescribedBy={visibleError ? errorId : undefined}
							ariaInvalid={visibleSizingError !== null}
							ariaValueText={t`${requestedPercent}% requested; ${effectivePercent}% after size precision`}
							className="relative z-10"
							controlClassName="h-9 min-[1001px]:h-8"
							trackClassName="h-1 rounded-full bg-stroke-weak ring-0 shadow-none"
							indicatorClassName="min-w-0 rounded-full bg-fill shadow-none"
							thumbClassName="z-20 size-6 border-[3px] border-stroke-strong bg-modal shadow-md before:-inset-2.5 min-[1001px]:size-5 min-[1001px]:before:-inset-1.5"
						/>
						<div
							className="pointer-events-none absolute inset-x-3 top-1/2 z-10 flex -translate-y-1/2 justify-between min-[1001px]:inset-x-2.5"
							aria-hidden="true"
						>
							{SLIDER_MARKS.map((mark) => (
								<span
									key={mark}
									className={cn(
										"size-2 rounded-full",
										mark <= sliderValue ? "border-2 border-fill bg-fill" : "border-2 border-stroke-weak bg-modal",
									)}
								/>
							))}
						</div>
					</div>

					{!isMobile && (
						<Checkbox
							size="md"
							checked={confirmationPreferenceAlreadyDismissed || dismissFutureConfirmation}
							onCheckedChange={setDismissFutureConfirmation}
							disabled={confirmationPreferenceAlreadyDismissed || !canEdit}
							className={cn("w-fit", confirmationPreferenceAlreadyDismissed && canEdit && "opacity-100")}
							label={t`Don't show this confirmation again`}
						/>
					)}
				</section>

				{phase === "reconciling" && (
					<output
						id={errorId}
						aria-live="polite"
						className="flex items-start gap-2 rounded-8 bg-warning-soft p-2.5 text-xs text-warning"
					>
						<WarningIcon className="mt-0.5 size-3.5 shrink-0" weight="fill" aria-hidden="true" />
						<span className="flex flex-col gap-1">
							<span>{error ?? t`The order is still being confirmed.`}</span>
							<span>{t`Closing this dialog will not cancel it.`}</span>
						</span>
					</output>
				)}

				{visibleError && phase !== "reconciling" && (
					<div
						id={errorId}
						role={userPositions.isLoading ? "status" : "alert"}
						aria-live={userPositions.isLoading ? "polite" : "assertive"}
						className={cn(
							"flex items-start gap-2 rounded-8 p-2.5 text-xs",
							userPositions.isLoading ? "text-fg-muted" : "bg-error-soft text-error",
						)}
					>
						{userPositions.isLoading ? (
							<SpinnerGapIcon
								className="mt-0.5 size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
								aria-hidden="true"
							/>
						) : (
							<WarningIcon className="mt-0.5 size-3.5 shrink-0" weight="fill" aria-hidden="true" />
						)}
						<span className="leading-relaxed">{visibleError}</span>
					</div>
				)}

				<p className="sr-only" aria-live="polite">
					{progressLabel}
				</p>
			</ModalContent>

			<ModalFooter className="flex-col items-stretch gap-2 px-5 pt-5 pb-5 min-[1001px]:px-6 min-[1001px]:pb-6">
				<TradingActionButton
					onClick={handleSubmit}
					requireReadyConfirmation
					disabled={!canSubmit}
					intent="error"
					size="lg"
					holdDurationMs={holdToConfirm ? HOLD_TO_CONFIRM_DURATION_MS : undefined}
					holdProgressClassName="bg-black/20"
					aria-describedby={helperId}
					containerClassName="w-full items-stretch"
					className="relative min-h-12 w-full overflow-hidden rounded-12 text-[15px] data-disabled:!bg-fill-disabled data-disabled:!text-fg-muted"
				>
					{progressLabel ? (
						<>
							<SpinnerGapIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
							{progressLabel}
						</>
					) : (
						t`Market Close ${formattedCloseSize} ${sizeSymbol}`
					)}
				</TradingActionButton>
				<p id={helperId} className="text-center text-xs leading-4 text-fg-muted/70">
					{holdToConfirm
						? t`Hold to confirm · Filled trades cannot be reversed`
						: t`Click to submit · Filled trades cannot be reversed`}
				</p>
			</ModalFooter>
		</AdaptiveModal>
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
	if (!parsed) return "0.0";
	return parsed.round(1, 0).toFixed(1);
}

function isSelectedPercentage(value: string, percentage: number): boolean {
	const parsed = toBig(value);
	return parsed?.eq(percentage) ?? false;
}

function isEmptyOrZeroSizingIntent(intent: PositionMarketCloseSizingIntent): boolean {
	if (intent.kind === "max") return false;
	const value = toBig(intent.value);
	return intent.value.trim() === "" || value?.eq(0) === true;
}

type PositionStatus = "loading" | "unavailable" | "stale" | "closed" | "direction-changed" | null;

interface PositionStatusInput {
	isLoading: boolean;
	hasError: boolean;
	isStale: boolean;
	hasValidLivePosition: boolean;
	liveDirectionMatches: boolean;
}

function getPositionStatus({
	isLoading,
	hasError,
	isStale,
	hasValidLivePosition,
	liveDirectionMatches,
}: PositionStatusInput): PositionStatus {
	if (isLoading) return "loading";
	if (hasError) return "unavailable";
	if (isStale) return "stale";
	if (!hasValidLivePosition) return "closed";
	if (!liveDirectionMatches) return "direction-changed";
	return null;
}
