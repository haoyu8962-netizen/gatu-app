import {
	Button,
	Modal,
	ModalContent,
	ModalDescription,
	ModalFooter,
	ModalHeader,
	ModalPopup,
	ModalTitle,
	SegmentedControlItem,
	SegmentedControls,
} from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { SpinnerGapIcon, WarningIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { InfoRow } from "@/components/ui/info-row";
import { NumberInput } from "@/components/ui/number-input";
import { ISOLATED_RISK_FEATURES } from "@/config/isolated-risk";
import {
	buildIsolatedMarginAmountParameters,
	buildIsolatedMarginTargetParameters,
	calculateEffectiveLeverage,
	canRemoveIsolatedMargin,
	type IsolatedMarginDirection,
} from "@/domain/trade/isolated-margin";
import { formatLiquidationPrice, formatNumber, formatUSD } from "@/lib/format";
import { useExchange, useUserPositions } from "@/lib/hyperliquid";
import { toBig } from "@/lib/trade/numbers";
import { TradingActionButton } from "../components/trading-action-button";
import type { IsolatedMarginPositionRef } from "./position-dialog-types";

type AdjustmentMode = "amount" | "target";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	position: IsolatedMarginPositionRef | null;
}

export function PositionIsolatedMarginModal({ open, onOpenChange, position }: Props) {
	if (!position) return null;

	return (
		<Modal open={open} onOpenChange={onOpenChange}>
			<ModalPopup size="sm" showClose={false}>
				<PositionIsolatedMarginModalBody
					key={`${position.assetId}:${open ? "open" : "closed"}`}
					position={position}
					onOpenChange={onOpenChange}
				/>
			</ModalPopup>
		</Modal>
	);
}

interface BodyProps {
	position: IsolatedMarginPositionRef;
	onOpenChange: (open: boolean) => void;
}

function PositionIsolatedMarginModalBody({ position, onOpenChange }: BodyProps) {
	const [mode, setMode] = useState<AdjustmentMode>("amount");
	const [direction, setDirection] = useState<IsolatedMarginDirection>("add");
	const [amountInput, setAmountInput] = useState("");
	const [targetLeverageInput, setTargetLeverageInput] = useState("");
	const [submitError, setSubmitError] = useState<string | null>(null);

	const amountMutation = useExchange("updateIsolatedMargin");
	const targetMutation = useExchange("topUpIsolatedOnlyMargin");
	const { getPosition, isLoading: positionLoading, hasError: positionError } = useUserPositions();
	const livePosition = getPosition(position.coin, position.dex);

	const marginUsed = livePosition?.marginUsed ?? position.marginUsed;
	const positionValue = livePosition?.positionValue ?? position.positionValue;
	const liquidationPx = livePosition?.liquidationPx ?? position.liquidationPx;
	const currentEffectiveLeverage = calculateEffectiveLeverage(positionValue, marginUsed);
	const supportsTargetLeverage = position.marginConstraint !== undefined;
	const marketAllowsRemoval = canRemoveIsolatedMargin(position.marginConstraint);
	const allowsRemoval = marketAllowsRemoval && ISOLATED_RISK_FEATURES.increaseEnabled;
	const livePositionSize = toBig(livePosition?.szi);
	const isLiveIsolated = livePosition?.leverage.type === "isolated";
	const liveIsLong = livePositionSize ? livePositionSize.gt(0) : position.isLong;

	const amountParams = buildIsolatedMarginAmountParameters({
		assetId: position.assetId,
		isLong: liveIsLong,
		direction,
		amount: amountInput,
	});
	const targetParams = buildIsolatedMarginTargetParameters(position.assetId, targetLeverageInput);
	const isSubmitting = amountMutation.isPending || targetMutation.isPending;
	const hasLivePosition = livePosition !== null && isLiveIsolated && !positionError;
	const inputValid = mode === "amount" ? amountParams !== null : targetParams !== null;
	const canSubmit = hasLivePosition && inputValid && !isSubmitting;

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
		if (!canSubmit) return;
		setSubmitError(null);

		try {
			if (mode === "amount") {
				if (!amountParams) return;
				await amountMutation.mutateAsync(amountParams);
			} else {
				if (!targetParams) return;
				await targetMutation.mutateAsync(targetParams);
			}

			toast.success(t`Isolated margin updated`, {
				description: position.coin,
			});
			onOpenChange(false);
		} catch (error) {
			const message = error instanceof Error ? error.message : t`Failed to update isolated margin`;
			setSubmitError(message);
			toast.error(message);
		}
	}

	function renderPositionStatus() {
		if (positionError) {
			return t`Live position data is unavailable. Wait for the account connection to recover before adjusting margin.`;
		}
		if (!livePosition && positionLoading) return t`Loading position...`;
		if (!livePosition) return t`This isolated position is no longer open.`;
		if (!isLiveIsolated) return t`This position is no longer using isolated margin.`;
		return null;
	}

	const positionStatus = renderPositionStatus();
	const amountInvalid = amountInput !== "" && amountParams === null;
	const targetInvalid = targetLeverageInput !== "" && targetParams === null;
	let submitLabel = t`Remove Margin`;
	if (mode === "target") {
		submitLabel = t`Add to Target`;
	} else if (direction === "add") {
		submitLabel = t`Add Margin`;
	}

	return (
		<>
			<ModalHeader>
				<ModalTitle>{t`Adjust Isolated Margin`}</ModalTitle>
				<ModalDescription>{position.coin}</ModalDescription>
			</ModalHeader>

			<ModalContent className="space-y-4">
				<div className="rounded-xs border border-stroke-weak bg-surface p-3 space-y-1 text-xs">
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
						<SegmentedControlItem value="amount">{t`USDC Amount`}</SegmentedControlItem>
						<SegmentedControlItem value="target">{t`Target Leverage`}</SegmentedControlItem>
					</SegmentedControls>
				) : null}

				{mode === "amount" ? (
					<div className="space-y-3">
						<SegmentedControls value={direction} onValueChange={handleDirectionChange} fullWidth>
							<SegmentedControlItem value="add">{t`Add`}</SegmentedControlItem>
							<SegmentedControlItem value="remove" disabled={!allowsRemoval}>
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
						{!marketAllowsRemoval ? (
							<p className="text-xs leading-relaxed text-fg-muted">
								{t`This strict isolated market does not allow margin to be removed from an open position.`}
							</p>
						) : !ISOLATED_RISK_FEATURES.increaseEnabled ? (
							<p className="text-xs leading-relaxed text-fg-muted">
								{t`Removing isolated margin is temporarily unavailable. Adding margin and closing the position remain available.`}
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
						/>
						{targetInvalid ? <p className="text-xs text-error">{t`Enter a positive target leverage.`}</p> : null}
						<p className="text-xs leading-relaxed text-fg-muted">
							{t`Hyperliquid calculates and adds the margin required to reach the target leverage.`}
						</p>
					</div>
				)}

				{positionStatus ? (
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

			<ModalFooter>
				<Button size="sm" variant="ghost" intent="neutral" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
					{t`Cancel`}
				</Button>
				<TradingActionButton onClick={handleSubmit} disabled={!canSubmit} className="min-w-24">
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
		</>
	);
}
