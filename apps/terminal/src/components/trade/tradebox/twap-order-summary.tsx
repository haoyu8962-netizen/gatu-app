import { useLingui } from "@lingui/react/macro";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { TWAP_SUBORDER_INTERVAL_SECONDS } from "@/config/trade";
import { getTwapRuntimeMinutes, getTwapSuborderCount } from "@/domain/trade/twap-details";
import { cn } from "@/lib/cn";
import { formatDuration, formatPrice, formatToken, formatUSD } from "@/lib/format";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { isPositive } from "@/lib/trade/numbers";
import { getTwapStopPriceLabel } from "@/lib/trade/twap-labels";
import type { Side } from "@/lib/trade/types";
import { SummaryRow } from "../components/summary-row";

interface Props {
	twapMinutesNum: number | null;
	twapTriggerPriceNum: number | null;
	twapStopPriceNum: number | null;
	side: Side;
	sizeValue: number;
	orderValue: number;
	estimatedFee: number;
	feeRatePercent: string;
	baseToken: string;
	szDecimals: number | undefined;
}

export function TwapOrderSummary({
	twapMinutesNum,
	twapTriggerPriceNum,
	twapStopPriceNum,
	side,
	sizeValue,
	orderValue,
	estimatedFee,
	feeRatePercent,
	baseToken,
	szDecimals,
}: Props) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const minutes = getTwapRuntimeMinutes(twapMinutesNum);
	const numberOfOrders = getTwapSuborderCount(twapMinutesNum);
	const sizePerSuborder = numberOfOrders > 0 ? sizeValue / numberOfOrders : 0;
	const stopPriceLabel = getTwapStopPriceLabel(side);

	return (
		<div className="flex min-w-0 flex-col">
			<SummaryRow label={t`Frequency`}>
				<span className="whitespace-nowrap">{t`${TWAP_SUBORDER_INTERVAL_SECONDS} seconds`}</span>
			</SummaryRow>
			<SummaryRow label={t`Runtime`}>
				<span className={cn("whitespace-nowrap", minutes > 0 ? "" : "font-normal text-trading-panel-muted")}>
					{minutes > 0 ? formatDuration(minutes) : FALLBACK_VALUE_PLACEHOLDER}
				</span>
			</SummaryRow>
			<SummaryRow label={t`Number of Orders`}>
				<span className={cn("whitespace-nowrap", numberOfOrders > 0 ? "" : "font-normal text-trading-panel-muted")}>
					{numberOfOrders > 0 ? numberOfOrders : FALLBACK_VALUE_PLACEHOLDER}
				</span>
			</SummaryRow>
			<SummaryRow label={t`Size per Suborder`}>
				<span className={cn("whitespace-nowrap", sizePerSuborder > 0 ? "" : "font-normal text-trading-panel-muted")}>
					{sizePerSuborder > 0
						? formatToken(sizePerSuborder, { decimals: szDecimals, symbol: baseToken })
						: FALLBACK_VALUE_PLACEHOLDER}
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
				<span className="whitespace-nowrap text-fg-muted">
					{orderValue > 0 ? `${feeRatePercent} (${formatUSD(estimatedFee)})` : feeRatePercent}
				</span>
			</SummaryRow>
		</div>
	);
}
