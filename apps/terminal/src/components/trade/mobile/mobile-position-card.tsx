import { Button } from "@hypeterminal/ui";
import { t } from "@lingui/core/macro";
import { CrosshairIcon, PencilIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { LIQ_WARNING_PROXIMITY } from "@/config/trade";
import { cn } from "@/lib/cn";
import { formatPercent, formatPrice, formatToken, formatUSD } from "@/lib/format";
import type { Position } from "@/lib/hyperliquid";
import type { Markets } from "@/lib/hyperliquid/markets";
import { isPositive, toBig } from "@/lib/trade/numbers";
import type { TpSlOrderInfo } from "@/lib/trade/open-orders";
import type { Side } from "@/lib/trade/types";
import { getValueColorClass } from "@/lib/ui/value-color";
import { AssetDisplay } from "../components/asset-display";
import type { LimitClosePositionData, TpSlPositionData } from "../positions/position-dialog-types";
import { MetricCell } from "./metric-cell";

interface Props {
	position: Position;
	markets: Markets;
	markPx: string | undefined;
	tpSlInfo: TpSlOrderInfo | undefined;
	isClosing: boolean;
	isRowClosing: boolean;
	closeErrorMessage: string | null;
	onClose: (assetId: number, size: number, markPx: number, szDecimals: number, isLong: boolean, coin: string) => void;
	onLimitClose: (data: LimitClosePositionData) => void;
	onOpenTpSl: (data: TpSlPositionData) => void;
	onSelectMarket: (coin: string, side: Side) => void;
}

export function MobilePositionCard({
	position: p,
	markets,
	markPx: markPxRaw,
	tpSlInfo,
	isClosing,
	isRowClosing,
	closeErrorMessage,
	onClose,
	onLimitClose,
	onOpenTpSl,
	onSelectMarket,
}: Props) {
	const [confirmingClose, setConfirmingClose] = useState(false);

	const size = toBig(p.szi)?.toNumber() ?? Number.NaN;
	const isLong = size > 0;
	const absSize = Math.abs(size);
	const market = markets.getMarket(p.coin);
	const displayName = market?.pairName ?? p.coin;
	const assetId = market?.assetId;
	const szDecimals = market?.szDecimals ?? 4;
	const markPx = toBig(markPxRaw)?.toNumber() ?? Number.NaN;
	const entryPx = toBig(p.entryPx)?.toNumber() ?? Number.NaN;
	const unrealizedPnl = toBig(p.unrealizedPnl)?.toNumber() ?? Number.NaN;
	const liqPx = toBig(p.liquidationPx)?.toNumber();
	const liqIsNear =
		liqPx != null &&
		Number.isFinite(markPx) &&
		Number.isFinite(liqPx) &&
		Math.abs(liqPx - markPx) / markPx <= LIQ_WARNING_PROXIMITY;

	const fundingRaw = toBig(p.cumFunding.sinceOpen)?.toNumber();
	const fundingValue = formatUSD(fundingRaw != null ? -fundingRaw : null, { signDisplay: "exceptZero" });
	const fundingClass = getValueColorClass(fundingRaw != null ? -fundingRaw : 0);

	const canClose = isPositive(absSize) && typeof assetId === "number" && isPositive(markPx);
	const pnlClass = getValueColorClass(unrealizedPnl);
	const hasTpSl = !!(tpSlInfo?.tpPrice || tpSlInfo?.slPrice);

	function handleClose() {
		if (!canClose || typeof assetId !== "number") return;
		onClose(assetId, absSize, markPx, szDecimals, isLong, p.coin);
	}

	function handleLimitClose() {
		if (!canClose || typeof assetId !== "number") return;
		onLimitClose({
			coin: p.coin,
			assetId,
			isLong,
			size: absSize,
			entryPx,
			markPx,
			unrealizedPnl,
			roe: toBig(p.returnOnEquity)?.toNumber() ?? 0,
			szDecimals,
		});
	}

	function handleOpenTpSl() {
		if (typeof assetId !== "number") return;
		onOpenTpSl({
			coin: p.coin,
			assetId,
			isLong,
			size: absSize,
			entryPx,
			markPx,
			unrealizedPnl,
			roe: toBig(p.returnOnEquity)?.toNumber() ?? 0,
			szDecimals,
			existingTpPrice: tpSlInfo?.tpPrice,
			existingSlPrice: tpSlInfo?.slPrice,
			existingTpOrderId: tpSlInfo?.tpOrderId,
			existingSlOrderId: tpSlInfo?.slOrderId,
		});
	}

	return (
		<div className="rounded-xs border border-stroke-weak/40 bg-surface overflow-hidden">
			<div className="relative flex items-center justify-between px-3 py-1.5 border-b border-stroke-weak/40">
				<div className={cn("absolute left-0 top-0 bottom-0 w-px", isLong ? "bg-market-up" : "bg-market-down")} />
				<Button
					variant="ghost"
					intent="neutral"
					size="sm"
					onClick={() => onSelectMarket(p.coin, isLong ? "buy" : "sell")}
					aria-label={
						isLong
							? t`Switch to ${displayName} market, long position`
							: t`Switch to ${displayName} market, short position`
					}
				>
					<AssetDisplay coin={p.coin} nameClassName="text-sm font-semibold" />
					<span className={cn("text-2xs font-medium uppercase", isLong ? "text-success" : "text-error")}>
						{isLong ? t`Long` : t`Short`}
					</span>
				</Button>
				<div className={cn("text-xs tabular-nums font-medium", pnlClass)}>
					{formatUSD(unrealizedPnl, { signDisplay: "exceptZero" })}
					<span className="text-2xs ml-1 font-normal text-fg-muted">{formatPercent(p.returnOnEquity, 1)}</span>
				</div>
			</div>

			<div className="grid grid-cols-3 divide-x divide-stroke-weak/40">
				<MetricCell
					label={t`Size`}
					value={
						<>
							<span className="whitespace-nowrap">
								{formatToken(absSize, { decimals: szDecimals, symbol: p.coin })}
							</span>
							<div className="text-2xs text-fg-muted font-normal tabular-nums mt-0.5">
								{formatUSD(p.positionValue, { compact: true })}
							</div>
						</>
					}
				/>
				<MetricCell label={t`Entry`} value={formatPrice(entryPx, { szDecimals })} />
				<MetricCell label={t`Mark`} value={formatPrice(markPx, { szDecimals })} />
			</div>
			<div className="grid grid-cols-3 divide-x divide-stroke-weak/40 border-t border-stroke-weak/40">
				<MetricCell
					label={p.leverage.type === "isolated" ? t`Margin · Iso` : t`Margin`}
					value={formatUSD(p.marginUsed)}
				/>
				<MetricCell
					label={t`Liq`}
					value={formatPrice(p.liquidationPx, { szDecimals })}
					valueClass={liqIsNear ? "text-error" : undefined}
				/>
				<MetricCell label={t`Funding`} value={fundingValue} valueClass={fundingClass} />
			</div>

			<div className="flex gap-1.5 px-2.5 py-1.5 border-t border-stroke-weak/40">
				{confirmingClose ? (
					<>
						<Button
							variant="outline"
							intent="neutral"
							size="xs"
							className="flex-1 justify-center"
							onClick={() => setConfirmingClose(false)}
						>
							{t`Cancel`}
						</Button>
						<Button
							variant="outline"
							intent="error"
							size="xs"
							className="flex-1 justify-center"
							onClick={handleClose}
							disabled={!canClose || isClosing}
							iconLeft={isRowClosing ? <Spinner className="size-3" /> : <XIcon className="size-3.5" />}
						>
							{t`Confirm Close`}
						</Button>
					</>
				) : (
					<>
						<Button
							variant="outline"
							intent="neutral"
							size="xs"
							className="flex-1 justify-center touch-target"
							onClick={handleOpenTpSl}
							disabled={typeof assetId !== "number"}
							iconLeft={hasTpSl ? <CrosshairIcon className="size-3.5" /> : <PlusIcon className="size-3.5" />}
						>
							{hasTpSl ? (
								<span className="inline-flex items-center gap-1 tabular-nums truncate">
									{tpSlInfo?.tpPrice && (
										<span className="text-success">{formatPrice(tpSlInfo.tpPrice, { szDecimals })}</span>
									)}
									{tpSlInfo?.tpPrice && tpSlInfo?.slPrice && <span className="text-fg-muted"> / </span>}
									{tpSlInfo?.slPrice && (
										<span className="text-error">{formatPrice(tpSlInfo.slPrice, { szDecimals })}</span>
									)}
									<PencilIcon className="size-3 text-fg-disabled" />
								</span>
							) : (
								t`TP/SL`
							)}
						</Button>
						<Button
							variant="outline"
							intent="neutral"
							size="xs"
							className="flex-1 justify-center touch-target"
							onClick={handleLimitClose}
							disabled={!canClose || isClosing}
						>
							{t`Limit Close`}
						</Button>
						<Button
							variant="outline"
							intent="error"
							size="xs"
							className="flex-1 justify-center touch-target"
							onClick={() => setConfirmingClose(true)}
							disabled={!canClose || isClosing}
							iconLeft={<XIcon className="size-3.5" />}
						>
							{t`Close`}
						</Button>
					</>
				)}
			</div>
			{closeErrorMessage && (
				<div className="px-3 py-1.5 text-xs text-error border-t border-stroke-weak/40">{closeErrorMessage}</div>
			)}
		</div>
	);
}
