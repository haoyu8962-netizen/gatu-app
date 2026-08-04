import {
	AdaptiveModal,
	Checkbox,
	ModalContent,
	ModalDescription,
	ModalFooter,
	ModalHeader,
	ModalTitle,
} from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { SpinnerGapIcon, WarningIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { FieldLabel } from "@/components/ui/field-label";
import { InfoRow, InfoRowGroup } from "@/components/ui/info-row";
import { NumberInput } from "@/components/ui/number-input";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import {
	formatPositionMarketClosePercent,
	resolvePositionMarketClosePercent,
	resolvePositionMarketCloseSize,
} from "@/domain/trade/position-market-close";
import { usePositionMarketCloseSubmit } from "@/hooks/trade/use-position-market-close-submit";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { formatNumber, formatPrice, formatToken } from "@/lib/format";
import { useMarketsInfo, useSubscription, useUserPositions } from "@/lib/hyperliquid";
import { toBig } from "@/lib/trade/numbers";
import { readPositionMarketCloseConfirmationPreference } from "@/lib/trade/position-market-close-confirmation-preference";
import { getPositionMarketCloseErrorMessage } from "@/lib/trade/position-market-close-errors";
import {
	type PositionMarketCloseSizingIntent,
	usePositionMarketCloseActions,
	usePositionMarketCloseSession,
} from "@/stores/use-global-modal-store";
import { useMarketOrderSlippagePercent } from "@/stores/use-global-settings-store";
import { TradeSizeSlider } from "../components/trade-size-slider";
import { TradingActionButton } from "../components/trading-action-button";

const SLIDER_MARKS = [0, 25, 50, 75, 100] as const;

export function PositionMarketCloseModal() {
	const isMobile = useIsMobile();
	const [dismissFutureConfirmation, setDismissFutureConfirmation] = useState(false);
	const session = usePositionMarketCloseSession();
	const actions = usePositionMarketCloseActions();
	const { submit, isPending, isReconciling, error, resetError } = usePositionMarketCloseSubmit();
	const userPositions = useUserPositions();
	const { getMarketInfo } = useMarketsInfo();
	const slippagePercent = useMarketOrderSlippagePercent();
	const positionCoin = session?.position.coin ?? "";
	const positionDex = session?.position.dex;
	const livePosition = session ? userPositions.getPosition(positionCoin, positionDex) : null;
	const {
		data: liveAssetCtx,
		status: marketDataStatus,
		isStale: isMarketDataStale,
	} = useSubscription("activeAssetCtx", { coin: positionCoin }, { enabled: session !== null });

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
	const sizeInput = sizingIntent.kind === "size" ? sizingIntent.value : sizing.normalizedSize;
	const effectivePercent = formatPositionMarketClosePercent(sizing.effectivePercent);
	const requestedPercent =
		sizingIntent.kind === "max" ? "100" : sizingIntent.kind === "percent" ? sizingIntent.value : effectivePercent;
	const percentInput = requestedPercent;
	const sliderValue = getSliderValue(requestedPercent);
	const canDismiss = phase === "idle" || phase === "reconciling";
	const canEdit = phase === "idle" && !isPending && !isReconciling && positionStatus === null;
	const sizingError = sizing.errors[0] ? getPositionMarketCloseErrorMessage(sizing.errors[0]) : null;
	const visibleError = positionStatus ?? error ?? sizingError;
	const canSubmit = canEdit && sizing.errors.length === 0;
	const confirmationPreferenceAlreadyDismissed =
		readPositionMarketCloseConfirmationPreference({ owner: session.owner, env: session.env }) === "dismissed";
	const errorId = `position-market-close-error-${sessionId}`;
	const marketInfo = getMarketInfo(position.coin);
	const displayName = marketInfo?.pairName ?? position.coin;
	const positionDirectionLabel =
		openingPosition.side === "sell" ? t`Long position` : openingPosition.side === "buy" ? t`Short position` : null;
	const sizeSymbol = marketInfo?.shortName ?? position.coin.split(":").pop() ?? position.coin;
	const quoteSymbol =
		marketInfo?.kind === "builderPerp"
			? (marketInfo.quoteToken?.displayName ?? DEFAULT_QUOTE_TOKEN)
			: DEFAULT_QUOTE_TOKEN;
	const liveReferencePx = liveAssetCtx?.ctx?.midPx ?? liveAssetCtx?.ctx?.markPx;
	const liveReferenceValue = toBig(liveReferencePx);
	const hasFreshMarketPrice = marketDataStatus === "active" && !isMarketDataStale && !!liveReferenceValue?.gt(0);

	function setSizingIntent(nextIntent: PositionMarketCloseSizingIntent) {
		if (!canEdit) return;
		resetError();
		actions.setSizingIntent(sessionId, nextIntent);
	}

	function handleOpenChange(open: boolean) {
		if (!open) actions.close(sessionId);
	}

	function handleSliderChange(value: number) {
		setSizingIntent(value >= 100 ? { kind: "max" } : { kind: "percent", value: String(value) });
	}

	function handleSubmit() {
		if (!canSubmit) return;
		return submit({ sessionId, dismissFutureConfirmation });
	}

	const progressLabel = getProgressLabel(phase);

	return (
		<AdaptiveModal
			open
			onOpenChange={handleOpenChange}
			presentation={isMobile ? "drawer" : "modal"}
			size="lg"
			dismissible={canDismiss}
			showClose={canDismiss}
			showHandle={isMobile && canDismiss}
			overlayClassName="backdrop-blur-[2px] duration-100"
			className="max-h-[calc(100dvh-1rem)] rounded-t-16 !shadow-none min-[1001px]:max-w-[32.5rem] min-[1001px]:rounded-16"
		>
			<ModalHeader divider={false} className="px-4 pt-5 pb-3 min-[1001px]:px-5">
				<ModalTitle className="text-lg">{t`Market Close`}</ModalTitle>
				<div className="flex min-w-0 flex-wrap items-center gap-1.5 pr-9 text-xs text-fg-muted">
					{positionDirectionLabel && (
						<span
							className={cn(
								"h-4 w-0.5 shrink-0 rounded-full",
								openingPosition.side === "sell" ? "bg-success" : "bg-error",
							)}
							aria-hidden="true"
						/>
					)}
					<span className="truncate font-medium text-fg">{displayName}</span>
					{positionDirectionLabel && (
						<>
							<span aria-hidden="true">·</span>
							<span>{positionDirectionLabel}</span>
						</>
					)}
					<span className="rounded-full border border-stroke-weak/60 bg-fill-weak px-2 py-0.5 text-3xs font-medium text-fg-muted">
						{t`Reduce Only`}
					</span>
				</div>
				<ModalDescription className="max-w-md leading-relaxed">
					{t`Choose how much of this position to close with a reduce-only market order.`}
				</ModalDescription>
			</ModalHeader>

			<ModalContent className="space-y-4 px-4 pt-1 pb-4 min-[1001px]:px-5">
				<section
					data-testid="position-market-close-sizing"
					aria-label={t`Size`}
					className="space-y-4 rounded-12 border border-stroke-weak/35 bg-fill-weak/40 p-4"
				>
					<NumberInput
						aria-label={t`Close size`}
						aria-describedby={visibleError ? errorId : undefined}
						aria-invalid={sizingIntent.kind === "size" && sizing.errors.length > 0}
						label={t`Size`}
						labelValue={`${t`Position`}: ${formatToken(sizing.maxSize, {
							decimals: position.szDecimals,
							symbol: sizeSymbol,
						})}`}
						value={sizeInput}
						onChange={(event) => setSizingIntent({ kind: "size", value: event.target.value })}
						maxAllowedDecimals={position.szDecimals}
						maxLabel={<span className="flex size-11 items-center justify-center">{t`Max`}</span>}
						onMaxClick={() => setSizingIntent({ kind: "max" })}
						disabled={!canEdit}
						inputSize="xl"
						mobileSafe
						className="bg-background pr-14 tabular-nums"
					/>

					<div className="space-y-3">
						<FieldLabel>{t`Close percentage`}</FieldLabel>
						<div className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-3">
							<div className="relative pb-5">
								<TradeSizeSlider
									value={sliderValue}
									onPercentChange={handleSliderChange}
									disabled={!canEdit}
									thumbSize="lg"
									thumbAlignment="edge"
									ariaLabel={t`Close percentage`}
									ariaDescribedBy={visibleError ? errorId : undefined}
									ariaInvalid={sizing.errors.length > 0}
									ariaValueText={t`${sliderValue}% selected; ${effectivePercent}% after size precision`}
								/>
								<div
									className="pointer-events-none absolute inset-x-3 top-[13px] z-20 flex justify-between"
									aria-hidden="true"
								>
									{SLIDER_MARKS.map((mark) => (
										<span
											key={mark}
											className={`size-1.5 rounded-full ${Math.abs(sliderValue - mark) < 0.05 ? "opacity-0" : "bg-fg-muted/70"}`}
										/>
									))}
								</div>
								<div
									className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between text-3xs tabular-nums text-fg-muted"
									aria-hidden="true"
								>
									{SLIDER_MARKS.map((mark) => (
										<span key={mark}>{mark}</span>
									))}
								</div>
							</div>

							<NumberInput
								aria-label={t`Close percentage`}
								aria-describedby={visibleError ? errorId : undefined}
								aria-invalid={sizingIntent.kind === "percent" && sizing.errors.length > 0}
								value={percentInput}
								onChange={(event) => setSizingIntent({ kind: "percent", value: event.target.value })}
								maxAllowedDecimals={1}
								suffix="%"
								disabled={!canEdit}
								inputSize="xl"
								mobileSafe
								className="w-full bg-background pr-7 text-right tabular-nums"
							/>
						</div>
					</div>
				</section>

				<section
					data-testid="position-market-close-summary"
					aria-label={t`Execution`}
					className="overflow-hidden rounded-12 border border-stroke-weak/35 bg-fill-weak/40"
				>
					<div className="grid grid-cols-2 divide-x divide-stroke-weak/60 bg-background/40">
						<div className="min-w-0 p-3.5">
							<FieldLabel>{t({ message: "Close", context: "Position market close summary" })}</FieldLabel>
							<span className="mt-2 block truncate text-base font-semibold text-fg tabular-nums">
								{formatToken(sizing.normalizedSize, { decimals: position.szDecimals, symbol: sizeSymbol })}
							</span>
							<span className="mt-1.5 inline-flex rounded-full bg-brand-soft px-2 py-0.5 text-3xs font-medium text-brand tabular-nums">
								{effectivePercent}%
							</span>
						</div>
						<div className="min-w-0 p-3.5">
							<FieldLabel>{t`Remaining`}</FieldLabel>
							<span className="mt-2 block truncate text-base font-semibold text-fg tabular-nums">
								{formatToken(sizing.remainingSize, { decimals: position.szDecimals, symbol: sizeSymbol })}
							</span>
						</div>
					</div>
					<InfoRowGroup className="border-t border-stroke-weak/60 divide-stroke-weak/60 tracking-normal">
						<InfoRow
							className="px-3.5 py-2.5"
							label={t`Market`}
							value={
								hasFreshMarketPrice
									? `${displayName} · ${formatPrice(liveReferencePx, {
											szDecimals: position.szDecimals,
											style: "decimal",
										})} ${quoteSymbol}`
									: `${displayName} · ${t`Unavailable`}`
							}
							valueClassName="max-w-[72%] truncate font-medium"
						/>
						<InfoRow
							className="px-3.5 py-2.5"
							label={t`Max Slippage`}
							value={`${formatNumber(slippagePercent, { decimals: 2 })}%`}
							valueClassName="font-medium"
						/>
					</InfoRowGroup>
				</section>

				{!isMobile && (
					<Checkbox
						size="md"
						checked={confirmationPreferenceAlreadyDismissed || dismissFutureConfirmation}
						onCheckedChange={setDismissFutureConfirmation}
						disabled={confirmationPreferenceAlreadyDismissed || !canEdit}
						className={cn(
							"w-full rounded-8 border border-stroke-weak/35 bg-fill-weak/30 px-3 py-3 transition-colors hover:bg-fill-hover",
							confirmationPreferenceAlreadyDismissed && canEdit && "opacity-100",
						)}
						label={t`Don't show this confirmation again`}
						description={t`Future Market clicks will immediately close the full position for this account and network.`}
					/>
				)}

				{phase === "reconciling" && (
					<output
						id={errorId}
						aria-live="polite"
						className="flex items-start gap-2 rounded-8 border border-stroke-warning-strong/20 bg-warning-soft p-2.5 text-xs text-warning"
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
							"flex items-start gap-2 rounded-8 border p-2.5 text-xs",
							userPositions.isLoading
								? "border-stroke-weak/35 bg-fill-weak/40 text-fg-muted"
								: "border-stroke-error-strong/20 bg-error-soft text-error",
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

			<ModalFooter className="sticky bottom-0 z-10 border-t border-stroke-weak/60 bg-modal/95 px-4 py-4 backdrop-blur-sm min-[1001px]:px-5">
				<TradingActionButton
					onClick={handleSubmit}
					requireReadyConfirmation
					disabled={!canSubmit}
					intent="error"
					size="lg"
					containerClassName="w-full items-stretch"
					className="min-h-12 w-full"
				>
					{progressLabel ? (
						<>
							<SpinnerGapIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
							{progressLabel}
						</>
					) : (
						t`Market Close`
					)}
				</TradingActionButton>
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

function getProgressLabel(phase: "idle" | "validating" | "submitting" | "reconciling"): string | null {
	if (phase === "validating") return t`Validating...`;
	if (phase === "submitting") return t`Submitting...`;
	if (phase === "reconciling") return t`Confirming...`;
	return null;
}

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
}: PositionStatusInput): string | null {
	if (isLoading) return t`Loading the latest position...`;
	if (hasError) return t`Live position data is unavailable. Wait for the account connection to recover.`;
	if (isStale) return t`Live position data is stale. Wait for the account connection to recover.`;
	if (!hasValidLivePosition) return t`This position is no longer open.`;
	if (!liveDirectionMatches) return t`This position changed sides. Close and reopen this dialog before submitting.`;
	return null;
}
