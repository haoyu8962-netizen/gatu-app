import { useLingui } from "@lingui/react/macro";
import { ShareIcon } from "@phosphor-icons/react";
import { TableCell, TableRow, Tooltip } from "@sairn/ui";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { LIQ_WARNING_PROXIMITY } from "@/config/trade";
import { getPerpMarginConstraint } from "@/domain/trade/isolated-margin";
import type { MarkPriceStatus } from "@/domain/trade/market-price";
import { getPositionFundingPayment, isLiquidationPriceNear } from "@/domain/trade/position-toolbar";
import { getToolbarPositionChangeRatio } from "@/domain/trade/trading-toolbar-metrics";
import { cn } from "@/lib/cn";
import { useNumberFormat } from "@/lib/format";
import type { Position } from "@/lib/hyperliquid";
import type { Markets } from "@/lib/hyperliquid/markets";
import { toBig } from "@/lib/trade/numbers";
import type { TpSlOrderInfo } from "@/lib/trade/open-orders";
import type { Side } from "@/lib/trade/types";
import { getValueColorClass } from "@/lib/ui/value-color";
import { AssetBadge } from "../components/asset-badge";
import type {
	IsolatedMarginPositionRef,
	LimitClosePositionData,
	PositionMarketCloseRef,
	PositionPnlShareData,
	PositionReverseRef,
	TpSlPositionRef,
} from "./position-dialog-types";
import { PositionInlineActions } from "./position-inline-actions";
import { createPositionPnlShareData } from "./position-pnl-share-data";
import { positionTableCellClass } from "./position-table-styles";
import { positionsPanelRowHoverClass, positionsPanelRowStripeClass } from "./positions-panel-table-styles";

export type PositionPnlMode = "roe" | "priceChange";

interface Props {
	position: Position;
	env: "Mainnet" | "Testnet";
	isDataStale: boolean;
	markets: Markets;
	markPx: string | undefined;
	markPriceStatus: MarkPriceStatus;
	tpSlInfo: TpSlOrderInfo | undefined;
	isRowClosing: boolean;
	isEven: boolean;
	pnlMode: PositionPnlMode;
	onMarketClose: (data: PositionMarketCloseRef) => void;
	onLimitClose: (data: LimitClosePositionData) => void;
	onShare: (data: PositionPnlShareData) => void;
	onReverse: (data: PositionReverseRef) => void;
	reverseBlocked: boolean;
	onOpenTpSl: (data: TpSlPositionRef) => void;
	onAdjustMargin: (data: IsolatedMarginPositionRef) => void;
	onSelectMarket: (coin: string, side: Side) => void;
}

export function PositionRow({
	position: p,
	env,
	isDataStale,
	markets,
	markPx: markPxRaw,
	markPriceStatus,
	tpSlInfo,
	isRowClosing,
	isEven,
	pnlMode,
	onMarketClose,
	onLimitClose,
	onShare,
	onReverse,
	reverseBlocked,
	onOpenTpSl,
	onAdjustMargin,
	onSelectMarket,
}: Props) {
	const { formatLiquidationPrice, formatPercent, formatPrice, formatQuoteAmount, formatToken, formatUSD } =
		useNumberFormat();
	const { t } = useLingui();
	const sizeValue = toBig(p.szi);
	const isLong = sizeValue?.gt(0) ?? false;
	const absSize = sizeValue?.abs().toString();
	const market = markets.getMarket(p.coin);
	const assetId = market?.assetId;
	const szDecimals = market?.szDecimals ?? 4;
	const markPxValue = toBig(markPxRaw);
	const displayName = market?.pairName ?? p.coin;
	const sizeSymbol = market?.shortName ?? p.coin.split(":").pop() ?? p.coin;
	const marginConstraint = market?.kind === "spot" ? undefined : getPerpMarginConstraint(market);
	const quoteSymbol =
		market?.kind === "builderPerp" ? (market.quoteToken?.displayName ?? DEFAULT_QUOTE_TOKEN) : DEFAULT_QUOTE_TOKEN;

	const hasFreshMark = markPriceStatus === "success";
	const liqIsNear =
		!isDataStale &&
		hasFreshMark &&
		isLiquidationPriceNear({
			markPx: markPxRaw,
			liquidationPx: p.liquidationPx,
			proximity: LIQ_WARNING_PROXIMITY,
		});

	const fundingPayment = getPositionFundingPayment(p.cumFunding.sinceOpen);
	const canManage = typeof assetId === "number";
	const canClose = (sizeValue?.abs().gt(0) ?? false) && typeof assetId === "number";
	const canReverse =
		!reverseBlocked &&
		(sizeValue?.abs().gt(0) ?? false) &&
		typeof assetId === "number" &&
		market !== undefined &&
		market.kind !== "spot";
	const canShare =
		!isDataStale &&
		hasFreshMark &&
		(sizeValue?.abs().gt(0) ?? false) &&
		(toBig(p.entryPx)?.gt(0) ?? false) &&
		(markPxValue?.gt(0) ?? false) &&
		toBig(p.unrealizedPnl) !== null &&
		toBig(p.returnOnEquity) !== null;

	const pnlClass = isDataStale ? "text-market-close-subtle" : getValueColorClass(p.unrealizedPnl);
	const fundingClass = isDataStale || fundingPayment === null ? "text-fg-muted" : getValueColorClass(fundingPayment);
	const hasTpSl = !!(tpSlInfo?.tpPrice || tpSlInfo?.slPrice);
	const sideClass = isLong ? "text-market-close-success" : "text-market-close-danger";
	const directionLabel = isLong ? t`Long` : t`Short`;
	const sizeDisplay = formatToken(absSize, { decimals: szDecimals, symbol: sizeSymbol });
	const positionValueDisplay = formatQuoteAmount(p.positionValue, quoteSymbol, { decimals: 2, compact: false });
	const entryPriceDisplay = formatPrice(p.entryPx, { szDecimals, style: "decimal" });
	const markPriceDisplay = formatPrice(hasFreshMark ? markPxRaw : undefined, { szDecimals, style: "decimal" });
	const pnlDisplay = formatUSD(p.unrealizedPnl, {
		compact: false,
		currencyDisplay: "narrowSymbol",
		signDisplay: "exceptZero",
	});
	const roeDisplay = formatPercent(p.returnOnEquity, 1);
	const priceChangeRatio = getToolbarPositionChangeRatio({
		unrealizedPnl: p.unrealizedPnl,
		szi: p.szi,
		entryPx: p.entryPx,
	});
	const pnlPercentDisplay = pnlMode === "roe" ? roeDisplay : formatPercent(priceChangeRatio, 1);
	const liquidationPriceDisplay = formatLiquidationPrice(p.liquidationPx, szDecimals, { style: "decimal" });
	const marginDisplay = formatUSD(p.marginUsed, { compact: false, currencyDisplay: "narrowSymbol" });
	const fundingDisplay = formatUSD(fundingPayment, {
		compact: false,
		currencyDisplay: "narrowSymbol",
		signDisplay: "exceptZero",
	});
	function renderTpSlContent() {
		if (hasTpSl) {
			return (
				<span className="flex flex-col items-end gap-px text-xs leading-4 tabular-nums">
					<span>
						<span className="me-1 text-[10px] text-market-close-subtle">TP</span>
						<span className={tpSlInfo?.tpPrice ? "font-semibold text-market-close-success" : "text-fg-disabled"}>
							{tpSlInfo?.tpPrice ? formatPrice(tpSlInfo.tpPrice, { szDecimals, style: "decimal" }) : "—"}
						</span>
					</span>
					<span>
						<span className="me-1 text-[10px] text-market-close-subtle">SL</span>
						<span className={tpSlInfo?.slPrice ? "font-semibold text-market-close-danger" : "text-fg-disabled"}>
							{tpSlInfo?.slPrice ? formatPrice(tpSlInfo.slPrice, { szDecimals, style: "decimal" }) : "—"}
						</span>
					</span>
				</span>
			);
		}
		return (
			<span className="rounded-[6px] border border-dashed border-market-close-stroke-control px-2 py-0.5 text-xs font-medium text-market-close-subtle transition-all duration-[120ms] group-hover:border-market-close-control group-hover:text-market-close-fg">
				+ {t`Add`}
			</span>
		);
	}

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

	function handleMarketClose() {
		if (!canClose || typeof assetId !== "number") return;
		onMarketClose({
			coin: p.coin,
			dex: p.dex,
			assetId,
			szDecimals,
			signedPositionSize: p.szi,
			...(markPxValue?.gt(0) && markPxRaw ? { markPx: markPxRaw } : null),
			marginMode: p.leverage.type,
		});
	}

	function handleLimitClose() {
		if (!canClose || typeof assetId !== "number") return;
		onLimitClose({
			coin: p.coin,
			dex: p.dex,
			assetId,
			signedPositionSize: p.szi,
			entryPx: p.entryPx,
			...(markPxValue?.gt(0) && markPxRaw ? { markPx: markPxRaw } : null),
			szDecimals,
			marginMode: p.leverage.type,
		});
	}

	function handleReverse() {
		const data = buildReverseRef();
		if (data) onReverse(data);
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

	const marginContent = (
		<span className="inline-flex flex-col items-end gap-px whitespace-nowrap tabular-nums">
			<span className="text-[13px] font-semibold text-market-close-fg">{marginDisplay}</span>
			<span
				className={cn(
					"rounded-[4px] px-1.5 text-3xs leading-[14px] font-semibold text-market-close-subtle",
					p.leverage.type === "isolated"
						? "bg-fill-weak"
						: "border border-market-close-stroke-card bg-transparent leading-3",
				)}
			>
				{p.leverage.type === "isolated" ? t`Isolated` : t`Cross`}
			</span>
		</span>
	);

	return (
		<TableRow className={cn(positionsPanelRowHoverClass, isEven && positionsPanelRowStripeClass)}>
			<TableCell size="dense" className={cn(positionTableCellClass, "ps-5 text-start text-market-close-fg")}>
				<div className="flex items-center gap-2 whitespace-nowrap">
					<span
						className={cn(
							"h-7 w-[3px] shrink-0 rounded-[2px]",
							isLong ? "bg-market-close-success" : "bg-market-close-danger",
						)}
						aria-hidden="true"
					/>
					<AssetBadge
						coin={p.coin}
						subtitle={
							<span className={sideClass}>
								{directionLabel} · {p.leverage.value}x
							</span>
						}
						fit
						onClick={() => onSelectMarket(p.coin, isLong ? "buy" : "sell")}
						className="border-0 bg-transparent p-0 hover:bg-transparent active:bg-transparent"
						nameClassName="text-2sm leading-4 font-bold text-market-close-fg"
						subtitleClassName="text-2xs leading-[14px] font-semibold"
						aria-label={
							isLong
								? t`Switch to ${displayName} market, long position`
								: t`Switch to ${displayName} market, short position`
						}
					/>
					{p.dex ? (
						<span className="shrink-0 rounded-[4px] bg-fill-weak px-1 py-0.5 text-3xs leading-3 font-semibold text-market-close-muted">
							{p.dex}
						</span>
					) : null}
				</div>
			</TableCell>
			<TableCell size="dense" className={cn(positionTableCellClass, "tabular-nums")}>
				<span className={cn("block text-[13px] font-semibold", sideClass)} title={sizeDisplay}>
					{sizeDisplay}
				</span>
			</TableCell>
			<TableCell size="dense" className={cn(positionTableCellClass, "tabular-nums")}>
				<span className="block text-[13px] text-market-close-fg" title={positionValueDisplay}>
					{positionValueDisplay}
				</span>
			</TableCell>
			<TableCell size="dense" className={cn(positionTableCellClass, "tabular-nums")}>
				<span className="block text-[13px] text-market-close-fg" title={entryPriceDisplay}>
					{entryPriceDisplay}
				</span>
			</TableCell>
			<TableCell size="dense" className={cn(positionTableCellClass, "tabular-nums")}>
				<span
					className="inline-flex items-center justify-end gap-1 text-[13px] text-market-close-fg"
					title={markPriceDisplay}
				>
					{markPriceDisplay}
				</span>
			</TableCell>
			<TableCell size="dense" className={cn(positionTableCellClass, pnlClass)}>
				<div className="flex min-w-0 items-center justify-end gap-1">
					<span className="flex flex-col items-end gap-px tabular-nums" title={`${pnlDisplay} (${pnlPercentDisplay})`}>
						<span className="text-[13px] font-bold">{pnlDisplay}</span>
						<span className="text-2xs leading-[14px] font-semibold opacity-75">{pnlPercentDisplay}</span>
					</span>
					<Tooltip content={t`Share PNL`} side="top">
						<button
							type="button"
							onClick={handleShare}
							disabled={!canShare}
							aria-label={t`Share PNL for ${displayName}`}
							className="relative inline-flex size-[22px] shrink-0 items-center justify-center rounded-[6px] text-market-close-subtle transition-all duration-[120ms] after:absolute after:top-1/2 after:left-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] hover:bg-market-close-hover hover:text-market-close-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-focus disabled:cursor-not-allowed disabled:opacity-40"
						>
							<ShareIcon aria-hidden="true" className="size-3.5" />
						</button>
					</Tooltip>
				</div>
			</TableCell>
			<TableCell
				size="dense"
				className={cn(
					positionTableCellClass,
					"tabular-nums",
					liqIsNear ? "font-bold text-market-close-danger" : "text-market-close-subtle",
				)}
			>
				<span className="block text-[13px]" title={liquidationPriceDisplay}>
					{liquidationPriceDisplay}
				</span>
			</TableCell>
			<TableCell size="dense" className={positionTableCellClass}>
				<Tooltip content={hasTpSl ? t`Edit TP/SL` : t`Add TP/SL`} side="left">
					<button
						type="button"
						onClick={handleOpenTpSl}
						disabled={!canManage || isRowClosing}
						aria-label={hasTpSl ? t`Edit TP/SL` : t`Add TP/SL`}
						className={cn(
							"group inline-flex min-h-[26px] items-center justify-end rounded-[6px] transition-all duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-focus disabled:cursor-not-allowed disabled:opacity-50",
							!hasTpSl && "text-fg-disabled hover:text-fg-muted",
						)}
					>
						{renderTpSlContent()}
					</button>
				</Tooltip>
			</TableCell>
			<TableCell size="dense" className={cn(positionTableCellClass, "text-market-close-fg")}>
				{p.leverage.type === "isolated" ? (
					<Tooltip content={t`Adjust Margin`} side="left">
						<button
							type="button"
							onClick={handleAdjustMargin}
							disabled={!canManage || isRowClosing}
							aria-label={t`Adjust Margin`}
							className="inline-flex min-h-[30px] items-center justify-end rounded-[6px] transition-colors duration-[120ms] hover:bg-market-close-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-focus disabled:cursor-not-allowed disabled:opacity-50"
						>
							{marginContent}
						</button>
					</Tooltip>
				) : (
					marginContent
				)}
			</TableCell>
			<TableCell size="dense" className={cn(positionTableCellClass, "tabular-nums", fundingClass)}>
				<span className="block text-xs font-medium tabular-nums" title={fundingDisplay}>
					{fundingDisplay}
				</span>
			</TableCell>
			<TableCell size="dense" className={cn(positionTableCellClass, "pe-5")}>
				<PositionInlineActions
					canClose={canClose}
					canReverse={canReverse}
					isRowClosing={isRowClosing}
					onMarketClose={handleMarketClose}
					onLimitClose={handleLimitClose}
					onReverse={handleReverse}
				/>
			</TableCell>
		</TableRow>
	);
}
