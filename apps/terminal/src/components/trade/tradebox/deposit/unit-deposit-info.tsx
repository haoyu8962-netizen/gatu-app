import { Trans } from "@lingui/react/macro";
import { useNumberFormat } from "@/lib/format";
import { HyperCoreUsdcIcon } from "../hypercore-usdc-icon";

export const UNIT_DEPOSIT_INFO_LIST_CLASS = "space-y-2 py-3 text-xs";

interface Props {
	cctpFee?: string | null;
	cctpFeeLoading?: boolean;
	cctpFeeError?: boolean;
}

export function UnitDepositInfo({ cctpFee, cctpFeeLoading = false, cctpFeeError = false }: Props) {
	const { formatUSD } = useNumberFormat();
	const fee = !cctpFeeLoading && !cctpFeeError && cctpFee ? formatUSD(cctpFee, { compact: false }) : "--";

	return (
		<dl className={UNIT_DEPOSIT_INFO_LIST_CLASS} data-presentation="funding" aria-busy={cctpFeeLoading}>
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
