import { Trans } from "@lingui/react/macro";
import { formatUSD } from "@/lib/format";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { HyperCoreUsdcIcon } from "../hypercore-usdc-icon";

interface Props {
	cctpFee?: string | null;
	cctpFeeLoading?: boolean;
	cctpFeeError?: boolean;
}

export function UnitDepositInfo({ cctpFee, cctpFeeLoading = false, cctpFeeError = false }: Props) {
	useNumberFormatRevision();
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
