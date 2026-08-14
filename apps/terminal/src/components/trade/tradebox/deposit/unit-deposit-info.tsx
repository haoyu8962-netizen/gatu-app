import { Trans } from "@lingui/react/macro";

interface Props {
	cctpFee?: string | null;
	cctpNetAmount?: string | null;
	cctpFeeLoading?: boolean;
}

export function UnitDepositInfo({ cctpFee, cctpNetAmount, cctpFeeLoading = false }: Props) {
	return (
		<dl className="grid grid-cols-2 gap-y-2 rounded-[10px] border border-market-close-stroke-card bg-market-close-card px-3.5 py-3 text-xs">
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
