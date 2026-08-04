import { useLingui } from "@lingui/react/macro";
import { PencilIcon, ShareIcon } from "@phosphor-icons/react";
import { type ReactNode, useId, useState } from "react";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { LIQ_WARNING_PROXIMITY } from "@/config/trade";
import { getPerpMarginConstraint } from "@/domain/trade/isolated-margin";
import { getPositionFundingPayment, isLiquidationPriceNear } from "@/domain/trade/position-toolbar";
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
import { toBig } from "@/lib/trade/numbers";
import type { TpSlOrderInfo } from "@/lib/trade/open-orders";
import type { Side } from "@/lib/trade/types";
import { getMarketCloseValueColorClass } from "@/lib/ui/value-color";
import type {
	IsolatedMarginPositionRef,
	LimitClosePositionData,
	PositionMarketCloseRef,
	PositionPnlShareData,
	PositionReverseRef,
	TpSlPositionRef,
} from "../positions/position-dialog-types";
import { createPositionPnlShareData } from "../positions/position-pnl-share-data";
import { MobileDisclosureHeader } from "./mobile-disclosure-header";

interface Props {
	position: Position;
	env: "Mainnet" | "Testnet";
	isDataStale: boolean;
	markets: Markets;
	markPx: string | undefined;
	tpSlInfo: TpSlOrderInfo | undefined;
	isRowClosing: boolean;
	expanded?: boolean;
	onExpandedChange?: (expanded: boolean) => void;
	onMarketClose: (data: PositionMarketCloseRef) => void;
	onShare: (data: PositionPnlShareData) => void;
	onReverse: (data: PositionReverseRef) => void;
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
			<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{label}</div>
			<div
				className={cn(
					"min-w-0 text-[13px] font-semibold leading-[18px] tabular-nums text-market-close-fg",
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
	env,
	isDataStale,
	markets,
	markPx: markPxRaw,
	tpSlInfo,
	isRowClosing,
	expanded,
	onExpandedChange,
	onMarketClose,
	onShare,
	onReverse,
	onLimitClose,
	onOpenTpSl,
	onAdjustMargin,
	onSelectMarket,
}: Props) {
	const { t } = useLingui();
	const [internalExpanded, setInternalExpanded] = useState(true);
	const detailsId = useId();
	const isExpanded = expanded ?? internalExpanded;

	const sizeValue = toBig(p.szi);
	const isLong = sizeValue?.gt(0) ?? false;
	const absSize = sizeValue?.abs().toString();
	const market = markets.getMarket(p.coin);
	const displayName = market?.pairName ?? p.coin;
	const sizeSymbol = market?.shortName ?? p.coin.split(":").pop() ?? p.coin;
	const quoteSymbol =
		market?.kind === "builderPerp" ? (market.quoteToken?.displayName ?? DEFAULT_QUOTE_TOKEN) : DEFAULT_QUOTE_TOKEN;
	const assetId = market?.assetId;
	const szDecimals = market?.szDecimals ?? 4;
	const marginConstraint = market?.kind === "spot" ? undefined : getPerpMarginConstraint(market);
	const markPxValue = toBig(markPxRaw);
	const liqIsNear = isLiquidationPriceNear({
		markPx: markPxRaw,
		liquidationPx: p.liquidationPx,
		proximity: LIQ_WARNING_PROXIMITY,
	});

	const fundingAmount = getPositionFundingPayment(p.cumFunding.sinceOpen);
	const fundingValue = formatUSD(fundingAmount, {
		compact: false,
		currencyDisplay: "narrowSymbol",
		signDisplay: "exceptZero",
	});
	const fundingClass =
		fundingAmount === null ? "text-market-close-subtle" : getMarketCloseValueColorClass(fundingAmount);

	const canClose = (sizeValue?.abs().gt(0) ?? false) && typeof assetId === "number" && (markPxValue?.gt(0) ?? false);
	const canReverse =
		(sizeValue?.abs().gt(0) ?? false) && typeof assetId === "number" && market !== undefined && market.kind !== "spot";
	const canShare =
		!isDataStale &&
		(sizeValue?.abs().gt(0) ?? false) &&
		(toBig(p.entryPx)?.gt(0) ?? false) &&
		(markPxValue?.gt(0) ?? false) &&
		toBig(p.unrealizedPnl) !== null &&
		toBig(p.returnOnEquity) !== null;
	const pnlClass = getMarketCloseValueColorClass(p.unrealizedPnl);
	const hasTpSl = !!(tpSlInfo?.tpPrice || tpSlInfo?.slPrice);
	const sizeDisplay = formatToken(absSize, { decimals: szDecimals, symbol: sizeSymbol });
	const positionValueDisplay = formatQuoteAmount(p.positionValue, quoteSymbol, { decimals: 2, compact: false });
	const pnlDisplay = formatUSD(p.unrealizedPnl, {
		compact: false,
		currencyDisplay: "narrowSymbol",
		signDisplay: "exceptZero",
	});
	const roeDisplay = formatPercent(p.returnOnEquity, 1);
	const marginDisplay = formatUSD(p.marginUsed, { compact: false, currencyDisplay: "narrowSymbol" });

	function buildReverseRef(): PositionReverseRef | null {
		if (!canReverse || typeof assetId !== "number") return null;
		return {
			assetId,
			coin: p.coin,
			dex: p.dex,
			signedPositionSize: p.szi,
			szDecimals,
			marginMode: p.leverage.type,
		};
	}

	function handleReverse() {
		const data = buildReverseRef();
		if (!data) return;
		onReverse(data);
	}

	function handleShare() {
		const data = createPositionPnlShareData({
			position: p,
			markPx: markPxRaw,
			env,
			symbol: displayName,
			quoteSymbol,
			szDecimals,
		});
		if (data) onShare(data);
	}

	function handleMarketClose() {
		if (!canClose || typeof assetId !== "number" || markPxRaw == null) return;
		onMarketClose({
			coin: p.coin,
			dex: p.dex,
			assetId,
			szDecimals,
			signedPositionSize: p.szi,
			markPx: markPxRaw,
			marginMode: p.leverage.type,
		});
	}

	function handleLimitClose() {
		if (!canClose || typeof assetId !== "number" || markPxRaw == null) return;
		onLimitClose({
			coin: p.coin,
			dex: p.dex,
			assetId,
			signedPositionSize: p.szi,
			entryPx: p.entryPx,
			markPx: markPxRaw,
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
	return (
		<div className="overflow-hidden rounded-[14px] border border-market-close-stroke-card bg-modal">
			<MobileDisclosureHeader
				expanded={isExpanded}
				label={isExpanded ? t`Collapse ${displayName} position details` : t`Expand ${displayName} position details`}
				controls={detailsId}
				onToggle={handleToggleDetails}
				className="grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_16px] gap-2.5 px-3.5 py-[11px]"
			>
				<div className="flex min-w-0 items-center gap-[7px]">
					<span
						aria-hidden="true"
						className={cn(
							"h-[26px] w-[3px] shrink-0 rounded-[2px]",
							isLong ? "bg-market-close-success" : "bg-market-close-danger",
						)}
					/>
					<div className="min-w-0">
						<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Market`}</div>
						<button
							type="button"
							onClick={() => onSelectMarket(p.coin, isLong ? "buy" : "sell")}
							aria-label={
								isLong
									? t`Switch to ${displayName} market, long position`
									: t`Switch to ${displayName} market, short position`
							}
							className="pointer-events-auto relative z-10 flex max-w-full min-w-0 items-baseline gap-1 rounded-xs text-left after:absolute after:top-1/2 after:left-1/2 after:h-11 after:min-w-11 after:w-full after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control"
						>
							<span className="truncate text-[13px] font-bold leading-[18px] text-market-close-fg">{sizeSymbol}</span>
							<span
								className={cn(
									"shrink-0 text-[11px] font-semibold leading-4",
									isLong ? "text-market-close-success" : "text-market-close-danger",
								)}
							>
								{isLong ? t`Long` : t`Short`} {p.leverage.value}x
							</span>
						</button>
					</div>
				</div>
				<div className="min-w-0">
					<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`Size`}</div>
					<div
						className="truncate text-xs font-semibold leading-[17px] tabular-nums text-market-close-fg"
						title={sizeDisplay}
					>
						{sizeDisplay}
					</div>
				</div>
				<div className="flex min-w-0 items-center gap-1">
					<div className="min-w-0 flex-1">
						<div className="truncate text-[10px] leading-[14px] text-market-close-subtle">{t`PNL`} (ROE %)</div>
						<div
							className={cn("truncate text-xs font-bold leading-[17px] tabular-nums", pnlClass)}
							title={`${pnlDisplay} (${roeDisplay})`}
						>
							{pnlDisplay} ({roeDisplay})
						</div>
					</div>
					<button
						type="button"
						onClick={(event) => {
							event.stopPropagation();
							handleShare();
						}}
						disabled={!canShare}
						aria-label={t`Share PNL for ${displayName}`}
						className="pointer-events-auto relative z-10 inline-flex size-[22px] shrink-0 items-center justify-center rounded-[6px] text-market-close-subtle transition-all duration-[120ms] after:absolute after:top-1/2 after:left-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control disabled:cursor-not-allowed disabled:opacity-40"
					>
						<ShareIcon aria-hidden="true" className="size-3.5" />
					</button>
				</div>
			</MobileDisclosureHeader>

			{isExpanded ? (
				<div id={detailsId} className="flex flex-col gap-3 px-3.5 py-3">
					<div className="grid min-w-0 grid-cols-3 gap-x-2.5 gap-y-3">
						<PositionMetric
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
								className="group relative min-w-0 cursor-pointer rounded-xs text-left transition-colors duration-[120ms] after:absolute after:top-1/2 after:left-1/2 after:h-11 after:min-w-11 after:w-full after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] min-[1001px]:hover:text-market-close-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control"
							>
								{marginMetric}
							</button>
						) : (
							<div className="min-w-0">{marginMetric}</div>
						)}
						<PositionMetric
							label={t({ message: "Funding", context: "Cumulative position funding" })}
							value={fundingValue}
							valueClassName={fundingClass}
							valueTitle={fundingValue}
						/>
						<PositionMetric label={t`Entry Price`} value={formatPrice(p.entryPx, { szDecimals, style: "decimal" })} />
						<PositionMetric label={t`Mark Price`} value={formatPrice(markPxRaw, { szDecimals, style: "decimal" })} />
						<PositionMetric
							label={t`Liquidation Price`}
							value={formatLiquidationPrice(p.liquidationPx, szDecimals, { style: "decimal" })}
							valueClassName={liqIsNear ? "text-error" : undefined}
						/>
						<button
							type="button"
							onClick={handleOpenTpSl}
							disabled={typeof assetId !== "number"}
							className="group relative min-w-0 rounded-xs text-left transition-colors duration-[120ms] after:absolute after:top-1/2 after:left-1/2 after:h-11 after:min-w-11 after:w-full after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] min-[1001px]:hover:text-market-close-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control disabled:cursor-not-allowed disabled:text-fg-disabled"
						>
							<PositionMetric
								label={t`TP/SL`}
								value={
									<span className="inline-flex max-w-full items-center gap-1">
										<span className={tpSlInfo?.tpPrice ? "text-market-close-success" : "text-fg-muted"}>
											{tpSlInfo?.tpPrice ? formatPrice(tpSlInfo.tpPrice, { szDecimals, style: "decimal" }) : "--"}
										</span>
										<span className="text-fg-muted">/</span>
										<span className={tpSlInfo?.slPrice ? "text-market-close-danger" : "text-fg-muted"}>
											{tpSlInfo?.slPrice ? formatPrice(tpSlInfo.slPrice, { szDecimals, style: "decimal" }) : "--"}
										</span>
										<PencilIcon className={cn("size-3 shrink-0", hasTpSl ? "text-fg-muted" : "text-fg-disabled")} />
									</span>
								}
								wrapValue
							/>
						</button>
					</div>

					<div className="flex items-center justify-between border-t border-market-close-stroke-card pt-[11px]">
						<div className="flex min-w-0 items-center gap-4">
							<button
								type="button"
								className="min-h-11 shrink-0 text-[13px] font-semibold leading-[18px] text-market-close-fg transition-colors duration-[120ms] min-[1001px]:hover:text-fg-muted focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control disabled:cursor-not-allowed disabled:text-fg-disabled"
								onClick={handleLimitClose}
								disabled={!canClose || isRowClosing}
							>
								{t`Limit Close`}
							</button>
							<button
								type="button"
								className="min-h-11 shrink-0 text-[13px] font-semibold leading-[18px] text-market-close-danger transition-colors duration-[120ms] min-[1001px]:hover:opacity-80 focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control disabled:cursor-not-allowed disabled:text-fg-disabled"
								onClick={handleMarketClose}
								disabled={!canClose || isRowClosing}
							>
								{t`Market Close`}
							</button>
							<button
								type="button"
								className="min-h-11 shrink-0 text-[13px] font-semibold leading-[18px] text-market-close-danger transition-colors duration-[120ms] min-[1001px]:hover:opacity-80 focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control disabled:cursor-not-allowed disabled:text-fg-disabled"
								onClick={handleReverse}
								disabled={!canReverse || isRowClosing}
							>
								{t`Reverse`}
							</button>
						</div>
						<button
							type="button"
							aria-label={t`Collapse ${displayName} position details`}
							aria-controls={detailsId}
							onClick={handleToggleDetails}
							className="-mr-3.5 inline-flex size-11 shrink-0 items-center justify-center rounded-xs text-market-close-subtle focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-market-close-control"
						>
							<svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
								<path
									d="M3.5 10 8 5.5l4.5 4.5"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						</button>
					</div>
				</div>
			) : null}
		</div>
	);
}
