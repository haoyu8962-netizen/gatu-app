import { useLingui } from "@lingui/react/macro";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { TWAP_SUBORDER_INTERVAL_SECONDS } from "@/config/trade";
import type { OrderFeeQuote } from "@/domain/trade/order-fee-quote";
import { getTwapRuntimeMinutes } from "@/domain/trade/twap-details";
import { cn } from "@/lib/cn";
import { formatDuration, formatPrice } from "@/lib/format";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { isPositive } from "@/lib/trade/numbers";
import { getTwapStopPriceLabel } from "@/lib/trade/twap-labels";
import type { Side } from "@/lib/trade/types";
import { OrderFeeSummaryValue } from "../components/order-fee-summary-value";
import { SummaryRow } from "../components/summary-row";

interface Props {
	twapMinutesNum: number | null;
	twapTriggerPriceNum: number | null;
	twapStopPriceNum: number | null;
	side: Side;
	feeQuote: OrderFeeQuote;
	szDecimals: number | undefined;
}

export function TwapOrderSummary({
	twapMinutesNum,
	twapTriggerPriceNum,
	twapStopPriceNum,
	side,
	feeQuote,
	szDecimals,
}: Props) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const minutes = getTwapRuntimeMinutes(twapMinutesNum);
	const stopPriceLabel = getTwapStopPriceLabel(side);

	return (
		<div className="flex min-w-0 flex-col">
			<SummaryRow label={t`Frequency`}>
				<span className="inline-block max-w-40 whitespace-normal text-right leading-tight">
					{t`Every ${TWAP_SUBORDER_INTERVAL_SECONDS} seconds`}
				</span>
			</SummaryRow>
			<SummaryRow label={t`Runtime`}>
				<span className={cn("whitespace-nowrap", minutes > 0 ? "" : "font-normal text-trading-panel-muted")}>
					{minutes > 0 ? formatDuration(minutes) : FALLBACK_VALUE_PLACEHOLDER}
				</span>
			</SummaryRow>
			{isPositive(twapTriggerPriceNum) && (
				<SummaryRow label={t`Trigger Price`}>
					<span className="whitespace-nowrap">{formatPrice(twapTriggerPriceNum, { szDecimals })}</span>
				</SummaryRow>
			)}
			{isPositive(twapStopPriceNum) && (
				<SummaryRow label={stopPriceLabel}>
					<span className="whitespace-nowrap">{formatPrice(twapStopPriceNum, { szDecimals })}</span>
				</SummaryRow>
			)}
			<SummaryRow label={t`Fees`}>
				<OrderFeeSummaryValue quote={feeQuote} />
			</SummaryRow>
		</div>
	);
}
