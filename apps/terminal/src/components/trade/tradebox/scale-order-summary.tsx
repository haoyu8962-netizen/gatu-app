import { useLingui } from "@lingui/react/macro";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { cn } from "@/lib/cn";
import { formatPrice, formatUSD } from "@/lib/format";
import type { MarketKind } from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { SummaryRow } from "../components/summary-row";

interface Props {
	scaleStart: number | null;
	scaleEnd: number | null;
	scaleLevels: number;
	scaleSkew: number | null;
	orderValue: number;
	marginRequired: number;
	estimatedFee: number;
	feeRatePercent: string;
	szDecimals: number | undefined;
	marketKind?: MarketKind;
}

export function ScaleOrderSummary({
	scaleStart,
	scaleEnd,
	scaleLevels,
	scaleSkew,
	orderValue,
	marginRequired,
	estimatedFee,
	feeRatePercent,
	szDecimals,
	marketKind = "perp",
}: Props) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const isLeveraged = marketKind !== "spot";

	return (
		<div className="flex min-w-0 flex-col">
			<SummaryRow label={t`Start Price`}>
				<span
					className={cn(
						"whitespace-nowrap",
						scaleStart !== null && scaleStart > 0 ? "" : "font-normal text-trading-panel-muted",
					)}
				>
					{scaleStart !== null && scaleStart > 0 ? formatPrice(scaleStart, { szDecimals }) : FALLBACK_VALUE_PLACEHOLDER}
				</span>
			</SummaryRow>
			<SummaryRow label={t`End Price`}>
				<span
					className={cn(
						"whitespace-nowrap",
						scaleEnd !== null && scaleEnd > 0 ? "" : "font-normal text-trading-panel-muted",
					)}
				>
					{scaleEnd !== null && scaleEnd > 0 ? formatPrice(scaleEnd, { szDecimals }) : FALLBACK_VALUE_PLACEHOLDER}
				</span>
			</SummaryRow>
			<SummaryRow label={t`Number of Orders`}>
				<span className={cn("whitespace-nowrap", scaleLevels > 0 ? "" : "font-normal text-trading-panel-muted")}>
					{scaleLevels > 0 ? scaleLevels : FALLBACK_VALUE_PLACEHOLDER}
				</span>
			</SummaryRow>
			<SummaryRow label={t`Size Skew`}>
				<span
					className={cn(
						"whitespace-nowrap",
						scaleSkew !== null && scaleSkew > 0 ? "" : "font-normal text-trading-panel-muted",
					)}
				>
					{scaleSkew !== null && scaleSkew > 0 ? scaleSkew : FALLBACK_VALUE_PLACEHOLDER}
				</span>
			</SummaryRow>
			<SummaryRow label={t`Order Value`}>
				<span className={cn("whitespace-nowrap", orderValue > 0 ? "" : "font-normal text-trading-panel-muted")}>
					{orderValue > 0 ? formatUSD(orderValue, { compact: false }) : FALLBACK_VALUE_PLACEHOLDER}
				</span>
			</SummaryRow>
			{isLeveraged && (
				<SummaryRow label={t`Margin Req.`}>
					<span className={cn("whitespace-nowrap", marginRequired > 0 ? "" : "font-normal text-trading-panel-muted")}>
						{marginRequired > 0 ? formatUSD(marginRequired, { compact: false }) : FALLBACK_VALUE_PLACEHOLDER}
					</span>
				</SummaryRow>
			)}
			<SummaryRow label={t`Est. Fee`}>
				<span className="whitespace-nowrap font-normal text-trading-panel-muted">
					{orderValue > 0 ? `${feeRatePercent} (${formatUSD(estimatedFee)})` : feeRatePercent}
				</span>
			</SummaryRow>
		</div>
	);
}
