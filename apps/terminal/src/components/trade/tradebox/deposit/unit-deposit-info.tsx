import { Trans } from "@lingui/react/macro";
import { formatUSD } from "@/lib/format";
import { HyperCoreUsdcIcon } from "../hypercore-usdc-icon";

interface Props {
	cctpFee?: string | null;
	cctpNetAmount?: string | null;
	cctpFeeLoading?: boolean;
	cctpFeeError?: boolean;
	presentation?: "calculation" | "funding";
}

export function UnitDepositInfo({
	cctpFee,
	cctpNetAmount,
	cctpFeeLoading = false,
	cctpFeeError = false,
	presentation = "calculation",
}: Props) {
	if (presentation === "funding") {
		const fee = cctpFee ? (
			formatUSD(cctpFee, { compact: false })
		) : cctpFeeLoading ? (
			<Trans>Checking...</Trans>
		) : cctpFeeError ? (
			<Trans>Unavailable</Trans>
		) : (
			<Trans>Calculated after funding</Trans>
		);

		return (
			<dl
				className="space-y-2 rounded-[10px] border border-market-close-stroke-card bg-market-close-card px-3.5 py-3 text-xs"
				data-presentation="funding"
			>
				<div className="flex items-center justify-between gap-3">
					<dt className="text-market-close-muted">
						<Trans>You receive</Trans>
					</dt>
					<dd className="flex items-center gap-1.5 text-right font-medium text-market-close-fg">
						<HyperCoreUsdcIcon size="sm" />
						<span>
							<Trans>USDC on HyperCore</Trans>
						</span>
					</dd>
				</div>
				<div className="flex items-center justify-between gap-3">
					<dt className="text-market-close-muted">
						<Trans>Fee</Trans>
					</dt>
					<dd className="text-right font-medium tabular-nums text-market-close-fg">{fee}</dd>
				</div>
				<div className="flex items-center justify-between gap-3">
					<dt className="text-market-close-muted">
						<Trans>Processing time</Trans>
					</dt>
					<dd className="text-right font-medium tabular-nums text-market-close-fg">
						<Trans>~2 minutes</Trans>
					</dd>
				</div>
			</dl>
		);
	}

	return (
		<dl
			className="grid grid-cols-2 gap-y-2 rounded-[10px] border border-market-close-stroke-card bg-market-close-card px-3.5 py-3 text-xs"
			data-presentation="calculation"
		>
			<dt className="text-market-close-muted">
				<Trans>Maximum CCTP fee</Trans>
			</dt>
			<dd className="text-right font-semibold tabular-nums">
				{cctpFeeLoading ? <Trans>Checking...</Trans> : cctpFee ? `${cctpFee} USDC` : "—"}
			</dd>
			<dt className="text-market-close-muted">
				<Trans>Estimated net credit</Trans>
			</dt>
			<dd className="text-right font-semibold tabular-nums">{cctpNetAmount ? `${cctpNetAmount} USDC` : "—"}</dd>
		</dl>
	);
}
