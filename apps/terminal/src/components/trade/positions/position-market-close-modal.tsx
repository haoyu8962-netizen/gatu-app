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
import { InfoRow } from "@/components/ui/info-row";
import { NumberInput } from "@/components/ui/number-input";
import {
	formatPositionMarketClosePercent,
	resolvePositionMarketClosePercent,
	resolvePositionMarketCloseSize,
} from "@/domain/trade/position-market-close";
import { usePositionMarketCloseSubmit } from "@/hooks/trade/use-position-market-close-submit";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { formatToken } from "@/lib/format";
import { useMarketsInfo, useUserPositions } from "@/lib/hyperliquid";
import { toBig } from "@/lib/trade/numbers";
import { readPositionMarketCloseConfirmationPreference } from "@/lib/trade/position-market-close-confirmation-preference";
import { getPositionMarketCloseErrorMessage } from "@/lib/trade/position-market-close-errors";
import {
	type PositionMarketCloseSizingIntent,
	usePositionMarketCloseActions,
	usePositionMarketCloseSession,
} from "@/stores/use-global-modal-store";
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
	const sizeSymbol = marketInfo?.shortName ?? position.coin.split(":").pop() ?? position.coin;

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
			showHandle={false}
			overlayClassName="backdrop-blur-[2px] duration-100"
			className="max-h-[calc(100dvh-1rem)] rounded-t-16 border-0 !shadow-none min-[1001px]:max-w-[32.5rem] min-[1001px]:rounded-16"
		>
			<ModalHeader
				divider={false}
				className="px-4 pt-5 pb-3 text-left min-[1001px]:items-center min-[1001px]:px-6 min-[1001px]:pt-6 min-[1001px]:text-center"
			>
				<ModalTitle className="text-lg">{t`Market Close`}</ModalTitle>
				<ModalDescription className="max-w-md pr-9 leading-relaxed min-[1001px]:pr-0">
					{t`Choose how much of this position to close with a reduce-only market order.`}
				</ModalDescription>
			</ModalHeader>

			<ModalContent className="space-y-4 px-4 pt-1 pb-2 min-[1001px]:px-6">
				<section
					data-testid="position-market-close-summary"
					aria-label={t`Execution`}
					className="space-y-1 px-0.5 text-xs"
				>
					<InfoRow
						className="p-0"
						label={t`Size`}
						value={formatToken(sizing.normalizedSize, { decimals: position.szDecimals, symbol: sizeSymbol })}
						valueClassName="font-medium text-error"
					/>
					<InfoRow className="p-0" label={t`Price`} value={t`Market`} valueClassName="font-medium" />
				</section>

				<section data-testid="position-market-close-sizing" aria-label={t`Size`} className="space-y-3">
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
						inputSize="lg"
						mobileSafe
						className="h-11 pr-14 tabular-nums"
					/>

					<div className="grid grid-cols-[minmax(0,1fr)_4.75rem] items-center gap-3">
						<div className="relative">
							<TradeSizeSlider
								value={sliderValue}
								onPercentChange={handleSliderChange}
								disabled={!canEdit}
								thumbSize="md"
								thumbAlignment="edge"
								ariaLabel={t`Close percentage`}
								ariaDescribedBy={visibleError ? errorId : undefined}
								ariaInvalid={sizing.errors.length > 0}
								ariaValueText={t`${sliderValue}% selected; ${effectivePercent}% after size precision`}
							/>
							<div
								className="pointer-events-none absolute inset-x-2 top-[7px] z-20 flex justify-between"
								aria-hidden="true"
							>
								{SLIDER_MARKS.map((mark) => (
									<span
										key={mark}
										className={`size-1.5 rounded-full ${Math.abs(sliderValue - mark) < 0.05 ? "opacity-0" : "bg-fg-muted/70"}`}
									/>
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
							inputSize="lg"
							mobileSafe
							className="h-11 w-full pr-7 text-right tabular-nums"
						/>
					</div>
				</section>

				{!isMobile && (
					<Checkbox
						size="md"
						checked={confirmationPreferenceAlreadyDismissed || dismissFutureConfirmation}
						onCheckedChange={setDismissFutureConfirmation}
						disabled={confirmationPreferenceAlreadyDismissed || !canEdit}
						className={cn("w-fit py-1", confirmationPreferenceAlreadyDismissed && canEdit && "opacity-100")}
						label={t`Don't show this confirmation again`}
					/>
				)}

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

			<ModalFooter className="px-4 pt-2 pb-4 min-[1001px]:px-6 min-[1001px]:pb-5">
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
