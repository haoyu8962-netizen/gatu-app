import { Button, ModalContent, ModalFooter, ModalHeader, ModalTitle } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { InfoRow } from "@/components/ui/info-row";
import { HL_ALL_DEXS } from "@/config/app";
import { buildPositionTpSlUpdatePlan, hasPositionTpSlTriggerMutation } from "@/domain/trade/order-intent";
import { doesOrderBatchMatchRiskContext } from "@/domain/trade/order-risk-context";
import { throwIfAnyResponseError } from "@/domain/trade/orders";
import { useTrackedOrder } from "@/hooks/trade/use-tracked-order";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { formatPercent, formatPrice, formatToken, formatUSD, szDecimalsToPriceDecimals } from "@/lib/format";
import { type Position, useExchange, useMarketsInfo, useSubscription, useUserPositions } from "@/lib/hyperliquid";
import { isPositive, toBig, toNumber } from "@/lib/trade/numbers";
import { areTpSlOrderInfosEqual, buildTpSlOrdersByCoin, type TpSlOrderInfo } from "@/lib/trade/open-orders";
import { validateSlPrice, validateTpPrice } from "@/lib/trade/tpsl";
import { getValueColorClass } from "@/lib/ui/value-color";
import { AssetDisplay } from "../components/asset-display";
import { TradingActionButton } from "../components/trading-action-button";
import { TpSlSection } from "../tradebox/tp-sl-section";
import type { TpSlPositionRef } from "./position-dialog-types";
import { PositionRiskDialogShell } from "./position-risk-dialog-ui";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	position: TpSlPositionRef | null;
}

export function PositionTpSlModal({ open, onOpenChange, position }: Props) {
	const isMobile = useIsMobile();
	if (!position) return null;
	return (
		<PositionTpSlModalBody
			key={`${position.dex}:${position.assetId}:${open ? "open" : "closed"}`}
			open={open}
			position={position}
			isMobile={isMobile}
			onOpenChange={onOpenChange}
		/>
	);
}

interface BodyProps {
	open: boolean;
	position: TpSlPositionRef;
	isMobile: boolean;
	onOpenChange: (open: boolean) => void;
}

function PositionTpSlModalBody({ open, position, isMobile, onOpenChange }: BodyProps) {
	const { address, isConnected } = useWalletSession();
	const { getPosition, isLoading: positionLoading, hasError: positionError } = useUserPositions();
	const { getMarketInfo } = useMarketsInfo();
	const currentPosition = getPosition(position.coin, position.dex);
	const marketMarkPx = toNumber(getMarketInfo(position.coin)?.markPx);
	const { data: liveAssetCtx } = useSubscription("activeAssetCtx", { coin: position.coin }, { enabled: open });
	const liveMarkPx = toNumber(liveAssetCtx?.ctx?.markPx) ?? marketMarkPx;
	const { data: openOrdersEvent, status: openOrdersStatus } = useSubscription(
		"openOrders",
		{ user: address ?? "0x0", dex: HL_ALL_DEXS },
		{ enabled: open && isConnected && !!address },
	);
	const currentTpSlInfo = buildTpSlOrdersByCoin(openOrdersEvent?.orders ?? []).get(position.coin);
	const currentPositionSize = toBig(currentPosition?.szi);
	const hasOpenOrdersSnapshot = openOrdersEvent !== undefined;

	if (!isConnected || !address) {
		return (
			<PositionTpSlStatus
				open={open}
				isMobile={isMobile}
				position={position}
				message={t`Connect wallet to view positions`}
				onClose={onOpenChange}
			/>
		);
	}
	if (positionError && !currentPosition) {
		return (
			<PositionTpSlStatus
				open={open}
				isMobile={isMobile}
				position={position}
				message={t`Failed to load positions.`}
				onClose={onOpenChange}
			/>
		);
	}
	if (openOrdersStatus === "error" && !hasOpenOrdersSnapshot) {
		return (
			<PositionTpSlStatus
				open={open}
				isMobile={isMobile}
				position={position}
				message={t`Failed to load open orders.`}
				onClose={onOpenChange}
			/>
		);
	}
	if ((positionLoading && !currentPosition) || !hasOpenOrdersSnapshot) {
		return (
			<PositionTpSlStatus
				open={open}
				isMobile={isMobile}
				position={position}
				message={t`Loading...`}
				loading
				onClose={onOpenChange}
			/>
		);
	}
	if (!currentPosition || !currentPositionSize || currentPositionSize.eq(0)) {
		return (
			<PositionTpSlStatus
				open={open}
				isMobile={isMobile}
				position={position}
				message={t`No active positions.`}
				onClose={onOpenChange}
			/>
		);
	}
	const liveDataReady = !positionLoading && !positionError && openOrdersStatus === "active";
	let liveDataMessage: string | null = null;
	if (positionError) {
		liveDataMessage = t`Failed to load positions.`;
	} else if (openOrdersStatus === "error") {
		liveDataMessage = t`Failed to load open orders.`;
	} else if (!liveDataReady) {
		liveDataMessage = t`Loading...`;
	}

	return (
		<PositionTpSlForm
			open={open}
			isMobile={isMobile}
			positionRef={position}
			position={currentPosition}
			markPx={liveMarkPx}
			currentTpSlInfo={currentTpSlInfo}
			liveDataReady={liveDataReady}
			liveDataMessage={liveDataMessage}
			onOpenChange={onOpenChange}
		/>
	);
}

interface FormProps {
	open: boolean;
	isMobile: boolean;
	positionRef: TpSlPositionRef;
	position: Position;
	markPx: number | null;
	currentTpSlInfo: TpSlOrderInfo | undefined;
	liveDataReady: boolean;
	liveDataMessage: string | null;
	onOpenChange: (open: boolean) => void;
}

function PositionTpSlForm({
	open,
	isMobile,
	positionRef,
	position,
	markPx,
	currentTpSlInfo,
	liveDataReady,
	liveDataMessage,
	onOpenChange,
}: FormProps) {
	const decimals = szDecimalsToPriceDecimals(positionRef.szDecimals);
	const [initialTpPrice] = useState(currentTpSlInfo?.tpPrice);
	const [initialSlPrice] = useState(currentTpSlInfo?.slPrice);
	const [initialTpOrderId] = useState(currentTpSlInfo?.tpOrderId);
	const [initialSlOrderId] = useState(currentTpSlInfo?.slOrderId);
	const [tpPriceInput, setTpPriceInput] = useState(initialTpPrice ? initialTpPrice.toFixed(decimals) : "");
	const [slPriceInput, setSlPriceInput] = useState(initialSlPrice ? initialSlPrice.toFixed(decimals) : "");
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [requiresRefresh, setRequiresRefresh] = useState(false);

	const { submitOrder, isPending: isPlacing, error: placeError } = useTrackedOrder();
	const { mutateAsync: modifyOrders, isPending: isModifying, error: modifyError } = useExchange("batchModify");
	const { mutateAsync: cancelOrders, isPending: isCancelling, error: cancelError } = useExchange("cancel");
	const isSubmitting = isPlacing || isModifying || isCancelling;

	const signedSize = toNumber(position.szi) ?? 0;
	const isLong = signedSize > 0;
	const size = Math.abs(signedSize);
	const entryPx = toNumber(position.entryPx) ?? 0;
	const unrealizedPnl = toNumber(position.unrealizedPnl) ?? 0;
	const roe = toNumber(position.returnOnEquity) ?? 0;
	const leverage = position.leverage.value;
	const side = isLong ? "buy" : "sell";

	const initialTpSlInfo: TpSlOrderInfo = {
		tpPrice: initialTpPrice,
		slPrice: initialSlPrice,
		tpOrderId: initialTpOrderId,
		slOrderId: initialSlOrderId,
	};
	const positionChanged = isLong !== positionRef.isLong;
	const ordersChanged = !areTpSlOrderInfosEqual(initialTpSlInfo, currentTpSlInfo);

	const tpPriceNum = toNumber(tpPriceInput);
	const slPriceNum = toNumber(slPriceInput);
	const hasTp = isPositive(tpPriceNum);
	const hasSl = isPositive(slPriceNum);
	const updatePlan = buildPositionTpSlUpdatePlan({
		kind: "positionTpsl",
		assetId: positionRef.assetId,
		szDecimals: positionRef.szDecimals,
		isLong,
		tpPriceNum: hasTp ? tpPriceNum : null,
		slPriceNum: hasSl ? slPriceNum : null,
		existingTpPrice: currentTpSlInfo?.tpPrice,
		existingSlPrice: currentTpSlInfo?.slPrice,
		existingTpOrderId: currentTpSlInfo?.tpOrderId,
		existingSlOrderId: currentTpSlInfo?.slOrderId,
	});
	const tpNeedsMark = hasPositionTpSlTriggerMutation(updatePlan, "tp");
	const slNeedsMark = hasPositionTpSlTriggerMutation(updatePlan, "sl");
	const markReady = isPositive(markPx);
	const tpValid = !tpNeedsMark || (markReady && validateTpPrice(markPx, tpPriceNum, side));
	const slValid = !slNeedsMark || (markReady && validateSlPrice(markPx, slPriceNum, side));
	const dataChanged = positionChanged || ordersChanged;
	const canSubmit =
		updatePlan.hasChanges && tpValid && slValid && !dataChanged && !requiresRefresh && liveDataReady && !isSubmitting;

	let tpError: string | null = null;
	if (tpNeedsMark && markReady && !tpValid) {
		tpError = isLong ? t`Take profit trigger must be above mark` : t`Take profit trigger must be below mark`;
	}
	let slError: string | null = null;
	if (slNeedsMark && markReady && !slValid) {
		slError = isLong ? t`Stop trigger must be below mark` : t`Stop trigger must be above mark`;
	}

	async function handleSubmit() {
		if (!canSubmit) return;

		setSubmitError(null);
		let mutationStarted = false;
		try {
			const riskContext = { marketKind: "perp", marginMode: position.leverage.type } as const;
			const changedOrders = [...updatePlan.modifies.map((modify) => modify.order), ...updatePlan.orders];
			if (!doesOrderBatchMatchRiskContext(changedOrders, riskContext)) {
				throw new Error(t`Order market context does not match the submitted asset.`);
			}
			if (updatePlan.modifies.length > 0) {
				mutationStarted = true;
				const result = await modifyOrders({ a: true, modifies: updatePlan.modifies });
				throwIfAnyResponseError(result.response?.data?.statuses);
			}
			if (updatePlan.orders.length > 0) {
				mutationStarted = true;
				const submission = await submitOrder({ orders: updatePlan.orders, grouping: "positionTpsl" }, { riskContext });
				if (submission.state === "blocked") {
					setSubmitError(t`Another order for this market is still being confirmed.`);
					return;
				}
				if (submission.state === "reconciling") {
					setSubmitError(t`Order submitted. Confirming exchange status; do not retry.`);
					setRequiresRefresh(true);
					return;
				}
				throwIfAnyResponseError(submission.result.response?.data?.statuses);
			}
			if (updatePlan.cancels.length > 0) {
				mutationStarted = true;
				const result = await cancelOrders({ cancels: updatePlan.cancels });
				throwIfAnyResponseError(result.response?.data?.statuses);
			}
			onOpenChange(false);
		} catch (err) {
			const message = err instanceof Error ? err.message : t`Failed to update TP/SL orders`;
			setSubmitError(message);
			toast.error(message);
			if (mutationStarted) setRequiresRefresh(true);
		}
	}

	function handleOpenChange(nextOpen: boolean) {
		if (!nextOpen && isSubmitting) return;
		onOpenChange(nextOpen);
	}

	let guardMessage: string | null = null;
	if (requiresRefresh || dataChanged) {
		guardMessage = t`Trading data changed while this dialog was open. Close and reopen it before submitting.`;
	} else if (liveDataMessage) {
		guardMessage = liveDataMessage;
	} else if ((tpNeedsMark || slNeedsMark) && !markReady) {
		guardMessage = t`Loading...`;
	}
	const visibleError = submitError ?? placeError?.message ?? modifyError?.message ?? cancelError?.message;

	return (
		<PositionRiskDialogShell
			open={open}
			onOpenChange={handleOpenChange}
			isMobile={isMobile}
			dismissible={!isSubmitting}
		>
			{renderPositionHeader(positionRef.coin, isLong)}

			<ModalContent className="max-[1000px]:px-4 max-[1000px]:pt-3 max-[1000px]:pb-0">
				<div className="rounded-[12px] border border-market-close-stroke-card bg-market-close-card p-3 space-y-1 text-xs">
					<InfoRow
						className="p-0"
						label={t`Size`}
						value={`${formatToken(size, positionRef.szDecimals)} ${positionRef.coin}`}
						valueClassName="font-medium"
					/>
					<InfoRow
						className="p-0"
						label={t`Entry Price`}
						value={formatPrice(entryPx, { szDecimals: positionRef.szDecimals })}
						valueClassName="font-medium"
					/>
					<InfoRow
						className="p-0"
						label={t`Mark Price`}
						value={formatPrice(markPx, { szDecimals: positionRef.szDecimals })}
						valueClassName={cn("font-medium", markReady ? "text-warning" : "text-fg-muted")}
					/>
					<InfoRow
						className="p-0 border-t border-stroke-weak pt-3"
						label={t`Unrealized P&L`}
						value={
							<>
								{formatUSD(unrealizedPnl, { signDisplay: "exceptZero" })}
								<span className="font-normal text-fg-muted ml-1">({formatPercent(roe, 1)})</span>
							</>
						}
						valueClassName={cn("font-semibold", getValueColorClass(unrealizedPnl))}
					/>
				</div>
			</ModalContent>

			<div className="px-4 pb-4 max-[1000px]:pt-4">
				<TpSlSection
					side={side}
					referencePrice={entryPx}
					size={size}
					szDecimals={positionRef.szDecimals}
					tpPrice={tpPriceInput}
					slPrice={slPriceInput}
					onTpPriceChange={setTpPriceInput}
					onSlPriceChange={setSlPriceInput}
					tpError={tpError}
					slError={slError}
					quickPercentMode="roe"
					leverage={leverage}
					triggerValidationPrice={markPx}
					mobileTouchSafe
				/>

				{guardMessage && (
					<div className="mt-3 px-2 py-1.5 rounded-8 bg-warning-soft border border-stroke-warning-weak text-xs text-warning">
						{guardMessage}
					</div>
				)}
				{visibleError && (
					<div className="mt-3 px-2 py-1.5 rounded-8 bg-error-soft border border-stroke-error-weak text-xs text-error">
						{visibleError}
					</div>
				)}
			</div>

			<ModalFooter className="max-[1000px]:grid max-[1000px]:grid-cols-2 max-[1000px]:gap-2 max-[1000px]:px-4 max-[1000px]:pt-0 max-[1000px]:pb-4">
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
							{t`Submitting...`}
						</>
					) : (
						t`Confirm`
					)}
				</TradingActionButton>
			</ModalFooter>
		</PositionRiskDialogShell>
	);
}

interface StatusProps {
	open: boolean;
	isMobile: boolean;
	position: TpSlPositionRef;
	message: string;
	loading?: boolean;
	onClose: (open: boolean) => void;
}

function PositionTpSlStatus({ open, isMobile, position, message, loading = false, onClose }: StatusProps) {
	return (
		<PositionRiskDialogShell open={open} onOpenChange={onClose} isMobile={isMobile} dismissible>
			{renderPositionHeader(position.coin, position.isLong)}
			<ModalContent className="max-[1000px]:px-4 max-[1000px]:pt-3">
				<div className="flex min-h-28 items-center justify-center gap-2 text-sm text-fg-muted">
					{loading && <SpinnerGapIcon className="size-4 animate-spin" />}
					<span>{message}</span>
				</div>
			</ModalContent>
			<ModalFooter className="max-[1000px]:px-4 max-[1000px]:pt-0 max-[1000px]:pb-4">
				<Button
					size="sm"
					variant="ghost"
					intent="neutral"
					onClick={() => onClose(false)}
					className="max-[1000px]:min-h-11 max-[1000px]:w-full max-[1000px]:rounded-[10px] max-[1000px]:border max-[1000px]:border-market-close-stroke-input"
				>
					{t`Close`}
				</Button>
			</ModalFooter>
		</PositionRiskDialogShell>
	);
}

function renderPositionHeader(coin: string, isLong: boolean) {
	return (
		<ModalHeader className="max-[1000px]:gap-1 max-[1000px]:border-b-0 max-[1000px]:px-4 max-[1000px]:pt-7 max-[1000px]:pr-4 max-[1000px]:pb-0">
			<ModalTitle>{t`Manage TP/SL`}</ModalTitle>
			<div className="flex items-center gap-1.5">
				<span
					className={cn("h-4 w-0.5 shrink-0 rounded-full", isLong ? "bg-success" : "bg-error")}
					aria-hidden="true"
				/>
				<AssetDisplay coin={coin} />
				<span className="text-xs text-fg-muted">· {isLong ? t`Long position` : t`Short position`}</span>
			</div>
		</ModalHeader>
	);
}
