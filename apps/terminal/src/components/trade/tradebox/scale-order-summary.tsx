import { useLingui } from "@lingui/react/macro";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import type { OrderFeeQuote } from "@/domain/trade/order-fee-quote";
import { cn } from "@/lib/cn";
import { formatPrice, formatUSD } from "@/lib/format";
import type { MarketKind } from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { OrderFeeSummaryValue } from "../components/order-fee-summary-value";
import { SummaryRow } from "../components/summary-row-view";

interface Props {
	compact?: boolean;
	scaleStart: number | null;
	scaleEnd: number | null;
	scaleLevels: number;
	scaleSkew: number | null;
	orderValue: number;
	marginRequired: number;
	feeQuote: OrderFeeQuote;
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
	feeQuote,
	szDecimals,
	marketKind = "perp",
	compact,
}: Props) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const isLeveraged = marketKind !== "spot";

	return (
		<div className="flex min-w-0 flex-col">
			<SummaryRow compact={compact} label={t`Start Price`}>
				<span
					className={cn(
						"whitespace-nowrap",
						scaleStart !== null && scaleStart > 0 ? "" : "font-normal text-trading-panel-muted",
					)}
				>
					{scaleStart !== null && scaleStart > 0
						? formatPrice(scaleStart, { szDecimals, marketType: marketKind === "spot" ? "spot" : "perp" })
						: FALLBACK_VALUE_PLACEHOLDER}
				</span>
			</SummaryRow>
			<SummaryRow compact={compact} label={t`End Price`}>
				<span
					className={cn(
						"whitespace-nowrap",
						scaleEnd !== null && scaleEnd > 0 ? "" : "font-normal text-trading-panel-muted",
					)}
				>
					{scaleEnd !== null && scaleEnd > 0
						? formatPrice(scaleEnd, { szDecimals, marketType: marketKind === "spot" ? "spot" : "perp" })
						: FALLBACK_VALUE_PLACEHOLDER}
				</span>
			</SummaryRow>
			{!compact && (
				<>
					<SummaryRow compact={compact} label={t`Number of Orders`}>
						<span className={cn("whitespace-nowrap", scaleLevels > 0 ? "" : "font-normal text-trading-panel-muted")}>
							{scaleLevels > 0 ? scaleLevels : FALLBACK_VALUE_PLACEHOLDER}
						</span>
					</SummaryRow>
					<SummaryRow compact={compact} label={t`Size Skew`}>
						<span
							className={cn(
								"whitespace-nowrap",
								scaleSkew !== null && scaleSkew > 0 ? "" : "font-normal text-trading-panel-muted",
							)}
						>
							{scaleSkew !== null && scaleSkew > 0 ? scaleSkew : FALLBACK_VALUE_PLACEHOLDER}
						</span>
					</SummaryRow>
				</>
			)}
			<SummaryRow compact={compact} label={t`Order Value`}>
				<span className={cn("whitespace-nowrap", orderValue > 0 ? "" : "font-normal text-trading-panel-muted")}>
					{orderValue > 0 ? formatUSD(orderValue, { compact: false }) : FALLBACK_VALUE_PLACEHOLDER}
				</span>
			</SummaryRow>
			{isLeveraged && (
				<SummaryRow compact={compact} label={t`Margin Req.`}>
					<span className={cn("whitespace-nowrap", marginRequired > 0 ? "" : "font-normal text-trading-panel-muted")}>
						{marginRequired > 0 ? formatUSD(marginRequired, { compact: false }) : FALLBACK_VALUE_PLACEHOLDER}
					</span>
				</SummaryRow>
			)}
			<SummaryRow compact={compact} label={t`Est. Fee`}>
				<OrderFeeSummaryValue quote={feeQuote} />
			</SummaryRow>
		</div>
	);
}
