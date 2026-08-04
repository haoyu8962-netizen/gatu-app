import { ModalDescription, ModalTitle } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { SpinnerGapIcon, WarningIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { PriceInput } from "@/components/ui/price-input";
import { formatPriceForOrder } from "@/domain/trade/orders";
import { estimatePositionLimitClosePnl } from "@/domain/trade/position-limit-close";
import {
	type PositionCloseSizingIntent,
	resolvePositionMarketClosePercent,
	resolvePositionMarketCloseSize,
} from "@/domain/trade/position-market-close";
import { useHip3DisclaimerRequirement } from "@/hooks/trade/use-hip3-disclaimer";
import {
	type PositionLimitCloseTarget,
	usePositionLimitCloseSubmit,
} from "@/hooks/trade/use-position-limit-close-submit";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { formatPrice, formatToken, formatUSD, szDecimalsToPriceDecimals } from "@/lib/format";
import { useHyperliquid, useMarketsInfo, useUserPositions } from "@/lib/hyperliquid";
import { toBig } from "@/lib/trade/numbers";
import { getPositionMarketCloseErrorMessage } from "@/lib/trade/position-market-close-errors";
import { getValueColorClass } from "@/lib/ui/value-color";
import { Hip3DeployerDisclaimer } from "../components/hip3-deployer-disclaimer";
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
import type { LimitClosePositionData } from "./position-dialog-types";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	position: LimitClosePositionData | null;
}

export function PositionLimitCloseModal({ open, onOpenChange, position }: Props) {
	if (!open || !position) return null;
	return (
		<PositionLimitCloseModalSession
			key={`${position.dex}:${position.assetId}:open`}
			position={position}
			onOpenChange={onOpenChange}
		/>
	);
}

function PositionLimitCloseModalSession({ position, onOpenChange }: BodyProps) {
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
	const hip3Disclaimer = useHip3DisclaimerRequirement(position.coin);

	if (hip3Disclaimer.isRequired && hip3Disclaimer.dex) {
		return (
			<Hip3DeployerDisclaimer
				key={hip3Disclaimer.dex}
				documentationUrl={hip3Disclaimer.documentationUrl}
				onCancel={() => onOpenChange(false)}
			/>
		);
	}

	return <PositionLimitCloseModalBody position={position} openingTarget={openingTarget} onOpenChange={onOpenChange} />;
}

interface BodyProps {
	position: LimitClosePositionData;
	onOpenChange: (open: boolean) => void;
}

interface ModalBodyProps extends BodyProps {
	openingTarget: PositionLimitCloseTarget;
}

function PositionLimitCloseModalBody({ position, openingTarget, onOpenChange }: ModalBodyProps) {
	const { t } = useLingui();
	const isMobile = useIsMobile();
	const userPositions = useUserPositions();
	const { getMarketInfo } = useMarketsInfo();
	const marketInfo = getMarketInfo(position.coin);
	const livePosition = userPositions.getPosition(position.coin, position.dex);
	const { submit, phase, isPending, isReconciling, error, resetError } = usePositionLimitCloseSubmit(openingTarget);
	const [sizingIntent, setSizingIntentState] = useState<PositionCloseSizingIntent>({ kind: "max" });
	const [priceInput, setPriceInput] = useState(() =>
		formatPriceForOrder(position.markPx, { assetId: position.assetId, szDecimals: position.szDecimals }),
	);
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
	const sizingViewModel = createPositionCloseSizingViewModel(sizingIntent, sizing, position.szDecimals);
	const priceValue = toBig(priceInput);
	const normalizedPrice = formatPriceForOrder(priceInput, {
		assetId: position.assetId,
		szDecimals: position.szDecimals,
	});
	const priceValid = (priceValue?.gt(0) ?? false) && normalizedPrice !== "0";
	const priceError = showPriceError && !priceValid ? t`Enter limit price` : null;
	const sizingError = sizing.errors[0] ? getPositionMarketCloseErrorMessage(sizing.errors[0]) : null;
	const visibleSizingError = isEmptyOrZeroSizingIntent(sizingIntent) ? null : sizingError;
	const canDismiss = phase === "idle" || phase === "reconciling";
	const canEdit = phase === "idle" && !isPending && !isReconciling && positionStatusMessage === null;
	const visibleError = positionStatusMessage ?? error ?? priceError ?? visibleSizingError;
	const canSubmit = canEdit && priceValid && sizing.errors.length === 0;
	const errorId = `position-limit-close-error-${position.assetId}`;
	const helperId = `position-limit-close-helper-${position.assetId}`;
	const priceInputId = `position-limit-close-price-${position.assetId}`;
	const sizeSymbol = marketInfo?.shortName ?? position.coin.split(":").pop() ?? position.coin;
	const markPx = marketInfo?.markPx ?? position.markPx;
	const midPx = marketInfo?.midPx ?? markPx;
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
			value: formatToken(positionStatusMessage === null ? sizing.maxSize : null, {
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
			value: formatPrice(markPx, { szDecimals: position.szDecimals }),
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
		resetError();
		setSizingIntentState(nextIntent);
	}

	function setPrice(nextPrice: string) {
		if (!canEdit) return;
		resetError();
		setShowPriceError(false);
		setPriceInput(nextPrice);
	}

	function setMidPrice(nextPrice: string) {
		setPrice(
			formatPriceForOrder(nextPrice, {
				assetId: position.assetId,
				szDecimals: position.szDecimals,
			}),
		);
	}

	function handlePriceBlur() {
		setShowPriceError(true);
		if (priceValid) setPriceInput(normalizedPrice);
	}

	function handleOpenChange(nextOpen: boolean) {
		if (!nextOpen && canDismiss) onOpenChange(false);
	}

	async function handleSubmit() {
		if (!canSubmit) return;
		try {
			const outcome = await submit({ price: priceInput, size: sizing.normalizedSize });
			if (outcome.state === "reconciling") {
				toast.info(t`Order submitted. Confirming exchange status; do not retry.`);
				onOpenChange(false);
				return;
			}
			if (outcome.state !== "confirmed") return;
			toast.success(t`Limit close order placed`, {
				description: formatToken(sizing.normalizedSize, {
					decimals: position.szDecimals,
					symbol: sizeSymbol,
				}),
			});
			onOpenChange(false);
		} catch (cause) {
			toast.error(cause instanceof Error ? cause.message : t`Failed to place limit close order`);
		}
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
		<PositionCloseDialogShell
			open
			onOpenChange={handleOpenChange}
			isMobile={isMobile}
			dismissible={canDismiss}
			closeLabel={t`Close`}
		>
			<PositionCloseDialogHeader>
				<div className="flex min-w-0 items-center justify-between gap-3">
					<ModalTitle className="flex h-6 min-w-0 items-baseline gap-1.5 text-[17px] leading-6 font-bold text-market-close-fg min-[1001px]:h-auto min-[1001px]:text-[18px] min-[1001px]:leading-[25px]">
						<span>{t`Limit Close`}</span>
						<span className="truncate text-[13px] font-medium text-market-close-muted min-[1001px]:hidden">
							{sizeSymbol}
						</span>
					</ModalTitle>
					<span className="shrink-0 text-[13px] leading-[18px] text-market-close-muted min-[1001px]:hidden">
						{t({ message: "Limit", context: "Order type" })}
					</span>
				</div>
				<ModalDescription className="sr-only max-w-sm text-[13px] leading-[18px] text-market-close-muted min-[1001px]:not-sr-only">
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
						className="text-[13px] leading-[18px] font-semibold text-market-close-fg"
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
						onMidClick={setMidPrice}
						placeholder="0.00"
						maxAllowedDecimals={szDecimalsToPriceDecimals(position.szDecimals)}
						midPrice={midPx}
						szDecimals={position.szDecimals}
						disabled={!canEdit}
						inputSize="xl"
						mobileSafe
						dir="ltr"
						className="h-[46px] !rounded-[10px] border-market-close-stroke-input bg-modal px-3 text-base leading-5 font-semibold text-market-close-fg tabular-nums transition-[border-color] duration-[120ms] focus-visible:border-market-close-control focus-visible:ring-0 min-[1001px]:h-11"
					/>
				</section>

				<PositionCloseSizingControls
					testId="position-limit-close-sizing"
					sliderTestId="position-limit-close-slider"
					intent={sizingIntent}
					resolution={sizing}
					viewModel={sizingViewModel}
					szDecimals={position.szDecimals}
					symbol={sizeSymbol}
					disabled={!canEdit}
					errorId={errorId}
					hasDescribedError={visibleError !== null}
					visibleSizingError={visibleSizingError}
					priceLabel={t`Limit Price`}
					onIntentChange={setSizingIntent}
				/>

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
					className="relative min-h-0 w-full overflow-hidden !rounded-[12px] !bg-market-close-danger py-[15px] text-[15px] leading-[21px] font-bold !text-market-close-danger-text tabular-nums !shadow-none !transition-[background-color] duration-150 hover:!bg-market-close-danger hover:!opacity-100 active:!bg-market-close-danger active:!opacity-100 active:not-data-disabled:!scale-100 data-disabled:!cursor-not-allowed data-disabled:!bg-market-close-danger-disabled data-disabled:!text-white min-[1001px]:py-[14px]"
				>
					{progressLabel ? (
						<>
							<SpinnerGapIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
							{progressLabel}
						</>
					) : (
						t`Place Limit Close`
					)}
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
