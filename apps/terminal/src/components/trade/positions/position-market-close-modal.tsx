import { Checkbox, ModalDescription, ModalTitle } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { SpinnerGapIcon, WarningIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import {
	estimatePositionMarketClosePnl,
	resolvePositionMarketClosePercent,
	resolvePositionMarketCloseSize,
} from "@/domain/trade/position-market-close";
import { usePositionMarketCloseSubmit } from "@/hooks/trade/use-position-market-close-submit";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { formatPrice, formatToken, formatUSD } from "@/lib/format";
import { useHyperliquid, useMarketsInfo, useUserPositions } from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { toBig } from "@/lib/trade/numbers";
import { readPositionMarketCloseConfirmationPreference } from "@/lib/trade/position-market-close-confirmation-preference";
import { getPositionMarketCloseErrorMessage } from "@/lib/trade/position-market-close-errors";
import { getValueColorClass } from "@/lib/ui/value-color";
import {
	type PositionMarketCloseSizingIntent,
	usePositionMarketCloseActions,
	usePositionMarketCloseSession,
} from "@/stores/use-global-modal-store";
import { TradingActionButton } from "../components/trading-action-button";
import {
	createPositionCloseSizingViewModel,
	PositionCloseDialogContent,
	PositionCloseDialogFooter,
	PositionCloseDialogHeader,
	PositionCloseDialogShell,
	PositionCloseSizingControls,
	PositionCloseSummary,
	type PositionCloseSummaryItem,
} from "./position-close-dialog-ui";

interface Props {
	showPnl?: boolean;
}

export function PositionMarketCloseModal({ showPnl = true }: Props) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const [dismissFutureConfirmation, setDismissFutureConfirmation] = useState(false);
	const [isClosing, setIsClosing] = useState(false);
	const [isSizingInteractionActive, setIsSizingInteractionActive] = useState(false);
	const sizingInteractionActiveRef = useRef(false);
	const session = usePositionMarketCloseSession();
	const actions = usePositionMarketCloseActions();
	const { submit } = usePositionMarketCloseSubmit();
	const userPositions = useUserPositions();
	const { clientKey, env } = useHyperliquid();
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
		positionStatus === "closed"
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
	const sizingViewModel = createPositionCloseSizingViewModel(sizingIntent, sizing, position.szDecimals);
	const sizingInteractionIdentity = JSON.stringify([
		sessionId,
		session.owner.toLowerCase(),
		session.env,
		position.coin,
		position.dex,
		position.assetId,
		position.szDecimals,
		position.marginMode,
		openingPosition.side,
		clientKey.toLowerCase(),
		env,
	]);
	const canEdit = phase === "idle" && positionStatus === null;
	const sizingError = sizing.errors[0] ? getPositionMarketCloseErrorMessage(sizing.errors[0]) : null;
	const visibleSizingError = isEmptyOrZeroSizingIntent(sizingIntent) ? null : sizingError;
	const visibleError = positionStatusMessage ?? (positionStatus === null ? visibleSizingError : null);
	const canSubmit = canEdit && !isSizingInteractionActive && sizing.errors.length === 0;
	const confirmationPreferenceAlreadyDismissed =
		readPositionMarketCloseConfirmationPreference({ owner: session.owner, env: session.env }) === "dismissed";
	const errorId = `position-market-close-error-${sessionId}`;
	const helperId = `position-market-close-helper-${sessionId}`;
	const marketInfo = getMarketInfo(position.coin);
	const sizeSymbol = marketInfo?.shortName ?? position.coin.split(":").pop() ?? position.coin;
	const displayMarkPx = marketInfo?.markPx ?? position.markPx;
	const estimatedPnl = estimatePositionMarketClosePnl({
		signedPositionSize,
		normalizedCloseSize: sizing.normalizedSize,
		unrealizedPnl: livePosition?.unrealizedPnl,
		entryPx: livePosition?.entryPx,
		markPx: displayMarkPx,
	});
	const formattedCloseSize = formatToken(sizing.normalizedSize, { decimals: position.szDecimals });
	const pnlColorClass = estimatedPnl
		? getValueColorClass(estimatedPnl) === "text-success"
			? "text-market-close-success"
			: "text-market-close-danger"
		: undefined;
	const summaryItems: PositionCloseSummaryItem[] = [
		{
			key: "available",
			label: t`Available to close`,
			value: formatToken(positionStatus === null ? sizing.maxSize : null, {
				decimals: position.szDecimals,
				symbol: isMobile ? undefined : sizeSymbol,
			}),
			valueClassName: "font-semibold text-market-close-fg",
		},
		{
			key: "entry",
			label: t`Entry price`,
			value: formatPrice(livePosition?.entryPx, { szDecimals: position.szDecimals }),
			valueClassName: "font-semibold text-market-close-fg min-[1001px]:font-normal",
		},
		{
			key: "mark",
			label: t`Mark price`,
			value: formatPrice(displayMarkPx, { szDecimals: position.szDecimals }),
			valueClassName: "font-semibold text-market-close-fg min-[1001px]:font-normal",
		},
		...(showPnl
			? [
					{
						key: "pnl",
						label: t`Estimated PnL`,
						value: formatUSD(estimatedPnl, { compact: false, signDisplay: "exceptZero" }),
						valueClassName: cn("font-semibold", pnlColorClass),
						emphasized: true,
					},
				]
			: []),
	];

	function setSizingIntent(nextIntent: PositionMarketCloseSizingIntent) {
		if (!canEdit) return;
		actions.setSizingIntent(sessionId, nextIntent);
	}

	function handleOpenChange(open: boolean) {
		if (!open) setIsClosing(true);
	}

	function handleOpenChangeComplete(open: boolean) {
		if (!open && isClosing) actions.close(sessionId);
	}

	function handleSizingInteractionChange(interacting: boolean) {
		sizingInteractionActiveRef.current = interacting;
		setIsSizingInteractionActive(interacting);
	}

	function handleSubmit() {
		if (!canSubmit || sizingInteractionActiveRef.current) return;
		return submit({ sessionId, dismissFutureConfirmation });
	}

	return (
		<PositionCloseDialogShell
			open={session.presentation === "confirmation" && !isClosing}
			onOpenChange={handleOpenChange}
			onOpenChangeComplete={handleOpenChangeComplete}
			isMobile={isMobile}
			dismissible
			closeLabel={t`Close`}
		>
			<PositionCloseDialogHeader>
				<div className="flex min-w-0 items-center justify-between gap-3">
					<ModalTitle className="flex h-6 min-w-0 items-baseline gap-1.5 text-[17px] leading-6 font-bold text-market-close-fg min-[1001px]:h-auto min-[1001px]:text-[18px] min-[1001px]:leading-[25px]">
						<span>{t`Market Close`}</span>
						<span className="truncate text-[13px] font-medium text-market-close-muted min-[1001px]:hidden">
							{sizeSymbol}
						</span>
					</ModalTitle>
					<span className="shrink-0 text-[13px] leading-[18px] text-market-close-muted tabular-nums min-[1001px]:hidden">
						{t`Price: Market`}
					</span>
				</div>
				<ModalDescription className="sr-only max-w-sm text-[13px] leading-[18px] text-market-close-muted min-[1001px]:not-sr-only">
					{t`Reduce this position at the current market price. Filled trades cannot be reversed.`}
				</ModalDescription>
			</PositionCloseDialogHeader>

			<PositionCloseDialogContent>
				<PositionCloseSummary
					testId="position-market-close-summary"
					ariaLabel={t`Position summary`}
					items={summaryItems}
				/>

				<PositionCloseSizingControls
					testId="position-market-close-sizing"
					sliderTestId="position-market-close-slider"
					interactionIdentity={sizingInteractionIdentity}
					intent={sizingIntent}
					resolution={sizing}
					viewModel={sizingViewModel}
					szDecimals={position.szDecimals}
					symbol={sizeSymbol}
					disabled={!canEdit}
					errorId={errorId}
					hasDescribedError={visibleError !== null}
					visibleSizingError={visibleSizingError}
					priceLabel={t`Price: Market`}
					onIntentChange={setSizingIntent}
					onInteractionChange={handleSizingInteractionChange}
				>
					<Checkbox
						data-testid="position-market-close-confirmation-preference"
						size="md"
						checked={confirmationPreferenceAlreadyDismissed || dismissFutureConfirmation}
						onCheckedChange={setDismissFutureConfirmation}
						disabled={confirmationPreferenceAlreadyDismissed || !canEdit}
						className={cn(
							"w-fit shrink-0 items-center gap-2 min-[1001px]:mt-0.5",
							confirmationPreferenceAlreadyDismissed && canEdit && "opacity-100",
						)}
						controlClassName="size-5 !rounded-[5px] border-market-close-stroke-control bg-modal transition-all duration-[120ms] focus-visible:border-market-close-focus focus-visible:outline-none data-checked:border-market-close-control data-checked:bg-market-close-control"
						indicatorClassName="text-market-close-on-control [&>svg]:size-3"
						labelClassName="whitespace-nowrap text-[13px] leading-[18px] font-normal text-market-close-muted"
						label={t`Don't show this confirmation again`}
					/>
				</PositionCloseSizingControls>

				{visibleError && (
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
			</PositionCloseDialogContent>

			<PositionCloseDialogFooter>
				<TradingActionButton
					onClick={handleSubmit}
					requireReadyConfirmation
					disabled={!canSubmit}
					intent="error"
					size="lg"
					aria-describedby={helperId}
					containerClassName="w-full items-stretch"
					className="relative min-h-0 w-full overflow-hidden !rounded-[12px] !bg-market-close-danger py-[15px] text-[15px] leading-[21px] font-bold !text-market-close-danger-text tabular-nums !shadow-none !transition-none hover:!bg-market-close-danger hover:!opacity-100 active:!bg-market-close-danger active:!opacity-100 active:not-data-disabled:!scale-100 data-disabled:!cursor-not-allowed data-disabled:!bg-market-close-danger-disabled data-disabled:!text-market-close-muted min-[1001px]:py-[14px]"
				>
					{t`Market Close ${formattedCloseSize} ${sizeSymbol}`}
				</TradingActionButton>
				<p id={helperId} className="text-center text-xs leading-[17px] text-market-close-subtle">
					{t`Click to submit · Filled trades cannot be reversed`}
				</p>
			</PositionCloseDialogFooter>
		</PositionCloseDialogShell>
	);
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
