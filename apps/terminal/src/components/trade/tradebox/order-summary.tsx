import { useLingui } from "@lingui/react/macro";
import { PencilIcon } from "@phosphor-icons/react";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { DEFAULT_BUILDER_CONFIG } from "@/config/hyperliquid";
import type { OrderType } from "@/config/trade";
import { cn } from "@/lib/cn";
import { bpsToPercentage, formatPrice, formatUSD } from "@/lib/format";
import type { MarketKind } from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { isMarketExecutionOrderType } from "@/lib/trade/order-types";
import { SummaryRow } from "../components/summary-row";

interface Props {
	liqPrice: number | null;
	liqWarning: boolean;
	orderValue: number;
	marginRequired: number;
	takerFeePercent: string;
	makerFeePercent: string;
	slippagePercent: number;
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
	takerFeePercent,
	makerFeePercent,
	slippagePercent,
	szDecimals,
	onSlippageClick,
	orderType,
	marketKind = "perp",
}: Props) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const isLeveraged = marketKind !== "spot";
	const showSlippage = isMarketExecutionOrderType(orderType);

	return (
		<div className="flex min-w-0 flex-col">
			{isLeveraged && (
				<SummaryRow label={t`Liq. Price`}>
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
			<SummaryRow label={t`Order Value`}>
				<span className={cn("whitespace-nowrap", orderValue <= 0 && "font-normal text-trading-panel-muted")}>
					{orderValue > 0 ? formatUSD(orderValue, { compact: false }) : FALLBACK_VALUE_PLACEHOLDER}
				</span>
			</SummaryRow>
			{isLeveraged && (
				<SummaryRow label={t`Margin Req.`}>
					<span className={cn("whitespace-nowrap", marginRequired <= 0 && "font-normal text-trading-panel-muted")}>
						{marginRequired > 0 ? formatUSD(marginRequired, { compact: false }) : FALLBACK_VALUE_PLACEHOLDER}
					</span>
				</SummaryRow>
			)}
			{showSlippage && (
				<SummaryRow label={t`Slippage`}>
					<button
						type="button"
						onClick={onSlippageClick}
						className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap hover:opacity-80"
					>
						<span className="tabular-nums text-trading-panel-error">{slippagePercent}%</span>
						<PencilIcon className="size-2.5 text-trading-panel-subtle" />
					</button>
				</SummaryRow>
			)}
			<SummaryRow label={t`Fees`}>
				<span
					title={`${t`Taker`} / ${t`Maker`}`}
					className="cursor-help whitespace-nowrap border-b border-dashed border-trading-panel-stroke-control font-normal text-trading-panel-muted"
				>
					{takerFeePercent} / {makerFeePercent}
				</span>
			</SummaryRow>
			{DEFAULT_BUILDER_CONFIG?.f && (
				<SummaryRow label={t`Builder Fee`}>
					<span className="whitespace-nowrap font-normal text-trading-panel-muted">{`${bpsToPercentage(DEFAULT_BUILDER_CONFIG?.f)}%`}</span>
				</SummaryRow>
			)}
		</div>
	);
}
