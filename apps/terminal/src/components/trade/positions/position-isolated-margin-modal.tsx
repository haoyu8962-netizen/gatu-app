import {
	Button,
	ModalContent,
	ModalDescription,
	ModalFooter,
	ModalHeader,
	ModalTitle,
	SegmentedControlItem,
	SegmentedControls,
} from "@gatu/ui";
import { t } from "@lingui/core/macro";
import type {
	TopUpIsolatedOnlyMarginParameters,
	UpdateIsolatedMarginParameters,
} from "@nktkas/hyperliquid/api/exchange";
import { SpinnerGapIcon, WarningIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { InfoRow } from "@/components/ui/info-row";
import { NumberInput } from "@/components/ui/number-input";
import { getPositionDex } from "@/domain/market";
import {
	buildIsolatedMarginAmountParameters,
	buildIsolatedMarginTargetParameters,
	calculateEffectiveLeverage,
	canRemoveIsolatedMargin,
	getPerpMarginConstraint,
	type IsolatedMarginDirection,
	validateIsolatedMarginTarget,
} from "@/domain/trade/isolated-margin";
import { createClientOrderId, isAmbiguousExchangeRequestError } from "@/domain/trade/order-tracking";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { formatLiquidationPrice, formatNumber, formatUSD } from "@/lib/format";
import { useExchange, useHyperliquid, useMarkets, useUserPositions } from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { toBig } from "@/lib/trade/numbers";
import {
	getOrderAssetReservationState,
	reserveOrderAssets,
	runWithAvailableOrderAssetLocks,
} from "@/lib/trade/order-asset-lock";
import { TradingActionButton } from "../components/trading-action-button";
import type { IsolatedMarginPositionTarget } from "./position-dialog-types";
import { PositionRiskDialogShell } from "./position-risk-dialog-ui";

type AdjustmentMode = "amount" | "target";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	position: IsolatedMarginPositionTarget | null;
}

export function PositionIsolatedMarginModal({ open, onOpenChange, position }: Props) {
	const isMobile = useIsMobile();
	if (!position) return null;

	return (
		<PositionIsolatedMarginModalBody
			key={`${position.owner}:${position.env}:${position.dex}:${position.assetId}:${open ? "open" : "closed"}`}
			open={open}
			isMobile={isMobile}
			position={position}
			onOpenChange={onOpenChange}
		/>
	);
}

interface BodyProps {
	open: boolean;
	isMobile: boolean;
	position: IsolatedMarginPositionTarget;
	onOpenChange: (open: boolean) => void;
}

function isConfirmedDefaultExchangeResponse(response: unknown): boolean {
	if (typeof response !== "object" || response === null) return false;
	const result = response as { response?: unknown; status?: unknown };
	if (result.status !== "ok" || typeof result.response !== "object" || result.response === null) return false;
	return (result.response as { type?: unknown }).type === "default";
}

function PositionIsolatedMarginModalBody({ open, isMobile, position, onOpenChange }: BodyProps) {
	useNumberFormatRevision();
	const [mode, setMode] = useState<AdjustmentMode>("amount");
	const [direction, setDirection] = useState<IsolatedMarginDirection>("add");
	const [amountInput, setAmountInput] = useState("");
	const [targetLeverageInput, setTargetLeverageInput] = useState("");
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [requiresRefresh, setRequiresRefresh] = useState(false);
	const [isCoordinating, setIsCoordinating] = useState(false);
	const coordinatingRef = useRef(false);

	const { clientKey, env } = useHyperliquid();
	const { address } = useWalletSession();
	const sessionIdentity = useRef({
		owner: position.owner.toLowerCase(),
		env: position.env,
	}).current;
	const markets = useMarkets();
	const userPositions = useUserPositions();
	const { getPosition, isLoading: positionLoading, hasError: positionError, isStale: positionStale } = userPositions;
	const walletOwner = address?.toLowerCase() ?? null;
	const identityMatches =
		clientKey !== "disconnected" &&
		clientKey.toLowerCase() === sessionIdentity.owner &&
		walletOwner === sessionIdentity.owner &&
		env === sessionIdentity.env;
	const executionStateRef = useRef({ clientKey, env, markets, position, userPositions, walletOwner });
	executionStateRef.current = { clientKey, env, markets, position, userPositions, walletOwner };

	function assertExecutionContext(
		params: UpdateIsolatedMarginParameters | TopUpIsolatedOnlyMarginParameters,
		action: AdjustmentMode,
	) {
		const current = executionStateRef.current;
		if (
			current.clientKey === "disconnected" ||
			current.clientKey.toLowerCase() !== sessionIdentity.owner ||
			current.walletOwner !== sessionIdentity.owner ||
			current.env !== sessionIdentity.env
		) {
			throw new Error(t`Trading data changed while this dialog was open. Close and reopen it before submitting.`);
		}
		const currentMarket = current.markets.getMarket(current.position.coin);
		const currentMarketDex = currentMarket ? getPositionDex(currentMarket) : undefined;

		if (
			current.markets.isLoading ||
			current.markets.error ||
			!currentMarket ||
			currentMarket.kind === "spot" ||
			currentMarket.assetId !== current.position.assetId ||
			currentMarketDex !== current.position.dex ||
			params.asset !== current.position.assetId
		) {
			throw new Error(t`The selected market changed. Reopen the margin dialog before adjusting margin.`);
		}

		if (current.userPositions.isLoading || current.userPositions.hasError || current.userPositions.isStale) {
			throw new Error(
				t`Live position data is unavailable. Wait for the account connection to recover before adjusting margin.`,
			);
		}

		const currentPosition = current.userPositions.getPosition(current.position.coin, current.position.dex);
		const currentSize = toBig(currentPosition?.szi);
		if (!currentPosition || !currentSize || currentSize.eq(0)) {
			throw new Error(t`This isolated position is no longer open.`);
		}
		if (currentPosition.leverage.type !== "isolated") {
			throw new Error(t`This position is no longer using isolated margin.`);
		}

		const currentIsLong = currentSize.gt(0);
		if (currentIsLong !== current.position.isLong || ("isBuy" in params && params.isBuy !== currentIsLong)) {
			throw new Error(t`This position changed sides. Reopen the margin dialog before adjusting margin.`);
		}

		const marginConstraint = getPerpMarginConstraint(currentMarket);
		if (action === "target" && marginConstraint === undefined) {
			throw new Error(t`The selected market changed. Reopen the margin dialog before adjusting margin.`);
		}
		if (action === "target") {
			if (!("leverage" in params)) throw new Error(t`Enter a positive target leverage.`);

			const validation = validateIsolatedMarginTarget(
				params.leverage,
				currentPosition.positionValue,
				currentPosition.marginUsed,
			);
			if (validation === "invalid-target") throw new Error(t`Enter a positive target leverage.`);
			if (validation === "current-leverage-unavailable") {
				throw new Error(
					t`Live position data is unavailable. Wait for the account connection to recover before adjusting margin.`,
				);
			}
			if (validation === "not-below-current") {
				throw new Error(t`Target leverage must be below the current effective leverage to add margin.`);
			}
		}
		if ("ntli" in params) {
			const marginDelta = toBig(params.ntli);
			if (!marginDelta || marginDelta.eq(0)) {
				throw new Error(t`Failed to update isolated margin`);
			}
			if (
				marginDelta.lt(0) &&
				(!canRemoveIsolatedMargin(current.position.marginConstraint) || !canRemoveIsolatedMargin(marginConstraint))
			) {
				throw new Error(t`This strict isolated market does not allow margin to be removed from an open position.`);
			}
		}
	}
	const amountMutation = useExchange("updateIsolatedMargin", {
		executionGuard: (params) => assertExecutionContext(params, "amount"),
	});
	const targetMutation = useExchange("topUpIsolatedOnlyMargin", {
		executionGuard: (params) => assertExecutionContext(params, "target"),
	});
	const livePosition = getPosition(position.coin, position.dex);
	const liveMarket = markets.getMarket(position.coin);
	const liveMarketDex = liveMarket ? getPositionDex(liveMarket) : undefined;
	const hasLiveMarket =
		!markets.isLoading &&
		!markets.error &&
		liveMarket !== undefined &&
		liveMarket.kind !== "spot" &&
		liveMarket.assetId === position.assetId &&
		liveMarketDex === position.dex;
	const liveMarginConstraint = hasLiveMarket ? getPerpMarginConstraint(liveMarket) : undefined;

	const marginUsed = livePosition?.marginUsed ?? position.marginUsed;
	const positionValue = livePosition?.positionValue ?? position.positionValue;
	const liquidationPx = livePosition?.liquidationPx ?? position.liquidationPx;
	const currentEffectiveLeverage = calculateEffectiveLeverage(positionValue, marginUsed);
	const supportsTargetLeverage = hasLiveMarket && liveMarginConstraint !== undefined;
	const marketAllowsRemoval =
		hasLiveMarket &&
		canRemoveIsolatedMargin(position.marginConstraint) &&
		canRemoveIsolatedMargin(liveMarginConstraint);
	const allowsRemoval = marketAllowsRemoval;
	const livePositionSize = toBig(livePosition?.szi);
	const isLiveIsolated = livePosition?.leverage.type === "isolated";
	const liveIsLong = livePositionSize ? livePositionSize.gt(0) : position.isLong;
	const liveSideMatches = livePositionSize !== null && !livePositionSize.eq(0) && liveIsLong === position.isLong;
	const hasLivePosition =
		identityMatches &&
		hasLiveMarket &&
		livePosition !== null &&
		livePositionSize !== null &&
		!livePositionSize.eq(0) &&
		liveSideMatches &&
		isLiveIsolated &&
		!positionLoading &&
		!positionError &&
		!positionStale;

	const amountParams = buildIsolatedMarginAmountParameters({
		assetId: position.assetId,
		isLong: liveIsLong,
		direction,
		amount: amountInput,
	});
	const targetParams = buildIsolatedMarginTargetParameters(position.assetId, targetLeverageInput);
	const targetValidation =
		targetParams === null
			? "invalid-target"
			: !hasLivePosition
				? "current-leverage-unavailable"
				: validateIsolatedMarginTarget(targetParams.leverage, livePosition.positionValue, livePosition.marginUsed);
	const isSubmitting = isCoordinating || amountMutation.isPending || targetMutation.isPending;
	const inputValid = mode === "amount" ? amountParams !== null : targetValidation === "valid";
	const actionAllowed =
		(mode !== "target" || supportsTargetLeverage) && (mode !== "amount" || direction !== "remove" || allowsRemoval);
	const canSubmit = hasLivePosition && inputValid && actionAllowed && !requiresRefresh && !isSubmitting;

	function handleModeChange(value: string) {
		setMode(value as AdjustmentMode);
		setSubmitError(null);
	}

	function handleDirectionChange(value: string) {
		const nextDirection = value as IsolatedMarginDirection;
		if (nextDirection === "remove" && !allowsRemoval) return;
		setDirection(nextDirection);
		setSubmitError(null);
	}

	async function handleSubmit() {
		if (!canSubmit || coordinatingRef.current) return;
		if (mode === "amount" && direction === "remove" && !allowsRemoval) return;
		coordinatingRef.current = true;
		setIsCoordinating(true);
		setSubmitError(null);

		try {
			const params = mode === "amount" ? amountParams : targetParams;
			if (!params) return;
			const reservationId = `isolated-margin:${createClientOrderId()}`;
			const lockResult = await runWithAvailableOrderAssetLocks(
				{ env: sessionIdentity.env, owner: sessionIdentity.owner, assetIds: [position.assetId] },
				async (lease) => {
					assertExecutionContext(params, mode);
					const reservationIntent = {
						intentKey: `isolated-margin:${position.assetId}`,
						exclusiveAssetLock: true,
						isRiskReducing: false,
					};
					const reservationState = getOrderAssetReservationState(lease, reservationIntent);
					if (reservationState === "unavailable") return { state: "coordination-unavailable" } as const;
					if (reservationState === "conflict") return { state: "blocked" } as const;

					try {
						let response: unknown;
						if (mode === "amount") {
							response = await amountMutation.mutateAsync(params as UpdateIsolatedMarginParameters);
						} else {
							response = await targetMutation.mutateAsync(params as TopUpIsolatedOnlyMarginParameters);
						}
						if (!isConfirmedDefaultExchangeResponse(response)) {
							reserveOrderAssets(lease, {
								...reservationIntent,
								submissionId: reservationId,
								createdAt: Date.now(),
							});
							return { state: "ambiguous" } as const;
						}
						return { state: "confirmed" } as const;
					} catch (error) {
						if (!isAmbiguousExchangeRequestError(error)) throw error;
						reserveOrderAssets(lease, {
							...reservationIntent,
							submissionId: reservationId,
							createdAt: Date.now(),
						});
						return { state: "ambiguous" } as const;
					}
				},
			);
			if (!lockResult.supported) {
				throw new Error(t`Safe action coordination across tabs is unavailable in this browser.`);
			}
			if (!lockResult.acquired || lockResult.value.state === "blocked") {
				throw new Error(t`Another action for this market is already in progress.`);
			}
			if (lockResult.value.state === "coordination-unavailable") {
				throw new Error(t`Safe action coordination across tabs is unavailable in this browser.`);
			}
			if (lockResult.value.state === "ambiguous") {
				const message = t`The margin update may have been applied. Refresh position data before trying again.`;
				setRequiresRefresh(true);
				setSubmitError(message);
				toast.error(message);
				return;
			}

			toast.success(t`Isolated margin updated`, {
				description: position.coin,
			});
			onOpenChange(false);
		} catch (error) {
			const message = error instanceof Error ? error.message : t`Failed to update isolated margin`;
			setSubmitError(message);
			toast.error(message);
		} finally {
			coordinatingRef.current = false;
			setIsCoordinating(false);
		}
	}

	function handleOpenChange(nextOpen: boolean) {
		if (!nextOpen && isSubmitting) return;
		onOpenChange(nextOpen);
	}

	function renderPositionStatus() {
		if (!identityMatches) {
			return t`Trading data changed while this dialog was open. Close and reopen it before submitting.`;
		}
		if (!hasLiveMarket) {
			return t`The selected market changed. Reopen the margin dialog before adjusting margin.`;
		}
		if (positionError || positionStale) {
			return t`Live position data is unavailable. Wait for the account connection to recover before adjusting margin.`;
		}
		if (positionLoading) return t`Loading position...`;
		if (!livePosition) return t`This isolated position is no longer open.`;
		if (!livePositionSize) {
			return t`Live position data is unavailable. Wait for the account connection to recover before adjusting margin.`;
		}
		if (livePositionSize.eq(0)) return t`This isolated position is no longer open.`;
		if (!isLiveIsolated) return t`This position is no longer using isolated margin.`;
		if (!liveSideMatches) return t`This position changed sides. Reopen the margin dialog before adjusting margin.`;
		return null;
	}

	const positionStatus = renderPositionStatus();
	const amountInvalid = amountInput !== "" && amountParams === null;
	const targetInvalid = targetLeverageInput !== "" && targetValidation === "invalid-target";
	const targetNotBelowCurrent = targetLeverageInput !== "" && targetValidation === "not-below-current";
	const targetCurrentUnavailable =
		targetLeverageInput !== "" && targetValidation === "current-leverage-unavailable" && positionStatus === null;
	let submitLabel = t`Remove Margin`;
	if (mode === "target") {
		submitLabel = t`Add to Target`;
	} else if (direction === "add") {
		submitLabel = t`Add Margin`;
	}

	return (
		<PositionRiskDialogShell
			open={open}
			onOpenChange={handleOpenChange}
			isMobile={isMobile}
			dismissible={!isSubmitting}
		>
			<ModalHeader className="max-[1000px]:gap-1 max-[1000px]:border-b-0 max-[1000px]:px-4 max-[1000px]:pt-7 max-[1000px]:pr-4 max-[1000px]:pb-0">
				<ModalTitle>{t`Adjust Isolated Margin`}</ModalTitle>
				<ModalDescription>{position.coin}</ModalDescription>
			</ModalHeader>

			<ModalContent className="space-y-4 max-[1000px]:px-4 max-[1000px]:pt-4 max-[1000px]:pb-0">
				<div className="rounded-[12px] border border-market-close-stroke-card bg-market-close-card p-3 space-y-1 text-xs">
					<InfoRow
						className="p-0"
						label={t`Current Margin`}
						value={formatUSD(marginUsed)}
						valueClassName="font-medium tabular-nums"
					/>
					<InfoRow
						className="p-0"
						label={t`Effective Leverage`}
						value={
							currentEffectiveLeverage === null
								? "—"
								: `${formatNumber(currentEffectiveLeverage, { maximumFractionDigits: 2 })}×`
						}
						valueClassName="font-medium tabular-nums"
					/>
					<InfoRow
						className="p-0"
						label={t`Liquidation Price`}
						value={formatLiquidationPrice(liquidationPx, position.szDecimals)}
						valueClassName="font-medium tabular-nums"
					/>
				</div>

				{supportsTargetLeverage ? (
					<SegmentedControls value={mode} onValueChange={handleModeChange} fullWidth>
						<SegmentedControlItem value="amount" className="max-[1000px]:min-h-11">
							{t`USDC Amount`}
						</SegmentedControlItem>
						<SegmentedControlItem value="target" className="max-[1000px]:min-h-11">
							{t`Target Leverage`}
						</SegmentedControlItem>
					</SegmentedControls>
				) : null}

				{mode === "amount" ? (
					<div className="space-y-3">
						<SegmentedControls value={direction} onValueChange={handleDirectionChange} fullWidth>
							<SegmentedControlItem value="add" className="max-[1000px]:min-h-11">
								{t`Add`}
							</SegmentedControlItem>
							<SegmentedControlItem value="remove" disabled={!allowsRemoval} className="max-[1000px]:min-h-11">
								{t`Remove`}
							</SegmentedControlItem>
						</SegmentedControls>
						<NumberInput
							label={t`Amount`}
							aria-label={t`Margin amount`}
							value={amountInput}
							onChange={(event) => {
								setAmountInput(event.target.value);
								setSubmitError(null);
							}}
							placeholder="0.00"
							maxAllowedDecimals={6}
							min={0}
							suffix="USDC"
							inputSize="sm"
							mobileSafe
							className="max-[1000px]:h-11 max-[1000px]:rounded-[10px] max-[1000px]:border-market-close-stroke-input max-[1000px]:bg-modal"
						/>
						{amountInvalid ? (
							<p className="text-xs text-error">{t`Enter a positive amount with up to 6 decimal places.`}</p>
						) : null}
						{direction === "remove" ? (
							<div className="flex items-start gap-2 rounded-xs border border-stroke-warning-strong/20 bg-warning-soft/10 p-2.5">
								<WarningIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
								<p className="text-xs leading-relaxed text-warning">
									{t`Removing margin increases liquidation risk. Hyperliquid will reject amounts that breach margin requirements.`}
								</p>
							</div>
						) : (
							<p className="text-xs leading-relaxed text-fg-muted">
								{t`Adding margin lowers effective leverage and moves the liquidation price farther away.`}
							</p>
						)}
						{hasLiveMarket && !marketAllowsRemoval ? (
							<p className="text-xs leading-relaxed text-fg-muted">
								{t`This strict isolated market does not allow margin to be removed from an open position.`}
							</p>
						) : null}
					</div>
				) : (
					<div className="space-y-3">
						<NumberInput
							label={t`Target Leverage`}
							labelValue={
								currentEffectiveLeverage === null
									? undefined
									: `${t`Current`}: ${formatNumber(currentEffectiveLeverage, { maximumFractionDigits: 2 })}×`
							}
							aria-label={t`Target leverage`}
							value={targetLeverageInput}
							onChange={(event) => {
								setTargetLeverageInput(event.target.value);
								setSubmitError(null);
							}}
							placeholder="5"
							maxAllowedDecimals={6}
							min={0}
							suffix="×"
							inputSize="sm"
							mobileSafe
							className="max-[1000px]:h-11 max-[1000px]:rounded-[10px] max-[1000px]:border-market-close-stroke-input max-[1000px]:bg-modal"
						/>
						{targetInvalid ? <p className="text-xs text-error">{t`Enter a positive target leverage.`}</p> : null}
						{targetNotBelowCurrent ? (
							<p className="text-xs text-error">
								{t`Target leverage must be below the current effective leverage to add margin.`}
							</p>
						) : null}
						{targetCurrentUnavailable ? (
							<p className="text-xs text-error">
								{t`Live position data is unavailable. Wait for the account connection to recover before adjusting margin.`}
							</p>
						) : null}
						<p className="text-xs leading-relaxed text-fg-muted">
							{t`Hyperliquid calculates and adds the margin required to reach the target leverage.`}
						</p>
					</div>
				)}

				{requiresRefresh ? (
					<div className="rounded-xs border border-stroke-error-strong/20 bg-error-soft p-2.5 text-xs text-error">
						{t`Close and reopen this dialog after the position data refreshes.`}
					</div>
				) : positionStatus ? (
					<div className="rounded-xs border border-stroke-error-strong/20 bg-error-soft p-2.5 text-xs text-error">
						{positionStatus}
					</div>
				) : null}

				{submitError ? (
					<div className="rounded-xs border border-stroke-error-strong/20 bg-error-soft p-2.5 text-xs text-error">
						{submitError}
					</div>
				) : null}
			</ModalContent>

			<ModalFooter className="max-[1000px]:grid max-[1000px]:grid-cols-2 max-[1000px]:gap-2 max-[1000px]:px-4 max-[1000px]:pt-4 max-[1000px]:pb-4">
				<Button
					size="sm"
					variant="ghost"
					intent="neutral"
					onClick={() => handleOpenChange(false)}
					disabled={isSubmitting}
					className="max-[1000px]:min-h-11 max-[1000px]:rounded-[10px] max-[1000px]:border max-[1000px]:border-market-close-stroke-input max-[1000px]:text-market-close-fg"
				>
					{t`Cancel`}
				</Button>
				<TradingActionButton
					onClick={handleSubmit}
					disabled={!canSubmit}
					containerClassName="max-[1000px]:w-full"
					className="min-w-24 max-[1000px]:min-h-11 max-[1000px]:w-full max-[1000px]:rounded-[10px]"
				>
					{isSubmitting ? (
						<>
							<SpinnerGapIcon className="size-3.5 animate-spin" />
							{t`Updating...`}
						</>
					) : (
						submitLabel
					)}
				</TradingActionButton>
			</ModalFooter>
		</PositionRiskDialogShell>
	);
}
