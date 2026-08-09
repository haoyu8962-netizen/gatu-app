import { useLingui } from "@lingui/react/macro";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { TWAP_SUBORDER_INTERVAL_SECONDS } from "@/config/trade";
import { cn } from "@/lib/cn";
import { formatDuration, formatToken, formatUSD } from "@/lib/format";
import { SummaryRow } from "../components/summary-row";

interface Props {
	twapMinutesNum: number | null;
	sizeValue: number;
	orderValue: number;
	estimatedFee: number;
	feeRatePercent: string;
	baseToken: string;
	szDecimals: number | undefined;
}

export function TwapOrderSummary({
	twapMinutesNum,
	sizeValue,
	orderValue,
	estimatedFee,
	feeRatePercent,
	baseToken,
	szDecimals,
}: Props) {
	const { t } = useLingui();
	const minutes = Math.max(0, Math.round(twapMinutesNum ?? 0));
	const numberOfOrders = minutes > 0 ? Math.floor((minutes * 60) / TWAP_SUBORDER_INTERVAL_SECONDS) + 1 : 0;
	const sizePerSuborder = numberOfOrders > 0 ? sizeValue / numberOfOrders : 0;

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
			<SummaryRow label={t`Fees`}>
				<span className="whitespace-nowrap text-fg-muted">
					{orderValue > 0 ? `${feeRatePercent} (${formatUSD(estimatedFee)})` : feeRatePercent}
				</span>
			</SummaryRow>
		</div>
	);
}
