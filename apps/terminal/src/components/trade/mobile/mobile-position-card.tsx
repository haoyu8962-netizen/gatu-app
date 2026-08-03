import { Button } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { ArrowsClockwiseIcon, CaretDownIcon, CaretUpIcon, PencilIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { LIQ_WARNING_PROXIMITY } from "@/config/trade";
import { getPerpMarginConstraint } from "@/domain/trade/isolated-margin";
import { cn } from "@/lib/cn";
import { formatLiquidationPrice, formatPercent, formatPrice, formatToken, formatUSD } from "@/lib/format";
import type { Position } from "@/lib/hyperliquid";
import type { Markets } from "@/lib/hyperliquid/markets";
import { isPositive, toBig } from "@/lib/trade/numbers";
import type { TpSlOrderInfo } from "@/lib/trade/open-orders";
import type { Side } from "@/lib/trade/types";
import { getValueColorClass } from "@/lib/ui/value-color";
import { AssetBadge } from "../components/asset-badge";
import type {
	ClosePositionData,
	IsolatedMarginPositionRef,
	LimitClosePositionData,
	TpSlPositionRef,
} from "../positions/position-dialog-types";
import { MetricCell } from "./metric-cell";

interface Props {
	position: Position;
	markets: Markets;
	markPx: string | undefined;
	tpSlInfo: TpSlOrderInfo | undefined;
	isRowClosing: boolean;
	closeErrorMessage: string | null;
	expanded?: boolean;
	onExpandedChange?: (expanded: boolean) => void;
	onClose: (data: ClosePositionData) => void;
	onReverse: (data: ClosePositionData) => void;
	onLimitClose: (data: LimitClosePositionData) => void;
	onOpenTpSl: (data: TpSlPositionRef) => void;
	onAdjustMargin: (data: IsolatedMarginPositionRef) => void;
	onSelectMarket: (coin: string, side: Side) => void;
}

export function MobilePositionCard({
	position: p,
	markets,
	markPx: markPxRaw,
	tpSlInfo,
	isRowClosing,
	closeErrorMessage,
	expanded,
	onExpandedChange,
	onClose,
	onReverse,
	onLimitClose,
	onOpenTpSl,
	onAdjustMargin,
	onSelectMarket,
}: Props) {
	const [confirming, setConfirming] = useState<"close" | "reverse" | null>(null);
	const [internalExpanded, setInternalExpanded] = useState(true);
	const detailsId = useId();
	const isExpanded = expanded ?? internalExpanded;

	const size = toBig(p.szi)?.toNumber() ?? Number.NaN;
	const isLong = size > 0;
	const absSize = Math.abs(size);
	const market = markets.getMarket(p.coin);
	const displayName = market?.pairName ?? p.coin;
	const sizeSymbol = market?.shortName ?? p.coin.split(":").pop() ?? p.coin;
	const assetId = market?.assetId;
	const szDecimals = market?.szDecimals ?? 4;
	const marginConstraint = market?.kind === "spot" ? undefined : getPerpMarginConstraint(market);
	const markPx = toBig(markPxRaw)?.toNumber() ?? Number.NaN;
	const entryPx = toBig(p.entryPx)?.toNumber() ?? Number.NaN;
	const unrealizedPnl = toBig(p.unrealizedPnl)?.toNumber() ?? Number.NaN;
	const roe = toBig(p.returnOnEquity)?.toNumber() ?? Number.NaN;
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

	function buildCloseData(): ClosePositionData | null {
		if (!canClose || typeof assetId !== "number") return null;
		return {
			assetId,
			coin: p.coin,
			size: absSize,
			markPx,
			szDecimals,
			isLong,
			unrealizedPnl,
			roe,
			marginMode: p.leverage.type,
		};
	}

	function handleConfirm() {
		const data = buildCloseData();
		if (!data) return;
		if (confirming === "reverse") onReverse(data);
		else onClose(data);
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
			roe,
			szDecimals,
			marginMode: p.leverage.type,
		});
	}

	function handleOpenTpSl() {
		if (typeof assetId !== "number") return;
		onOpenTpSl({
			coin: p.coin,
			dex: p.dex,
			assetId,
			isLong,
			szDecimals,
			marginMode: p.leverage.type,
		});
	}

	function handleAdjustMargin() {
		if (p.leverage.type !== "isolated" || typeof assetId !== "number") return;
		onAdjustMargin({
			coin: p.coin,
			dex: p.dex,
			assetId,
			isLong,
			szDecimals,
			marginConstraint,
			marginUsed: p.marginUsed,
			positionValue: p.positionValue,
			liquidationPx: p.liquidationPx,
		});
	}

	function handleToggleDetails() {
		const nextExpanded = !isExpanded;
		if (!nextExpanded) setConfirming(null);
		if (onExpandedChange) onExpandedChange(nextExpanded);
		else setInternalExpanded(nextExpanded);
	}

	const marginMetric = (
		<MetricCell
			label={
				<span className="inline-flex items-center gap-1">
					{p.leverage.type === "isolated" ? t`Margin · Iso` : t`Margin`}
					{p.leverage.type === "isolated" ? <PencilIcon className="size-2.5 text-fg-disabled" /> : null}
				</span>
			}
			value={formatUSD(p.marginUsed)}
		/>
	);

	return (
		<div className="rounded-xs border border-stroke-weak bg-surface overflow-hidden">
			<div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.05fr)_2rem] items-stretch">
				<div className="min-w-0 px-2.5 py-1.5">
					<div className="text-3xs uppercase text-fg-muted">{t`Market`}</div>
					<AssetBadge
						coin={p.coin}
						side={isLong ? "buy" : "sell"}
						onClick={() => onSelectMarket(p.coin, isLong ? "buy" : "sell")}
						aria-label={
							isLong
								? t`Switch to ${displayName} market, long position`
								: t`Switch to ${displayName} market, short position`
						}
						className="min-w-0 max-w-full overflow-hidden"
						nameClassName="min-w-0 truncate text-xs"
					/>
					<div className="mt-0.5 flex min-w-0 items-center gap-1 pl-1">
						<span className="shrink-0 text-3xs font-medium text-fg-muted">{p.leverage.value}x</span>
						{p.dex ? (
							<span className="shrink-0 rounded-xs bg-brand/10 px-1 py-0.5 text-3xs font-medium text-brand">
								{p.dex}
							</span>
						) : null}
					</div>
				</div>
				<div className="min-w-0 px-2 py-1.5">
					<div className="text-3xs uppercase text-fg-muted">{t`Size`}</div>
					<div
						className={cn("truncate text-xs font-medium tabular-nums", isLong ? "text-success" : "text-error")}
						title={formatToken(absSize, { decimals: szDecimals, symbol: sizeSymbol })}
					>
						{formatToken(absSize, { decimals: szDecimals, symbol: sizeSymbol })}
					</div>
				</div>
				<div className="min-w-0 px-2 py-1.5 text-right">
					<div className="text-3xs uppercase text-fg-muted">{t`PNL`} (ROE)</div>
					<div className={cn("truncate text-xs font-medium tabular-nums", pnlClass)}>
						{formatUSD(unrealizedPnl, { compact: false, signDisplay: "exceptZero" })}
					</div>
					<div className={cn("truncate text-3xs tabular-nums", pnlClass)}>{formatPercent(p.returnOnEquity, 1)}</div>
				</div>
				<button
					type="button"
					aria-label={isExpanded ? t`Collapse market details` : t`Expand market details`}
					aria-expanded={isExpanded}
					aria-controls={detailsId}
					onClick={handleToggleDetails}
					className="inline-flex min-h-12 items-center justify-center border-l border-stroke-weak text-fg-muted transition-colors hover:bg-fill-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stroke-focus"
				>
					{isExpanded ? <CaretUpIcon className="size-3.5" /> : <CaretDownIcon className="size-3.5" />}
				</button>
			</div>

			{isExpanded ? (
				<div id={detailsId} className="border-t border-stroke-weak">
					<div className="grid grid-cols-3 divide-x divide-stroke-weak">
						<MetricCell label={t`Position Value`} value={formatUSD(p.positionValue, { compact: false })} />
						<MetricCell label={t`Entry`} value={formatPrice(entryPx, { szDecimals, style: "decimal" })} />
						<MetricCell label={t`Mark`} value={formatPrice(markPx, { szDecimals, style: "decimal" })} />
					</div>
					<div className="grid grid-cols-3 divide-x divide-stroke-weak border-t border-stroke-weak">
						{p.leverage.type === "isolated" && typeof assetId === "number" ? (
							<button
								type="button"
								onClick={handleAdjustMargin}
								aria-label={t`Adjust isolated margin for ${displayName}`}
								className="min-w-0 cursor-pointer text-left transition-colors hover:bg-fill-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
							>
								{marginMetric}
							</button>
						) : (
							marginMetric
						)}
						<MetricCell
							label={t`Liq`}
							value={formatLiquidationPrice(p.liquidationPx, szDecimals, { style: "decimal" })}
							valueClass={liqIsNear ? "text-error" : undefined}
						/>
						<MetricCell label={t`Funding`} value={fundingValue} valueClass={fundingClass} />
					</div>
					<button
						type="button"
						onClick={handleOpenTpSl}
						disabled={typeof assetId !== "number"}
						className="flex min-h-10 w-full items-center justify-between gap-3 border-t border-stroke-weak px-2.5 text-left text-xs transition-colors hover:bg-fill-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stroke-focus disabled:cursor-not-allowed disabled:text-fg-disabled"
					>
						<span className="text-fg-muted">{t`TP/SL`}</span>
						<span className="inline-flex min-w-0 items-center gap-1 truncate tabular-nums">
							{tpSlInfo?.tpPrice ? (
								<span className="text-success">{formatPrice(tpSlInfo.tpPrice, { szDecimals })}</span>
							) : null}
							{tpSlInfo?.tpPrice && tpSlInfo?.slPrice ? <span className="text-fg-muted"> / </span> : null}
							{tpSlInfo?.slPrice ? (
								<span className="text-error">{formatPrice(tpSlInfo.slPrice, { szDecimals })}</span>
							) : null}
							{hasTpSl ? <PencilIcon className="size-3 text-fg-disabled" /> : <PlusIcon className="size-3.5" />}
						</span>
					</button>

					<div className="flex gap-1.5 border-t border-stroke-weak px-2.5 py-1.5">
						{confirming !== null ? (
							<>
								<Button
									variant="outline"
									intent="neutral"
									size="xs"
									className="flex-1 justify-center"
									onClick={() => setConfirming(null)}
								>
									{t`Cancel`}
								</Button>
								<Button
									variant="outline"
									intent={confirming === "close" ? "error" : "neutral"}
									size="xs"
									className="flex-1 justify-center"
									onClick={handleConfirm}
									disabled={!canClose || isRowClosing}
									iconLeft={isRowClosing ? <Spinner className="size-3" /> : undefined}
								>
									{confirming === "close" ? t`Confirm Close` : t`Confirm Reverse`}
								</Button>
							</>
						) : (
							<>
								<Button
									variant="outline"
									intent="neutral"
									size="xs"
									className="flex-1 justify-center touch-target"
									onClick={handleLimitClose}
									disabled={!canClose || isRowClosing}
								>
									{t`Limit`}
								</Button>
								<Button
									variant="outline"
									intent="error"
									size="xs"
									className="flex-1 justify-center touch-target"
									onClick={() => setConfirming("close")}
									disabled={!canClose || isRowClosing}
									iconLeft={<XIcon className="size-3.5" />}
								>
									{t`Close`}
								</Button>
								<Button
									variant="outline"
									intent="neutral"
									size="xs"
									className="flex-1 justify-center touch-target"
									onClick={() => setConfirming("reverse")}
									disabled={!canClose || isRowClosing}
									iconLeft={<ArrowsClockwiseIcon className="size-3.5" />}
								>
									{t`Reverse`}
								</Button>
							</>
						)}
					</div>
				</div>
			) : null}
			{closeErrorMessage && (
				<div className="px-3 py-1.5 text-xs text-error border-t border-stroke-weak">{closeErrorMessage}</div>
			)}
		</div>
	);
}
