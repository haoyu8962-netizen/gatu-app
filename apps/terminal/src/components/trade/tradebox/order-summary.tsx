import { t } from "@lingui/core/macro";
import { PencilIcon } from "@phosphor-icons/react";
import { DEFAULT_BUILDER_CONFIG } from "@/config/hyperliquid";
import { cn } from "@/lib/cn";
import { bpsToPercentage, formatPrice, formatUSD } from "@/lib/format";
import type { MarketKind } from "@/lib/hyperliquid";

const SUMMARY_EMPTY = "\u2014";

interface Props {
	liqPrice: number | null;
	liqWarning: boolean;
	orderValue: number;
	marginRequired: number;
	estimatedFee: number;
	feeRatePercent: string;
	slippagePercent: number;
	szDecimals: number | undefined;
	onSlippageClick: () => void;
	marketKind?: MarketKind;
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex items-center justify-between py-1.5">
			<span className="text-xs tracking-[0.5px] text-fg-muted">{label}</span>
			<span className="text-xs tabular-nums text-fg">{children}</span>
		</div>
	);
}

export function OrderSummary({
	liqPrice,
	liqWarning,
	orderValue,
	marginRequired,
	estimatedFee,
	feeRatePercent,
	slippagePercent,
	szDecimals,
	onSlippageClick,
	marketKind = "perp",
}: Props) {
	const isLeveraged = marketKind !== "spot";

	return (
		<div className="flex flex-col">
			{isLeveraged && (
				<SummaryRow label={t`Liq. Price`}>
					<span className={cn(liqPrice ? (liqWarning ? "text-error" : "text-fg") : "text-fg-muted")}>
						{liqPrice ? formatPrice(liqPrice, { szDecimals }) : SUMMARY_EMPTY}
					</span>
				</SummaryRow>
			)}
			<SummaryRow label={t`Order Value`}>
				<span className={orderValue > 0 ? "text-fg" : "text-fg-muted"}>
					{orderValue > 0 ? formatUSD(orderValue) : SUMMARY_EMPTY}
				</span>
			</SummaryRow>
			{isLeveraged && (
				<SummaryRow label={t`Margin Req.`}>
					<span className={marginRequired > 0 ? "text-fg" : "text-fg-muted"}>
						{marginRequired > 0 ? formatUSD(marginRequired) : SUMMARY_EMPTY}
					</span>
				</SummaryRow>
			)}
			<SummaryRow label={t`Slippage`}>
				<button
					type="button"
					onClick={onSlippageClick}
					className="inline-flex cursor-pointer items-center gap-1 hover:opacity-80"
				>
					<span className="tabular-nums text-error">{slippagePercent}%</span>
					<PencilIcon className="size-2.5 text-fg-muted" />
				</button>
			</SummaryRow>
			<SummaryRow label={t`Est. Fee`}>
				<span className="text-fg-muted">
					{orderValue > 0 ? `${feeRatePercent} (${formatUSD(estimatedFee)})` : feeRatePercent}
				</span>
			</SummaryRow>
			{DEFAULT_BUILDER_CONFIG?.f && (
				<SummaryRow label={t`Builder Fee`}>
					<span className="text-fg-muted">{`${bpsToPercentage(DEFAULT_BUILDER_CONFIG?.f)}%`}</span>
				</SummaryRow>
			)}
		</div>
	);
}
