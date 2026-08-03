import { Button } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { CaretDownIcon, CaretUpIcon, PencilIcon } from "@phosphor-icons/react";
import { type ReactNode, useId, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { LIQ_WARNING_PROXIMITY } from "@/config/trade";
import { getPerpMarginConstraint } from "@/domain/trade/isolated-margin";
import { cn } from "@/lib/cn";
import {
	formatLiquidationPrice,
	formatPercent,
	formatPrice,
	formatQuoteAmount,
	formatToken,
	formatUSD,
} from "@/lib/format";
import type { Position } from "@/lib/hyperliquid";
import type { Markets } from "@/lib/hyperliquid/markets";
import { isPositive, toBig } from "@/lib/trade/numbers";
import type { TpSlOrderInfo } from "@/lib/trade/open-orders";
import type { Side } from "@/lib/trade/types";
import { getValueColorClass } from "@/lib/ui/value-color";
import type {
	ClosePositionData,
	IsolatedMarginPositionRef,
	LimitClosePositionData,
	TpSlPositionRef,
} from "../positions/position-dialog-types";

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

interface PositionMetricProps {
	className?: string;
	label: ReactNode;
	value: ReactNode;
	valueClassName?: string;
	valueTitle?: string;
	wrapValue?: boolean;
}

function PositionMetric({
	className,
	label,
	value,
	valueClassName,
	valueTitle,
	wrapValue = false,
}: PositionMetricProps) {
	return (
		<div className={cn("min-w-0", className)}>
			<div className="truncate text-xs leading-4 text-fg-muted">{label}</div>
			<div
				className={cn(
					"min-w-0 text-xs font-medium leading-4 tabular-nums text-fg",
					wrapValue ? "whitespace-normal" : "truncate",
					valueClassName,
				)}
				title={valueTitle}
			>
				{value}
			</div>
		</div>
	);
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
	const quoteSymbol =
		market?.kind === "builderPerp" ? (market.quoteToken?.displayName ?? DEFAULT_QUOTE_TOKEN) : DEFAULT_QUOTE_TOKEN;
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
	const fundingAmount = fundingRaw != null ? -fundingRaw : null;
	const fundingValue = formatUSD(fundingAmount, {
		compact: false,
		currencyDisplay: "narrowSymbol",
		signDisplay: "exceptZero",
	});
	const fundingClass = getValueColorClass(fundingAmount ?? 0);

	const canClose = isPositive(absSize) && typeof assetId === "number" && isPositive(markPx);
	const pnlClass = getValueColorClass(unrealizedPnl);
	const hasTpSl = !!(tpSlInfo?.tpPrice || tpSlInfo?.slPrice);
	const sizeDisplay = formatToken(absSize, { decimals: szDecimals, symbol: sizeSymbol });
	const positionValueDisplay = formatQuoteAmount(p.positionValue, quoteSymbol, { decimals: 2, compact: false });
	const pnlDisplay = formatUSD(unrealizedPnl, {
		compact: false,
		currencyDisplay: "narrowSymbol",
		signDisplay: "exceptZero",
	});
	const roeDisplay = formatPercent(p.returnOnEquity, 1);
	const marginDisplay = formatUSD(p.marginUsed, { compact: false, currencyDisplay: "narrowSymbol" });

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
		<PositionMetric
			label={t`Margin`}
			value={
				<span className="inline-flex flex-wrap items-center gap-x-1">
					<span>{marginDisplay}</span>
					<span className="font-normal text-fg-muted">({p.leverage.type === "isolated" ? t`Isolated` : t`Cross`})</span>
					{p.leverage.type === "isolated" ? <PencilIcon className="size-3 text-fg-muted" /> : null}
				</span>
			}
			valueTitle={`${marginDisplay} (${p.leverage.type === "isolated" ? t`Isolated` : t`Cross`})`}
			wrapValue
		/>
	);
	const detailsToggle = (
		<button
			type="button"
			aria-label={isExpanded ? t`Collapse market details` : t`Expand market details`}
			aria-expanded={isExpanded}
			aria-controls={detailsId}
			onClick={handleToggleDetails}
			className="-m-2 inline-flex size-8 items-center justify-center justify-self-center rounded-xs text-fg-muted transition-colors hover:bg-fill-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stroke-focus"
		>
			{isExpanded ? <CaretUpIcon className="size-3.5" /> : <CaretDownIcon className="size-3.5" />}
		</button>
	);

	return (
		<div className="overflow-hidden rounded-8 border border-stroke-weak bg-fill-weaker p-3">
			<div className="grid grid-cols-[minmax(0,1fr)_1rem] items-start gap-3">
				<div className="min-w-0">
					<div className="grid min-w-0 grid-cols-7 gap-x-3 gap-y-3">
						<div className="col-span-2 min-w-0">
							<div className="truncate text-xs leading-4 text-fg-muted">{t`Market`}</div>
							<button
								type="button"
								onClick={() => onSelectMarket(p.coin, isLong ? "buy" : "sell")}
								aria-label={
									isLong
										? t`Switch to ${displayName} market, long position`
										: t`Switch to ${displayName} market, short position`
								}
								className="flex max-w-full min-w-0 items-center gap-1 rounded-xs text-left leading-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
							>
								<span className={cn("truncate text-xs font-semibold", isLong ? "text-success" : "text-error")}>
									{sizeSymbol}
								</span>
								<span className="shrink-0 text-3xs font-medium text-fg-muted">{p.leverage.value}x</span>
								{p.dex ? (
									<span className="shrink-0 rounded-xs bg-brand/10 px-1 py-0.5 text-3xs font-medium text-brand">
										{p.dex}
									</span>
								) : null}
							</button>
						</div>
						<PositionMetric
							className="col-span-2"
							label={t`Size`}
							value={sizeDisplay}
							valueClassName={isLong ? "text-success" : "text-error"}
							valueTitle={sizeDisplay}
						/>
						<PositionMetric
							className="col-span-3"
							label={<>{t`PNL`} (ROE %)</>}
							value={
								<span className="inline-flex flex-wrap gap-x-1">
									<span>{pnlDisplay}</span>
									<span>({roeDisplay})</span>
								</span>
							}
							valueClassName={pnlClass}
							valueTitle={`${pnlDisplay} (${roeDisplay})`}
							wrapValue
						/>
					</div>
				</div>
				{!isExpanded ? detailsToggle : null}
			</div>

			{isExpanded ? (
				<>
					<div id={detailsId} className="mt-3 grid min-w-0 grid-cols-7 gap-x-3 gap-y-3">
						<PositionMetric
							className="col-span-2"
							label={t`Entry Price`}
							value={formatPrice(entryPx, { szDecimals, style: "decimal" })}
						/>
						<PositionMetric
							className="col-span-2"
							label={t`Mark Price`}
							value={formatPrice(markPx, { szDecimals, style: "decimal" })}
						/>
						<PositionMetric
							className="col-span-3"
							label={t`Liquidation Price`}
							value={formatLiquidationPrice(p.liquidationPx, szDecimals, { style: "decimal" })}
							valueClassName={liqIsNear ? "text-error" : undefined}
						/>
						<PositionMetric
							className="col-span-2"
							label={t`Position Value`}
							value={positionValueDisplay}
							valueTitle={positionValueDisplay}
							wrapValue
						/>
						{p.leverage.type === "isolated" && typeof assetId === "number" ? (
							<button
								type="button"
								onClick={handleAdjustMargin}
								aria-label={t`Adjust isolated margin for ${displayName}`}
								className="group col-span-2 min-w-0 cursor-pointer rounded-xs text-left transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
							>
								{marginMetric}
							</button>
						) : (
							<div className="col-span-2 min-w-0">{marginMetric}</div>
						)}
						<button
							type="button"
							onClick={handleOpenTpSl}
							disabled={typeof assetId !== "number"}
							className="group col-span-3 min-w-0 rounded-xs text-left transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus disabled:cursor-not-allowed disabled:text-fg-disabled"
						>
							<PositionMetric
								label={t`TP/SL`}
								value={
									<span className="inline-flex max-w-full items-center gap-1">
										<span className={tpSlInfo?.tpPrice ? "text-success" : "text-fg-muted"}>
											{tpSlInfo?.tpPrice ? formatPrice(tpSlInfo.tpPrice, { szDecimals, style: "decimal" }) : "--"}
										</span>
										<span className="text-fg-muted">/</span>
										<span className={tpSlInfo?.slPrice ? "text-error" : "text-fg-muted"}>
											{tpSlInfo?.slPrice ? formatPrice(tpSlInfo.slPrice, { szDecimals, style: "decimal" }) : "--"}
										</span>
										<PencilIcon className={cn("size-3 shrink-0", hasTpSl ? "text-fg-muted" : "text-fg-disabled")} />
									</span>
								}
								wrapValue
							/>
						</button>
						<PositionMetric
							className="col-span-2"
							label={t({ message: "Funding", context: "Cumulative position funding" })}
							value={fundingValue}
							valueClassName={fundingClass}
							valueTitle={fundingValue}
						/>
					</div>

					<div className="mt-3 grid grid-cols-[minmax(0,1fr)_1rem] items-center gap-3 border-t border-stroke-weak pt-2">
						<div className="flex min-w-0 items-center gap-1">
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
										variant="ghost"
										intent="brand"
										size="xxs"
										className="min-h-8 flex-none justify-center px-1 touch-target"
										onClick={handleLimitClose}
										disabled={!canClose || isRowClosing}
									>
										{t`Limit Close`}
									</Button>
									<Button
										variant="ghost"
										intent="brand"
										size="xxs"
										className="min-h-8 flex-none justify-center px-1 touch-target"
										onClick={() => setConfirming("close")}
										disabled={!canClose || isRowClosing}
									>
										{isRowClosing ? t`Closing...` : t`Market Close`}
									</Button>
									<Button
										variant="ghost"
										intent="brand"
										size="xxs"
										className="min-h-8 flex-none justify-center px-1 touch-target"
										onClick={() => setConfirming("reverse")}
										disabled={!canClose || isRowClosing}
									>
										{t`Reverse`}
									</Button>
								</>
							)}
						</div>
						{detailsToggle}
					</div>
				</>
			) : null}
			{closeErrorMessage ? <div className="mt-2 text-xs text-error">{closeErrorMessage}</div> : null}
		</div>
	);
}
