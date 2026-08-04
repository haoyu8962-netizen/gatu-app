import { AdaptiveModal, Checkbox, ModalContent, ModalDescription, ModalHeader, ModalTitle } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { SpinnerGapIcon, WarningIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { InfoRow } from "@/components/ui/info-row";
import { NumberInput } from "@/components/ui/number-input";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import {
	formatPositionMarketClosePercent,
	resolvePositionMarketClosePercent,
	resolvePositionMarketCloseSize,
} from "@/domain/trade/position-market-close";
import { usePositionMarketCloseSubmit } from "@/hooks/trade/use-position-market-close-submit";
import { useIsMobile } from "@/hooks/use-mobile";
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
	const isFullClose = sizing.errors.length === 0 && toBig(sizing.remainingSize)?.eq(0) === true;
	const confirmationPreferenceAlreadyDismissed =
		readPositionMarketCloseConfirmationPreference({ owner: session.owner, env: session.env }) === "dismissed";
	const errorId = `position-market-close-error-${sessionId}`;
	const marketInfo = getMarketInfo(position.coin);
	const displayName = marketInfo?.pairName ?? position.coin;
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
		setDismissFutureConfirmation(false);
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
		return submit({ sessionId, dismissFutureConfirmation: dismissFutureConfirmation && isFullClose });
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
			className="max-[1000px]:max-h-[calc(100dvh-3rem)]"
		>
			<ModalHeader divider={false} className={isMobile ? "pt-6 pb-3 text-left" : "px-14 pt-6 pb-3 text-center"}>
				<ModalTitle>{t`Market Close`}</ModalTitle>
				<ModalDescription>{t`Choose how much of this position to close with a reduce-only market order.`}</ModalDescription>
			</ModalHeader>

			<ModalContent className="space-y-5 pt-2">
				<div className="rounded-8 border border-stroke-weak bg-surface p-3 text-xs">
					<InfoRow
						className="p-0 pb-2"
						label={t`Position`}
						value={formatToken(sizing.maxSize, { decimals: position.szDecimals, symbol: sizeSymbol })}
						valueClassName="font-medium"
					/>
					<InfoRow
						className="p-0 py-2 border-t border-stroke-weak"
						label={t({ message: "Close", context: "Position market close summary" })}
						value={`${formatToken(sizing.normalizedSize, { decimals: position.szDecimals, symbol: sizeSymbol })} (${effectivePercent}%)`}
						valueClassName="font-medium"
					/>
					<InfoRow
						className="p-0 py-2 border-t border-stroke-weak"
						label={t`Remaining`}
						value={formatToken(sizing.remainingSize, { decimals: position.szDecimals, symbol: sizeSymbol })}
						valueClassName="font-medium"
					/>
					<InfoRow
						className="p-0 py-2 border-t border-stroke-weak"
						label={t`Market`}
						value={
							hasFreshMarketPrice
								? `${displayName} · ${formatPrice(liveReferencePx, {
										szDecimals: position.szDecimals,
										style: "decimal",
									})} ${quoteSymbol}`
								: `${displayName} · ${t`Unavailable`}`
						}
						valueClassName="font-medium"
					/>
					<InfoRow
						className="p-0 pt-2 border-t border-stroke-weak"
						label={t`Max Slippage`}
						value={`${formatNumber(slippagePercent, { decimals: 2 })}%`}
						valueClassName="font-medium"
					/>
				</div>

				<NumberInput
					aria-label={t`Close size`}
					aria-describedby={visibleError ? errorId : undefined}
					aria-invalid={sizingIntent.kind === "size" && sizing.errors.length > 0}
					label={t`Size`}
					value={sizeInput}
					onChange={(event) => setSizingIntent({ kind: "size", value: event.target.value })}
					maxAllowedDecimals={position.szDecimals}
					maxLabel={<span className="flex size-11 items-center justify-center">{t`Max`}</span>}
					onMaxClick={() => setSizingIntent({ kind: "max" })}
					disabled={!canEdit}
					inputSize="xl"
					mobileSafe
					className="pr-14 tabular-nums"
				/>

				<div className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-4">
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
						className="w-full pr-7 text-right tabular-nums"
					/>
				</div>

				<Checkbox
					size="md"
					checked={confirmationPreferenceAlreadyDismissed || dismissFutureConfirmation}
					onCheckedChange={setDismissFutureConfirmation}
					disabled={confirmationPreferenceAlreadyDismissed || !canEdit || !isFullClose}
					label={t`Don't show this confirmation again`}
					description={
						confirmationPreferenceAlreadyDismissed || isFullClose
							? t`Future Market clicks will immediately close the full position for this account and network.`
							: t`This preference is available only when closing the full position.`
					}
				/>

				{phase === "reconciling" && (
					<output
						id={errorId}
						aria-live="polite"
						className="flex gap-2 rounded-8 border border-stroke-warning-weak bg-warning-soft p-3 text-xs text-warning"
					>
						<WarningIcon className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden="true" />
						<span className="flex flex-col gap-1">
							<span>{error ?? t`The order is still being confirmed.`}</span>
							<span>{t`Closing this dialog will not cancel it.`}</span>
						</span>
					</output>
				)}

				{visibleError && phase !== "reconciling" && (
					<div
						id={errorId}
						role="alert"
						aria-live="assertive"
						className="rounded-8 border border-stroke-error-weak bg-error-soft px-3 py-2 text-xs text-error"
					>
						{visibleError}
					</div>
				)}

				<p className="sr-only" aria-live="polite">
					{progressLabel}
				</p>

				<TradingActionButton
					onClick={handleSubmit}
					requireReadyConfirmation
					disabled={!canSubmit}
					intent="error"
					size="lg"
					containerClassName="w-full items-stretch"
					className="min-h-11 w-full"
				>
					{progressLabel ? (
						<>
							<SpinnerGapIcon className="size-4 animate-spin" aria-hidden="true" />
							{progressLabel}
						</>
					) : (
						t`Market Close`
					)}
				</TradingActionButton>
			</ModalContent>
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
