import { useLingui } from "@lingui/react/macro";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import type { OrderFeeQuote } from "@/domain/trade/order-fee-quote";
import { getTwapRuntimeMinutes, getTwapSuborderSize } from "@/domain/trade/twap-details";
import { cn } from "@/lib/cn";
import { formatDuration, useNumberFormat } from "@/lib/format";
import type { MarketKind } from "@/lib/hyperliquid";
import { isPositive } from "@/lib/trade/numbers";
import { getTwapStopPriceLabel } from "@/lib/trade/twap-labels";
import type { Side } from "@/lib/trade/types";
import { OrderFeeSummaryValue } from "../components/order-fee-summary-value";
import { SummaryRow } from "../components/summary-row-view";

interface Props {
	compact?: boolean;
	twapMinutesNum: number | null;
	twapTriggerPriceNum: number | null;
	twapStopPriceNum: number | null;
	side: Side;
	feeQuote: OrderFeeQuote;
	szDecimals: number | undefined;
	marketKind?: MarketKind;
	totalSize: string;
	referencePx: number;
	baseToken: string;
}

export function TwapOrderSummary({
	twapMinutesNum,
	twapTriggerPriceNum,
	twapStopPriceNum,
	side,
	feeQuote,
	szDecimals,
	compact,
	marketKind,
	totalSize,
	referencePx,
	baseToken,
}: Props) {
	const { formatPrice, formatToken } = useNumberFormat();
	const { t } = useLingui();
	const minutes = getTwapRuntimeMinutes(twapMinutesNum);
	const stopPriceLabel = getTwapStopPriceLabel(side, { buy: t`Max Price`, sell: t`Min Price` });
	const suborderSize = getTwapSuborderSize(totalSize, twapMinutesNum, referencePx);

	return (
		<div className="flex min-w-0 flex-col">
			<SummaryRow compact={compact} label={t`Runtime`}>
				<span className={cn("whitespace-nowrap", minutes > 0 ? "" : "font-normal text-trading-panel-muted")}>
					{minutes > 0 ? formatDuration(minutes) : FALLBACK_VALUE_PLACEHOLDER}
				</span>
			</SummaryRow>
			<SummaryRow compact={compact} label={t`Size per Suborder`}>
				<span className={cn("whitespace-nowrap", suborderSize ? "" : "font-normal text-trading-panel-muted")}>
					{suborderSize
						? `~${formatToken(suborderSize.toString(), { decimals: szDecimals ?? 0, symbol: baseToken })}`
						: FALLBACK_VALUE_PLACEHOLDER}
				</span>
			</SummaryRow>
			{isPositive(twapTriggerPriceNum) && (
				<SummaryRow compact={compact} label={t`Trigger Price`}>
					<span className="whitespace-nowrap">
						{formatPrice(twapTriggerPriceNum, { szDecimals, marketType: marketKind === "spot" ? "spot" : "perp" })}
					</span>
				</SummaryRow>
			)}
			{isPositive(twapStopPriceNum) && (
				<SummaryRow compact={compact} label={stopPriceLabel}>
					<span className="whitespace-nowrap">
						{formatPrice(twapStopPriceNum, { szDecimals, marketType: marketKind === "spot" ? "spot" : "perp" })}
					</span>
				</SummaryRow>
			)}
			<SummaryRow compact={compact} label={t`Fees`}>
				<OrderFeeSummaryValue quote={feeQuote} />
			</SummaryRow>
		</div>
	);
}
