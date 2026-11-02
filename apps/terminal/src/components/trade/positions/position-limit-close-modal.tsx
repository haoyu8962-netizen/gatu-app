import { useLingui } from "@lingui/react/macro";
import { SpinnerGapIcon, WarningIcon } from "@phosphor-icons/react";
import { ModalDescription, ModalTitle } from "@sairn/ui";
import { useRef, useState } from "react";
import { PriceInput } from "@/components/ui/price-input";
import { isLiveMarkPriceReady } from "@/domain/trade/market-price";
import { formatPriceForInput, formatPriceForOrder } from "@/domain/trade/orders";
import { estimatePositionLimitClosePnl } from "@/domain/trade/position-limit-close";
import {
	type PositionCloseSizingIntent,
	resolvePositionMarketClosePercent,
	resolvePositionMarketCloseSize,
} from "@/domain/trade/position-market-close";
import { useHip3DisclaimerRequirement } from "@/hooks/trade/use-hip3-disclaimer";
import { useHip3DisclaimerPresentation } from "@/hooks/trade/use-hip3-disclaimer-presentation";
import {
	type PositionLimitCloseTarget,
	usePositionLimitCloseSubmit,
} from "@/hooks/trade/use-position-limit-close-submit";
import { useLingeringValue } from "@/hooks/use-lingering-value";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { szDecimalsToPriceDecimals, useNumberFormat } from "@/lib/format";
import { useHyperliquid, useMarketsInfo, useUserPositions } from "@/lib/hyperliquid";
import { toBig } from "@/lib/trade/numbers";
import { createPositionCloseSizingViewModel } from "@/lib/trade/position-close-sizing-presentation";
import { getPositionMarketCloseErrorMessage } from "@/lib/trade/position-market-close-errors";
import { getValueColorClass } from "@/lib/ui/value-color";
import type { PositionLimitCloseSession } from "@/stores/use-position-dialog-store";
import { Hip3DeployerDisclaimer } from "../components/hip3-deployer-disclaimer";
import { TradingActionButton } from "../components/trading-action-button";
import { PositionCloseDialogContent } from "./position-close-dialog-content";
import { PositionCloseDialogFooter } from "./position-close-dialog-footer";
import { PositionCloseDialogHeader } from "./position-close-dialog-header";
import { PositionCloseDialogShell } from "./position-close-dialog-shell";
import { PositionCloseSizingControls } from "./position-close-sizing-controls";
import { PositionCloseSummary, type PositionCloseSummaryItem } from "./position-close-summary";
import type { LimitClosePositionData } from "./position-dialog-types";

interface Props {
	session: PositionLimitCloseSession | null;
	onSessionEnd: (sessionId: string) => void;
}

const DIALOG_EXIT_MS = 250;

export function PositionLimitCloseModal({ session, onSessionEnd }: Props) {
	const displayedSession = useLingeringValue(session, DIALOG_EXIT_MS);
	if (!displayedSession) return null;
	return (
		<PositionLimitCloseModalSession
			key={displayedSession.sessionId}
			position={displayedSession.position}
			open={session?.sessionId === displayedSession.sessionId}
			onOpenChange={(open) => {
				if (!open) onSessionEnd(displayedSession.sessionId);
			}}
		/>
	);
}

function PositionLimitCloseModalSession({ position, open, onOpenChange }: BodyProps) {
	const { clientKey, env } = useHyperliquid();
	const openingTarget = useRef<PositionLimitCloseTarget>({
		owner: clientKey === "disconnected" ? clientKey : clientKey.toLowerCase(),
		env,
		coin: position.coin,
		dex: position.dex,
		assetId: position.assetId,
		szDecimals: position.szDecimals,
		signedPositionSize: position.signedPositionSize,
		marginMode: position.marginMode,
	}).current;
	const hip3Requirement = useHip3DisclaimerRequirement(position.coin);
	const hip3Disclaimer = useHip3DisclaimerPresentation(hip3Requirement, "cancel", DIALOG_EXIT_MS);

	if (hip3Disclaimer) {
		return (
			<Hip3DeployerDisclaimer
				key={hip3Disclaimer.dex}
				open={open && hip3Disclaimer.open}
				documentationUrl={hip3Disclaimer.documentationUrl}
				exit={hip3Disclaimer.exit}
				onExit={() => onOpenChange(false)}
			/>
		);
	}

	return (
		<PositionLimitCloseModalBody
			position={position}
			openingTarget={openingTarget}
			open={open}
			onOpenChange={onOpenChange}
		/>
	);
}

interface BodyProps {
	position: LimitClosePositionData;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

interface ModalBodyProps extends BodyProps {
	openingTarget: PositionLimitCloseTarget;
}

function PositionLimitCloseModalBody({ position, openingTarget, open, onOpenChange }: ModalBodyProps) {
	const { clientKey, env } = useHyperliquid();
	const { formatPrice, formatToken, formatUSD } = useNumberFormat();
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const userPositions = useUserPositions();
	const { getMarketInfo } = useMarketsInfo();
	const marketInfo = getMarketInfo(position.coin);
	const displayMarkPx = marketInfo?.markPx ?? position.markPx;
	const liveMidPx = isLiveMarkPriceReady(
		marketInfo?.markPriceStatus ?? "loading",
		marketInfo?.midPx ?? undefined,
		marketInfo?.midPriceReceivedAt,
	)
		? (marketInfo?.midPx ?? undefined)
		: undefined;
	const livePosition = userPositions.getPosition(position.coin, position.dex);
	const { submit } = usePositionLimitCloseSubmit(openingTarget);
	const [sizingIntent, setSizingIntentState] = useState<PositionCloseSizingIntent>({ kind: "max" });
	const sizingInteractionActiveRef = useRef(false);
	const submittedRef = useRef(false);
	const [isSubmitted, setIsSubmitted] = useState(false);
	const [priceInput, setPriceInput] = useState("");
	const [showPriceError, setShowPriceError] = useState(false);

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
		openingTarget.owner,
		openingTarget.env,
		openingTarget.coin,
		openingTarget.dex,
		openingTarget.assetId,
		openingTarget.szDecimals,
		openingTarget.marginMode,
		openingTarget.signedPositionSize,
		clientKey.toLowerCase(),
		env,
	]);
	const priceValue = toBig(priceInput);
	const normalizedPrice = formatPriceForOrder(priceInput, {
		assetId: position.assetId,
		szDecimals: position.szDecimals,
	});
	const priceValid = (priceValue?.gt(0) ?? false) && normalizedPrice !== "0";
	const priceError = showPriceError && !priceValid ? t`Enter limit price` : null;
	const sizingError = sizing.errors[0]
		? getPositionMarketCloseErrorMessage(sizing.errors[0], (descriptor) => t(descriptor))
		: null;
	const visibleSizingError = isEmptyOrZeroSizingIntent(sizingIntent) ? null : sizingError;
	const canEdit = !isSubmitted && positionStatus === null;
	const isSizingPaused = !isSubmitted && isPositionDataPending(positionStatus);
	const visibleError = positionStatusMessage ?? (positionStatus === null ? (priceError ?? visibleSizingError) : null);
	const canSubmit = canEdit && priceValid && sizing.errors.length === 0;
	const errorId = `position-limit-close-error-${position.assetId}`;
	const helperId = `position-limit-close-helper-${position.assetId}`;
	const priceInputId = `position-limit-close-price-${position.assetId}`;
	const sizeSymbol = marketInfo?.shortName ?? position.coin.split(":").pop() ?? position.coin;
	const entryPx = livePosition?.entryPx ?? position.entryPx;
	const estimatedPnl = estimatePositionLimitClosePnl({
		signedPositionSize,
		normalizedCloseSize: sizing.normalizedSize,
		entryPx,
		limitPx: priceInput,
	});
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
			value: formatPrice(entryPx, { szDecimals: position.szDecimals }),
			valueClassName: "font-semibold text-market-close-fg min-[1001px]:font-normal",
		},
		{
			key: "mark",
			label: t`Mark price`,
			value: formatPrice(displayMarkPx, { szDecimals: position.szDecimals }),
			valueClassName: "font-semibold text-market-close-fg min-[1001px]:font-normal",
		},
		{
			key: "pnl",
			label: t`Estimated PnL`,
			value: formatUSD(estimatedPnl, { compact: false, signDisplay: "exceptZero" }),
			valueClassName: cn("font-semibold", pnlColorClass),
			emphasized: true,
		},
	];

	function setSizingIntent(nextIntent: PositionCloseSizingIntent) {
		if (!canEdit) return;
		setSizingIntentState(nextIntent);
	}

	function setPrice(nextPrice: string) {
		if (!canEdit) return;
		setShowPriceError(false);
		setPriceInput(nextPrice);
	}

	function setMidPrice(nextPrice: string) {
		setPrice(
			formatPriceForInput(nextPrice, {
				assetId: position.assetId,
				szDecimals: position.szDecimals,
			}),
		);
	}

	function handlePriceBlur() {
		setShowPriceError(true);
		if (priceValid && !priceValue?.eq(normalizedPrice)) {
			setPriceInput(formatPriceForInput(priceInput, { assetId: position.assetId, szDecimals: position.szDecimals }));
		}
	}

	function handleOpenChange(nextOpen: boolean) {
		if (!nextOpen && !submittedRef.current) onOpenChange(false);
	}

	function handleSizingInteractionChange(interacting: boolean) {
		sizingInteractionActiveRef.current = interacting;
	}

	function isSizingGestureActive() {
		return sizingInteractionActiveRef.current;
	}

	async function handleSubmit() {
		if (!open || !canSubmit || sizingInteractionActiveRef.current || submittedRef.current) return;
		submittedRef.current = true;
		setIsSubmitted(true);
		const submittedSize = sizing.normalizedSize;
		try {
			await submit({ price: priceInput, size: submittedSize });
		} catch {
			return;
		} finally {
			onOpenChange(false);
		}
	}

	return (
		<PositionCloseDialogShell
			open={open && !isSubmitted}
			onOpenChange={handleOpenChange}
			isMobile={isMobile}
			dismissible
			closeLabel={t`Close`}
		>
			<PositionCloseDialogHeader>
				<div className="flex min-w-0 items-center max-[1000px]:pe-10">
					<ModalTitle className="flex h-6 min-w-0 items-baseline gap-1.5 text-[17px] leading-6 font-bold text-market-close-fg min-[1001px]:h-auto min-[1001px]:text-[18px] min-[1001px]:leading-[25px]">
						<span>{t`Limit Close`}</span>
						<span className="truncate text-[13px] font-medium text-market-close-muted min-[1001px]:hidden">
							{sizeSymbol}
						</span>
					</ModalTitle>
				</div>
				<ModalDescription className="sr-only max-w-sm text-2sm leading-[18px] text-market-close-muted min-[1001px]:not-sr-only">
					{t`Order will rest until filled or canceled.`}
				</ModalDescription>
			</PositionCloseDialogHeader>

			<PositionCloseDialogContent>
				<PositionCloseSummary
					testId="position-limit-close-summary"
					ariaLabel={t`Position summary`}
					items={summaryItems}
				/>

				<section
					data-testid="position-limit-close-price"
					aria-labelledby={`${priceInputId}-label`}
					className="flex flex-col gap-2.5"
				>
					<label
						id={`${priceInputId}-label`}
						htmlFor={priceInputId}
						className="text-2sm leading-[18px] font-semibold text-market-close-fg"
					>
						{t`Limit Price`}
					</label>
					<PriceInput
						id={priceInputId}
						aria-describedby={visibleError ? errorId : undefined}
						aria-invalid={priceError !== null}
						value={priceInput}
						onChange={(event) => setPrice(event.target.value)}
						onBlur={handlePriceBlur}
						onMidClick={liveMidPx ? setMidPrice : undefined}
						placeholder="0.00"
						maxAllowedDecimals={szDecimalsToPriceDecimals(position.szDecimals)}
						midPrice={liveMidPx}
						szDecimals={position.szDecimals}
						assetId={position.assetId}
						disabled={!canEdit}
						inputSize="xl"
						mobileSafe
						dir="ltr"
						className="h-[46px] !rounded-[10px] border-market-close-stroke-input bg-modal px-3 text-base leading-5 font-semibold text-market-close-fg tabular-nums transition-[border-color] duration-[120ms] focus-visible:border-market-close-focus focus-visible:ring-0 min-[1001px]:h-11"
					/>
				</section>

				<PositionCloseSizingControls
					testId="position-limit-close-sizing"
					sliderTestId="position-limit-close-slider"
					interactionIdentity={sizingInteractionIdentity}
					intent={sizingIntent}
					resolution={sizing}
					viewModel={sizingViewModel}
					szDecimals={position.szDecimals}
					symbol={sizeSymbol}
					disabled={!canEdit}
					paused={isSizingPaused}
					errorId={errorId}
					hasDescribedError={visibleError !== null}
					visibleSizingError={visibleSizingError}
					priceLabel={t`Limit Price`}
					onIntentChange={setSizingIntent}
					onInteractionChange={handleSizingInteractionChange}
				/>

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
					isActivationLocked={isSizingGestureActive}
					requireReadyConfirmation
					disabled={!open || !canSubmit}
					intent="error"
					size="lg"
					aria-describedby={helperId}
					containerClassName="w-full items-stretch"
					className="relative min-h-0 w-full overflow-hidden !rounded-[12px] !bg-market-close-danger py-[15px] text-[15px] leading-[21px] font-bold !text-market-close-danger-text tabular-nums !shadow-none !transition-none hover:!bg-market-close-danger hover:!opacity-100 active:!bg-market-close-danger active:!opacity-100 active:not-data-disabled:!scale-100 data-disabled:!cursor-not-allowed data-disabled:!bg-market-close-danger-disabled data-disabled:!text-market-close-muted min-[1001px]:py-[14px]"
				>
					{t`Place Limit Close`}
				</TradingActionButton>
				<p id={helperId} className="text-center text-xs leading-[17px] text-market-close-subtle">
					{t`Order will rest until filled or canceled.`}
				</p>
			</PositionCloseDialogFooter>
		</PositionCloseDialogShell>
	);
}

function isEmptyOrZeroSizingIntent(intent: PositionCloseSizingIntent): boolean {
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

function isPositionDataPending(status: PositionStatus): boolean {
	return status === "loading" || status === "unavailable" || status === "stale";
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
