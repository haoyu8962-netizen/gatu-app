import { TableCell, TableRow, Tooltip } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { PencilIcon, PlusIcon } from "@phosphor-icons/react";
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
import { AssetBadge } from "../components/asset-badge";
import { PositionActionsDropdown } from "./position-actions-dropdown";
import type {
	ClosePositionData,
	IsolatedMarginPositionRef,
	LimitClosePositionData,
	PositionMarketCloseRef,
	TpSlPositionRef,
} from "./position-dialog-types";
import { positionTableCellClass } from "./position-table-styles";
import { positionsPanelRowHoverClass, positionsPanelRowStripeClass } from "./positions-panel-table-styles";

interface Props {
	position: Position;
	markets: Markets;
	markPx: string | undefined;
	tpSlInfo: TpSlOrderInfo | undefined;
	isRowClosing: boolean;
	isEven: boolean;
	onMarketClose: (data: PositionMarketCloseRef) => void;
	onLimitClose: (data: LimitClosePositionData) => void;
	onReverse: (data: ClosePositionData) => void;
	onOpenTpSl: (data: TpSlPositionRef) => void;
	onAdjustMargin: (data: IsolatedMarginPositionRef) => void;
	onSelectMarket: (coin: string, side: Side) => void;
}

export function PositionRow({
	position: p,
	markets,
	markPx: markPxRaw,
	tpSlInfo,
	isRowClosing,
	isEven,
	onMarketClose,
	onLimitClose,
	onReverse,
	onOpenTpSl,
	onAdjustMargin,
	onSelectMarket,
}: Props) {
	const size = toBig(p.szi)?.toNumber() ?? Number.NaN;
	const isLong = size > 0;
	const absSize = Math.abs(size);
	const market = markets.getMarket(p.coin);
	const assetId = market?.assetId;
	const szDecimals = market?.szDecimals ?? 4;
	const markPx = toBig(markPxRaw)?.toNumber() ?? Number.NaN;
	const displayName = market?.pairName ?? p.coin;
	const sizeSymbol = market?.shortName ?? p.coin.split(":").pop() ?? p.coin;
	const marginConstraint = market?.kind === "spot" ? undefined : getPerpMarginConstraint(market);
	const quoteSymbol =
		market?.kind === "builderPerp" ? (market.quoteToken?.displayName ?? DEFAULT_QUOTE_TOKEN) : DEFAULT_QUOTE_TOKEN;

	const liqPx = toBig(p.liquidationPx)?.toNumber();
	const liqIsNear =
		liqPx != null &&
		Number.isFinite(markPx) &&
		Number.isFinite(liqPx) &&
		Math.abs(liqPx - markPx) / markPx <= LIQ_WARNING_PROXIMITY;

	const entryPx = toBig(p.entryPx)?.toNumber() ?? Number.NaN;
	const unrealizedPnl = toBig(p.unrealizedPnl)?.toNumber() ?? Number.NaN;
	const roe = toBig(p.returnOnEquity)?.toNumber() ?? Number.NaN;
	const cumFunding = toBig(p.cumFunding.sinceOpen)?.toNumber() ?? Number.NaN;
	const canClose = isPositive(absSize) && typeof assetId === "number" && isPositive(markPx);

	const pnlClass = getValueColorClass(unrealizedPnl);
	const fundingClass = getValueColorClass(cumFunding ? -cumFunding : null);
	const hasTpSl = !!(tpSlInfo?.tpPrice || tpSlInfo?.slPrice);
	const sideClass = isLong ? "text-success" : "text-error";
	const sizeDisplay = formatToken(absSize, { decimals: szDecimals, symbol: sizeSymbol });
	const positionValueDisplay = formatQuoteAmount(p.positionValue, quoteSymbol, { decimals: 2, compact: false });
	const entryPriceDisplay = formatPrice(p.entryPx, { szDecimals, style: "decimal" });
	const markPriceDisplay = formatPrice(markPx, { szDecimals, style: "decimal" });
	const pnlDisplay = formatUSD(unrealizedPnl, {
		compact: false,
		currencyDisplay: "narrowSymbol",
		signDisplay: "exceptZero",
	});
	const roeDisplay = formatPercent(p.returnOnEquity, 1);
	const liquidationPriceDisplay = formatLiquidationPrice(p.liquidationPx, szDecimals, { style: "decimal" });
	const marginDisplay = formatUSD(p.marginUsed, { compact: false, currencyDisplay: "narrowSymbol" });
	const fundingDisplay = formatUSD(cumFunding ? -cumFunding : null, {
		compact: false,
		currencyDisplay: "narrowSymbol",
		signDisplay: "exceptZero",
	});

	function renderTpSlContent() {
		if (tpSlInfo?.tpPrice && tpSlInfo?.slPrice) {
			return (
				<>
					<div className="flex items-center gap-1 text-2xs tabular-nums">
						<span className="text-success/70">{formatPrice(tpSlInfo.tpPrice, { szDecimals, style: "decimal" })}</span>
						<span className="text-fg-muted">/</span>
						<span className="text-error/70">{formatPrice(tpSlInfo.slPrice, { szDecimals, style: "decimal" })}</span>
					</div>
					<PencilIcon className="size-3 text-fg-muted group-hover:text-fg transition-colors" />
				</>
			);
		}
		if (hasTpSl) {
			return (
				<>
					<div className="flex items-center gap-1 text-2xs tabular-nums">
						{tpSlInfo?.tpPrice ? (
							<span className="text-success/70">{formatPrice(tpSlInfo.tpPrice, { szDecimals, style: "decimal" })}</span>
						) : (
							<span className="text-error/70">{formatPrice(tpSlInfo?.slPrice, { szDecimals, style: "decimal" })}</span>
						)}
					</div>
					<PlusIcon className="size-3 text-fg-muted group-hover:text-fg transition-colors" />
				</>
			);
		}
		return (
			<div className="flex items-center gap-0.5 text-2xs font-medium text-fg-muted group-hover:text-fg transition-colors">
				<PlusIcon className="size-3" />
				<span>{t`Add`}</span>
			</div>
		);
	}

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

	function handleReverse() {
		const data = buildCloseData();
		if (data) onReverse(data);
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
		<span className="inline-flex items-center justify-start gap-1 whitespace-nowrap tabular-nums" title={marginDisplay}>
			<span className="font-medium text-fg">{marginDisplay}</span>
			<span className="text-2xs text-fg-muted">({p.leverage.type === "isolated" ? t`Isolated` : t`Cross`})</span>
			{p.leverage.type === "isolated" ? (
				<PencilIcon className="size-2.5 text-fg-disabled transition-colors group-hover:text-fg-muted" />
			) : null}
		</span>
	);

	return (
		<TableRow className={cn(positionsPanelRowHoverClass, isEven && positionsPanelRowStripeClass)}>
			<TableCell size="dense" className={cn(positionTableCellClass, "pl-3 text-fg")}>
				<div className="flex items-center gap-1 whitespace-nowrap">
					<AssetBadge
						coin={p.coin}
						side={isLong ? "buy" : "sell"}
						fit
						onClick={() => onSelectMarket(p.coin, isLong ? "buy" : "sell")}
						aria-label={
							isLong
								? t`Switch to ${displayName} market, long position`
								: t`Switch to ${displayName} market, short position`
						}
					/>
					<span className="shrink-0 text-2xs font-medium text-fg-muted">{p.leverage.value}x</span>
					{p.dex ? (
						<span className="shrink-0 rounded-xs bg-brand/10 px-1 py-0.5 text-3xs font-medium text-brand">{p.dex}</span>
					) : null}
				</div>
			</TableCell>
			<TableCell size="dense" className={cn(positionTableCellClass, "tabular-nums text-fg")}>
				<span className={cn("block font-medium", sideClass)} title={sizeDisplay}>
					{sizeDisplay}
				</span>
			</TableCell>
			<TableCell size="dense" className={cn(positionTableCellClass, "tabular-nums text-fg")}>
				<span className="block font-medium" title={positionValueDisplay}>
					{positionValueDisplay}
				</span>
			</TableCell>
			<TableCell size="dense" className={cn(positionTableCellClass, "tabular-nums text-fg-muted")}>
				<span className="block" title={entryPriceDisplay}>
					{entryPriceDisplay}
				</span>
			</TableCell>
			<TableCell size="dense" className={cn(positionTableCellClass, "tabular-nums text-fg")}>
				<span className="block font-medium" title={markPriceDisplay}>
					{markPriceDisplay}
				</span>
			</TableCell>
			<TableCell size="dense" className={cn(positionTableCellClass, pnlClass)}>
				<span className="block tabular-nums" title={`${pnlDisplay} (${roeDisplay})`}>
					<span className="font-medium">{pnlDisplay}</span>
					<span className="ml-1 text-2xs opacity-90">({roeDisplay})</span>
				</span>
			</TableCell>
			<TableCell
				size="dense"
				className={cn(positionTableCellClass, "tabular-nums", liqIsNear ? "font-medium text-error" : "text-fg-muted")}
			>
				<span className="block" title={liquidationPriceDisplay}>
					{liquidationPriceDisplay}
				</span>
			</TableCell>
			<TableCell size="dense" className={cn(positionTableCellClass, "text-fg")}>
				{p.leverage.type === "isolated" && typeof assetId === "number" ? (
					<Tooltip content={t`Adjust isolated margin`} side="top">
						<button
							type="button"
							onClick={handleAdjustMargin}
							aria-label={t`Adjust isolated margin for ${displayName}`}
							className="group inline-flex min-h-6 cursor-pointer items-center justify-start rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
						>
							{marginContent}
						</button>
					</Tooltip>
				) : (
					marginContent
				)}
			</TableCell>
			<TableCell size="dense" className={cn(positionTableCellClass, "tabular-nums", fundingClass)}>
				<span className="block font-medium tabular-nums" title={fundingDisplay}>
					{fundingDisplay}
				</span>
			</TableCell>
			<TableCell size="dense" className={positionTableCellClass}>
				<PositionActionsDropdown
					canClose={canClose}
					isRowClosing={isRowClosing}
					onMarketClose={handleMarketClose}
					onLimitClose={handleLimitClose}
					onReverse={handleReverse}
				/>
			</TableCell>
			<TableCell size="dense" className={positionTableCellClass}>
				<Tooltip content={tpSlInfo?.tpPrice && tpSlInfo?.slPrice ? t`Edit TP/SL` : t`Add TP/SL`} side="left">
					<button
						type="button"
						onClick={handleOpenTpSl}
						disabled={typeof assetId !== "number"}
						className={cn(
							"group inline-flex min-h-6 items-center gap-1.5 cursor-pointer rounded-xs transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus disabled:cursor-not-allowed disabled:opacity-50",
							!hasTpSl && "text-fg-disabled hover:text-fg-muted",
						)}
					>
						{renderTpSlContent()}
					</button>
				</Tooltip>
			</TableCell>
		</TableRow>
	);
}
