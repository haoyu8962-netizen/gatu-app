import { Trans } from "@lingui/react/macro";
import { formatDateTime, formatUSD } from "@/lib/format";
import type { ReferralRewardHistoryItem } from "@/lib/trade/referral";

interface Props {
	rows: ReferralRewardHistoryItem[];
}

export function ReferralLegacyHistory({ rows }: Props) {
	return (
		<div className="divide-y divide-stroke-weak">
			{rows.map((row) => (
				<div
					key={`${row.time}:${row.earned}`}
					className="grid grid-cols-2 gap-3 px-4 py-3 min-[1001px]:grid-cols-4 min-[1001px]:px-6"
				>
					<div className="col-span-2 min-[1001px]:col-span-1">
						<p className="text-2xs text-fg-muted">
							<Trans>Time</Trans>
						</p>
						<p className="mt-0.5 text-xs text-fg">{formatDateTime(row.time)}</p>
					</div>
					<div>
						<p className="text-2xs text-fg-muted">
							<Trans>Earned</Trans>
						</p>
						<p className="mt-0.5 text-xs font-medium tabular-nums text-fg">{formatUSD(row.earned)}</p>
					</div>
					<div>
						<p className="text-2xs text-fg-muted">
							<Trans>Referral volume</Trans>
						</p>
						<p className="mt-0.5 text-xs font-medium tabular-nums text-fg">{formatUSD(row.referralVlm)}</p>
					</div>
					<div>
						<p className="text-2xs text-fg-muted">
							<Trans>Total volume</Trans>
						</p>
						<p className="mt-0.5 text-xs font-medium tabular-nums text-fg">{formatUSD(row.vlm)}</p>
					</div>
				</div>
			))}
		</div>
	);
}
