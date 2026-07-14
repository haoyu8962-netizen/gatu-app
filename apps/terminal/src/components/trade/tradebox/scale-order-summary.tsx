import { useLingui } from "@lingui/react/macro";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { DEFAULT_BUILDER_CONFIG } from "@/config/hyperliquid";
import { cn } from "@/lib/cn";
import { bpsToPercentage, formatPrice, formatUSD } from "@/lib/format";
import type { MarketKind } from "@/lib/hyperliquid";

interface Props {
	scaleStart: number | null;
	scaleEnd: number | null;
	scaleLevels: number;
	orderValue: number;
	marginRequired: number;
	estimatedFee: number;
	feeRatePercent: string;
	szDecimals: number | undefined;
	marketKind?: MarketKind;
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex min-w-0 items-center justify-between gap-2 py-1.5">
			<span className="min-w-0 truncate text-xs tracking-[0.5px] text-fg-muted">{label}</span>
			<span className="shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-fg">{children}</span>
		</div>
	);
}

export function ScaleOrderSummary({
	scaleStart,
	scaleEnd,
	scaleLevels,
	orderValue,
	marginRequired,
	estimatedFee,
	feeRatePercent,
	szDecimals,
	marketKind = "perp",
}: Props) {
	const { t } = useLingui();
	const isLeveraged = marketKind !== "spot";

	return (
		<div className="flex min-w-0 flex-col">
			<SummaryRow label={t`Start Price`}>
				<span className={cn("whitespace-nowrap", scaleStart !== null && scaleStart > 0 ? "text-fg" : "text-fg-muted")}>
					{scaleStart !== null && scaleStart > 0 ? formatPrice(scaleStart, { szDecimals }) : FALLBACK_VALUE_PLACEHOLDER}
				</span>
			</SummaryRow>
			<SummaryRow label={t`End Price`}>
				<span className={cn("whitespace-nowrap", scaleEnd !== null && scaleEnd > 0 ? "text-fg" : "text-fg-muted")}>
					{scaleEnd !== null && scaleEnd > 0 ? formatPrice(scaleEnd, { szDecimals }) : FALLBACK_VALUE_PLACEHOLDER}
				</span>
			</SummaryRow>
			<SummaryRow label={t`Number of Orders`}>
				<span className={cn("whitespace-nowrap", scaleLevels > 0 ? "text-fg" : "text-fg-muted")}>
					{scaleLevels > 0 ? scaleLevels : FALLBACK_VALUE_PLACEHOLDER}
				</span>
			</SummaryRow>
			<SummaryRow label={t`Order Value`}>
				<span className={cn("whitespace-nowrap", orderValue > 0 ? "text-fg" : "text-fg-muted")}>
					{orderValue > 0 ? formatUSD(orderValue) : FALLBACK_VALUE_PLACEHOLDER}
				</span>
			</SummaryRow>
			{isLeveraged && (
				<SummaryRow label={t`Margin Req.`}>
					<span className={cn("whitespace-nowrap", marginRequired > 0 ? "text-fg" : "text-fg-muted")}>
						{marginRequired > 0 ? formatUSD(marginRequired) : FALLBACK_VALUE_PLACEHOLDER}
					</span>
				</SummaryRow>
			)}
			<SummaryRow label={t`Est. Fee`}>
				<span className="whitespace-nowrap text-fg-muted">
					{orderValue > 0 ? `${feeRatePercent} (${formatUSD(estimatedFee)})` : feeRatePercent}
				</span>
			</SummaryRow>
			{DEFAULT_BUILDER_CONFIG?.f && (
				<SummaryRow label={t`Builder Fee`}>
					<span className="whitespace-nowrap text-fg-muted">{`${bpsToPercentage(DEFAULT_BUILDER_CONFIG?.f)}%`}</span>
				</SummaryRow>
			)}
		</div>
	);
}
