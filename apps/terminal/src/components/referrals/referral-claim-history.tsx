import { Trans } from "@lingui/react/macro";
import type { ReferralClaimHistoryRow } from "@/hooks/trade/use-referrals";
import { formatDateTime, formatToken, shortenAddress } from "@/lib/format";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";

interface Props {
	rows: ReferralClaimHistoryRow[];
}

export function ReferralClaimHistory({ rows }: Props) {
	useNumberFormatRevision();
	return (
		<div className="divide-y divide-stroke-weak">
			{rows.map((row) => (
				<div key={row.id} className="flex items-center justify-between gap-4 px-4 py-3 min-[1001px]:px-6">
					<div>
						<p className="text-xs font-medium text-fg min-[1001px]:text-2sm">
							<Trans>Rewards claimed</Trans>
						</p>
						<p className="mt-0.5 text-2xs text-fg-muted">
							{formatDateTime(row.time)} · {shortenAddress(row.hash, 6, 6)}
						</p>
					</div>
					<p className="text-xs font-semibold tabular-nums text-success min-[1001px]:text-2sm">
						{formatToken(row.amount, {
							symbol: row.token,
							maximumFractionDigits: row.weiDecimals ?? 8,
						})}
					</p>
				</div>
			))}
		</div>
	);
}
