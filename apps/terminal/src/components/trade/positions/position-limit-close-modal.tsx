import { Button, Modal, ModalContent, ModalFooter, ModalHeader, ModalPopup, ModalTitle } from "@hypeterminal/ui";
import { t } from "@lingui/core/macro";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { InfoRow } from "@/components/ui/info-row";
import { NumberInput } from "@/components/ui/number-input";
import { PriceInput } from "@/components/ui/price-input";
import { buildOrderPlan } from "@/domain/trade/order-intent";
import { throwIfAnyResponseError } from "@/domain/trade/orders";
import { cn } from "@/lib/cn";
import { formatPercent, formatPrice, formatToken, formatUSD, szDecimalsToPriceDecimals } from "@/lib/format";
import { useExchange, useSubscription } from "@/lib/hyperliquid";
import { formatDecimalFloor, getValueColorClass, isPositive, toNumber } from "@/lib/trade/numbers";
import { TradingActionButton } from "../components/trading-action-button";

interface PositionData {
	coin: string;
	assetId: number;
	isLong: boolean;
	size: number;
	entryPx: number;
	markPx: number;
	unrealizedPnl: number;
	roe: number;
	szDecimals: number;
}

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	position: PositionData | null;
}

export function PositionLimitCloseModal({ open, onOpenChange, position }: Props) {
	const [priceInput, setPriceInput] = useState("");
	const [sizeInput, setSizeInput] = useState("");

	const { mutateAsync: placeOrder, isPending: isSubmitting, error, reset: resetError } = useExchange("order");
	const { data: liveCtxEvent } = useSubscription(
		"activeAssetCtx",
		{ coin: position?.coin ?? "" },
		{ enabled: open && !!position?.coin },
	);
	const liveMarkPx = toNumber(liveCtxEvent?.ctx?.markPx) ?? position?.markPx ?? 0;

	useEffect(() => {
		if (open && position) {
			const priceDecimals = szDecimalsToPriceDecimals(position.szDecimals);
			setPriceInput(position.markPx.toFixed(priceDecimals));
			setSizeInput(formatDecimalFloor(position.size, position.szDecimals));
		} else if (!open) {
			setPriceInput("");
			setSizeInput("");
		}
	}, [open, position]);

	const priceNum = toNumber(priceInput);
	const sizeNum = toNumber(sizeInput);

	const priceValid = isPositive(priceNum);
	const sizeValid = isPositive(sizeNum) && sizeNum !== null && sizeNum <= (position?.size ?? 0);
	const canSubmit = position && priceValid && sizeValid && !isSubmitting;

	const estimatedPnl =
		position && priceNum && sizeNum
			? position.isLong
				? (priceNum - position.entryPx) * sizeNum
				: (position.entryPx - priceNum) * sizeNum
			: null;

	async function handleSubmit() {
		if (!canSubmit || !position || priceNum === null || sizeNum === null) return;

		resetError();

		const { orders, grouping } = buildOrderPlan({
			kind: "limitClose",
			assetId: position.assetId,
			size: sizeNum,
			szDecimals: position.szDecimals,
			isLong: position.isLong,
			price: priceNum,
		});

		try {
			const result = await placeOrder({ orders, grouping });
			throwIfAnyResponseError(result.response?.data?.statuses);

			toast.success(t`Limit close order placed` + (position.coin ? ` — ${position.coin}` : ""));
			setPriceInput("");
			setSizeInput("");
			onOpenChange(false);
		} catch {}
	}

	function handleOpenChange(nextOpen: boolean) {
		if (!nextOpen) {
			setPriceInput("");
			setSizeInput("");
			resetError();
		}
		onOpenChange(nextOpen);
	}

	function handleMaxSize() {
		if (!position) return;
		setSizeInput(formatDecimalFloor(position.size, position.szDecimals));
	}

	if (!position) return null;

	const priceDecimals = szDecimalsToPriceDecimals(position.szDecimals);

	return (
		<Modal open={open} onOpenChange={handleOpenChange}>
			<ModalPopup size="sm" showClose={false}>
				<ModalHeader className="border-b border-stroke-weak/40">
					<ModalTitle>{t`Limit Close`}</ModalTitle>
				</ModalHeader>

				<ModalContent>
					<div className="rounded-8 border border-stroke-weak/50 bg-surface p-3 space-y-1 text-xs">
						<InfoRow
							className="p-0"
							label={t`Size`}
							value={`${formatToken(position.size, position.szDecimals)} ${position.coin}`}
							valueClassName="font-medium tabular-nums"
						/>
						<InfoRow
							className="p-0"
							label={t`Entry Price`}
							value={formatPrice(position.entryPx, { szDecimals: position.szDecimals })}
							valueClassName="font-medium tabular-nums"
						/>
						<InfoRow
							className="p-0"
							label={t`Mark Price`}
							value={formatPrice(liveMarkPx, { szDecimals: position.szDecimals })}
							valueClassName="font-medium tabular-nums text-warning"
						/>
						<InfoRow
							className="p-0 border-t border-stroke-weak/50 pt-3"
							label={t`Unrealized P&L`}
							value={
								<>
									{formatUSD(position.unrealizedPnl, { signDisplay: "exceptZero" })}
									<span className="font-normal text-fg-muted ml-1">({formatPercent(position.roe, 1)})</span>
								</>
							}
							valueClassName={cn("font-semibold tabular-nums", getValueColorClass(position.unrealizedPnl))}
						/>
					</div>
				</ModalContent>

				<div className="px-6 pb-4 space-y-4">
					<PriceInput
						label={t`Limit Price`}
						value={priceInput}
						onChange={(e) => setPriceInput(e.target.value)}
						onMidClick={setPriceInput}
						placeholder="0.00"
						maxAllowedDecimals={priceDecimals}
						midPrice={liveMarkPx}
						szDecimals={position.szDecimals}
						inputSize="sm"
						className="w-full"
					/>

					<div>
						<NumberInput
							label={t`Size`}
							labelValue={
								<>
									Available:{" "}
									<span className="underline decoration-dashed underline-offset-2 decoration-fg-muted/50">
										{formatToken(position.size, position.szDecimals)} {position.coin}
									</span>
								</>
							}
							onLabelValueClick={handleMaxSize}
							value={sizeInput}
							onChange={(e) => setSizeInput(e.target.value)}
							placeholder="0.00"
							maxAllowedDecimals={position.szDecimals}
							inputSize="sm"
							className="w-full"
						/>
						{sizeNum !== null && sizeNum > position.size && (
							<p className="text-xs text-error mt-1">{t`Size exceeds position`}</p>
						)}
					</div>

					{estimatedPnl !== null && (
						<InfoRow
							className="p-0 text-xs"
							label={t`Est. P&L at Limit`}
							value={formatUSD(estimatedPnl, { signDisplay: "exceptZero" })}
							valueClassName={cn("font-semibold tabular-nums", getValueColorClass(estimatedPnl))}
						/>
					)}

					{error && (
						<div className="mt-3 px-2 py-1.5 rounded-8 bg-error-soft border border-stroke-error-strong/20 text-xs text-error">
							{error.message}
						</div>
					)}
				</div>

				<ModalFooter>
					<Button
						size="sm"
						variant="ghost"
						intent="neutral"
						onClick={() => handleOpenChange(false)}
						disabled={isSubmitting}
					>
						{t`Cancel`}
					</Button>
					<TradingActionButton onClick={handleSubmit} disabled={!canSubmit} className="min-w-24">
						{isSubmitting ? (
							<>
								<SpinnerGapIcon className="size-3.5 animate-spin" />
								{t`Submitting...`}
							</>
						) : (
							t`Place Limit Close`
						)}
					</TradingActionButton>
				</ModalFooter>
			</ModalPopup>
		</Modal>
	);
}
