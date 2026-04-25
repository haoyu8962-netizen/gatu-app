import { Button, Modal, ModalContent, ModalFooter, ModalHeader, ModalPopup, ModalTitle } from "@hypeterminal/ui";
import { t } from "@lingui/core/macro";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { InfoRow } from "@/components/ui/info-row";
import { buildOrderPlan } from "@/domain/trade/order-intent";
import { throwIfAnyResponseError } from "@/domain/trade/orders";
import { cn } from "@/lib/cn";
import { formatPercent, formatPrice, formatToken, formatUSD, szDecimalsToPriceDecimals } from "@/lib/format";
import { useExchange } from "@/lib/hyperliquid";
import { isPositive, toNumber } from "@/lib/trade/numbers";
import { validateSlPrice, validateTpPrice } from "@/lib/trade/tpsl";
import { getValueColorClass } from "@/lib/ui/value-color";
import { AssetDisplay } from "../components/asset-display";
import { TradingActionButton } from "../components/trading-action-button";
import { TpSlSection } from "../tradebox/tp-sl-section";
import type { TpSlPositionData } from "./position-dialog-types";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	position: TpSlPositionData | null;
}

export function PositionTpSlModal({ open, onOpenChange, position }: Props) {
	const [tpPriceInput, setTpPriceInput] = useState("");
	const [slPriceInput, setSlPriceInput] = useState("");

	const { mutateAsync: placeOrder, isPending: isSubmitting, error, reset: resetError } = useExchange("order");

	useEffect(() => {
		if (open && position) {
			const decimals = szDecimalsToPriceDecimals(position.szDecimals);
			setTpPriceInput(position.existingTpPrice ? position.existingTpPrice.toFixed(decimals) : "");
			setSlPriceInput(position.existingSlPrice ? position.existingSlPrice.toFixed(decimals) : "");
		} else if (!open) {
			setTpPriceInput("");
			setSlPriceInput("");
		}
	}, [open, position]);

	const tpPriceNum = toNumber(tpPriceInput);
	const slPriceNum = toNumber(slPriceInput);

	const side = position?.isLong ? "buy" : "sell";
	const referencePrice = position?.entryPx ?? 0;
	const size = position?.size ?? 0;

	const hasTp = isPositive(tpPriceNum);
	const hasSl = isPositive(slPriceNum);
	const tpValid = !hasTp || validateTpPrice(referencePrice, tpPriceNum, side);
	const slValid = !hasSl || validateSlPrice(referencePrice, slPriceNum, side);
	const canSubmit = position && (hasTp || hasSl) && tpValid && slValid && !isSubmitting;

	const tpError = hasTp && !tpValid ? (position?.isLong ? t`TP must be above entry` : t`TP must be below entry`) : null;
	const slError = hasSl && !slValid ? (position?.isLong ? t`SL must be below entry` : t`SL must be above entry`) : null;

	const handleSubmit = useCallback(async () => {
		if (!canSubmit || !position) return;

		resetError();

		const plan = buildOrderPlan({
			kind: "positionTpsl",
			assetId: position.assetId,
			isLong: position.isLong,
			tpPriceNum: hasTp ? tpPriceNum : null,
			slPriceNum: hasSl ? slPriceNum : null,
		});

		if (plan.errors.length > 0) {
			return;
		}

		try {
			const result = await placeOrder({ orders: plan.orders, grouping: plan.grouping });
			throwIfAnyResponseError(result.response?.data?.statuses);

			setTpPriceInput("");
			setSlPriceInput("");
			onOpenChange(false);
		} catch {}
	}, [canSubmit, hasSl, hasTp, onOpenChange, placeOrder, position, resetError, slPriceNum, tpPriceNum]);

	function handleOpenChange(nextOpen: boolean) {
		if (!nextOpen) {
			setTpPriceInput("");
			setSlPriceInput("");
			resetError();
		}
		onOpenChange(nextOpen);
	}

	if (!position) return null;

	return (
		<Modal open={open} onOpenChange={handleOpenChange}>
			<ModalPopup
				size="sm"
				showClose={false}
				aria-label={t`Manage TP/SL for ${position.coin} ${position.isLong ? "long" : "short"} position`}
			>
				<ModalHeader>
					<ModalTitle>{t`Manage TP/SL`}</ModalTitle>
					<div className="flex items-center gap-1.5">
						<span
							className={cn("h-4 w-0.5 shrink-0 rounded-full", position.isLong ? "bg-success" : "bg-error")}
							aria-hidden="true"
						/>
						<AssetDisplay coin={position.coin} />
						<span className="text-xs text-fg-muted">· {position.isLong ? t`Long position` : t`Short position`}</span>
					</div>
				</ModalHeader>

				<ModalContent>
					<div className="rounded-8 border border-stroke-weak/50 bg-surface p-3 space-y-1 text-xs">
						<InfoRow
							className="p-0"
							label={t`Size`}
							value={`${formatToken(position.size, position.szDecimals)} ${position.coin}`}
							valueClassName="font-medium"
						/>
						<InfoRow
							className="p-0"
							label={t`Entry Price`}
							value={formatPrice(position.entryPx, { szDecimals: position.szDecimals })}
							valueClassName="font-medium"
						/>
						<InfoRow
							className="p-0"
							label={t`Mark Price`}
							value={formatPrice(position.markPx, { szDecimals: position.szDecimals })}
							valueClassName="font-medium text-warning"
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
							valueClassName={cn("font-semibold", getValueColorClass(position.unrealizedPnl))}
						/>
					</div>
				</ModalContent>

				<div className="px-4 pb-4">
					<TpSlSection
						side={side}
						referencePrice={referencePrice}
						size={size}
						szDecimals={position.szDecimals}
						tpPrice={tpPriceInput}
						slPrice={slPriceInput}
						onTpPriceChange={setTpPriceInput}
						onSlPriceChange={setSlPriceInput}
						tpError={tpError}
						slError={slError}
					/>

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
							t`Confirm`
						)}
					</TradingActionButton>
				</ModalFooter>
			</ModalPopup>
		</Modal>
	);
}
