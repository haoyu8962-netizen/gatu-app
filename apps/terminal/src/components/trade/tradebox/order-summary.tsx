import { useLingui } from "@lingui/react/macro";
import { PencilIcon } from "@phosphor-icons/react";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import type { OrderType } from "@/config/trade";
import { TRADE_PANEL_LABELS } from "@/config/trade-panel-labels";
import type { MarketSlippageEstimate } from "@/domain/trade/order/slippage";
import type { OrderFeeQuote } from "@/domain/trade/order-fee-quote";
import { cn } from "@/lib/cn";
import { formatPrice, formatSlippageBps, formatUSD } from "@/lib/format";
import type { MarketKind } from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { OrderFeeRatePairValue } from "../components/order-fee-summary-value";
import { SummaryRow } from "../components/summary-row-view";

interface Props {
	compact?: boolean;
	liqPrice: number | null;
	liqWarning: boolean;
	orderValue: number;
	marginRequired: number | null;
	takerFeeQuote: OrderFeeQuote;
	makerFeeQuote: OrderFeeQuote;
	slippagePercent: number;
	estimatedSlippage?: MarketSlippageEstimate | null;
	szDecimals: number | undefined;
	onSlippageClick: () => void;
	orderType: OrderType;
	marketKind?: MarketKind;
}

export function OrderSummary({
	liqPrice,
	liqWarning,
	orderValue,
	marginRequired,
	takerFeeQuote,
	makerFeeQuote,
	slippagePercent,
	estimatedSlippage,
	szDecimals,
	onSlippageClick,
	orderType,
	marketKind = "perp",
	compact,
}: Props) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const isLeveraged = marketKind !== "spot";
	const showSlippage = orderType === "market";
	const estimatedSlippageText = formatSlippageBps(estimatedSlippage?.slippageBps, {
		lowerBound: estimatedSlippage?.exceedsVisibleDepth,
	});

	return (
		<div className="flex min-w-0 flex-col">
			{isLeveraged && (
				<SummaryRow compact={compact} label={t(TRADE_PANEL_LABELS.liqPrice)}>
					<span
						className={cn(
							"whitespace-nowrap",
							liqPrice ? liqWarning && "text-trading-panel-error" : "font-normal text-trading-panel-muted",
						)}
					>
						{liqPrice ? formatPrice(liqPrice, { szDecimals }) : FALLBACK_VALUE_PLACEHOLDER}
					</span>
				</SummaryRow>
			)}
			<SummaryRow compact={compact} label={t(TRADE_PANEL_LABELS.orderValue)}>
				<span className={cn("whitespace-nowrap", orderValue <= 0 && "font-normal text-trading-panel-muted")}>
					{orderValue > 0 ? formatUSD(orderValue, { compact: false }) : FALLBACK_VALUE_PLACEHOLDER}
				</span>
			</SummaryRow>
			{isLeveraged && (
				<SummaryRow compact={compact} label={t(TRADE_PANEL_LABELS.marginRequired)}>
					<span
						className={cn(
							"whitespace-nowrap",
							(marginRequired === null || marginRequired <= 0) && "font-normal text-trading-panel-muted",
						)}
					>
						{marginRequired !== null && marginRequired > 0
							? formatUSD(marginRequired, { compact: false })
							: FALLBACK_VALUE_PLACEHOLDER}
					</span>
				</SummaryRow>
			)}
			{showSlippage && (
				<>
					<SummaryRow compact={compact} label={t(TRADE_PANEL_LABELS.estimatedSlippage)}>
						<span className={cn("whitespace-nowrap", !estimatedSlippageText && "font-normal text-trading-panel-muted")}>
							{estimatedSlippageText ?? FALLBACK_VALUE_PLACEHOLDER}
						</span>
					</SummaryRow>
					<SummaryRow compact={compact} label={t(TRADE_PANEL_LABELS.slippage)}>
						<button
							type="button"
							onClick={onSlippageClick}
							className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap hover:opacity-80 active:opacity-60"
						>
							<span className="tabular-nums text-trading-panel-error">{slippagePercent}%</span>
							<PencilIcon className="size-2.5 text-trading-panel-subtle" />
						</button>
					</SummaryRow>
				</>
			)}
			<SummaryRow compact={compact} label={t(TRADE_PANEL_LABELS.fees)}>
				<span
					title={`${t(TRADE_PANEL_LABELS.taker)} / ${t(TRADE_PANEL_LABELS.maker)}`}
					className="cursor-help whitespace-nowrap border-b border-dashed border-trading-panel-stroke-control font-normal text-trading-panel-muted"
				>
					<OrderFeeRatePairValue takerQuote={takerFeeQuote} makerQuote={makerFeeQuote} />
				</span>
			</SummaryRow>
		</div>
	);
}
