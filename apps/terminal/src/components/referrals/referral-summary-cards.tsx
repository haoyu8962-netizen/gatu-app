import { Trans, useLingui } from "@lingui/react/macro";
import { formatNumber, formatToken } from "@/lib/format";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import type { ReferralData } from "@/lib/trade/referral";

interface Props {
	data: ReferralData;
	discountPercent: string | null;
	usdcRewardsEarned: string;
}

export function ReferralSummaryCards({ data, discountPercent, usdcRewardsEarned }: Props) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const referrals = data.referrerState.stage === "ready" ? data.referrerState.data.nReferrals : 0;

	return (
		<section className="grid grid-cols-2 gap-2 min-[1001px]:grid-cols-4" aria-label={t`Referral summary`}>
			<article className="min-h-[62px] px-3 py-2.5 min-[1001px]:min-h-[74px] min-[1001px]:px-3.5 min-[1001px]:py-3">
				<p className="text-2xs text-fg-muted min-[1001px]:text-xs">
					<Trans>Traders referred</Trans>
				</p>
				<p className="mt-1 text-base leading-5 font-bold tabular-nums text-fg min-[1001px]:mt-1.5 min-[1001px]:text-lg">
					{formatNumber(referrals)}
				</p>
			</article>

			<article className="min-h-[62px] px-3 py-2.5 min-[1001px]:min-h-[74px] min-[1001px]:px-3.5 min-[1001px]:py-3">
				<p className="text-2xs text-fg-muted min-[1001px]:text-xs">
					<Trans>Lifetime USDC rewards</Trans>
				</p>
				<p className="mt-1 text-base leading-5 font-bold tabular-nums text-fg min-[1001px]:mt-1.5 min-[1001px]:text-lg">
					{formatToken(usdcRewardsEarned, { decimals: 2, symbol: "USDC" })}
				</p>
			</article>

			<article className="min-h-[62px] px-3 py-2.5 min-[1001px]:min-h-[74px] min-[1001px]:px-3.5 min-[1001px]:py-3">
				<p className="text-2xs text-fg-muted min-[1001px]:text-xs">
					<Trans>Unclaimed USDC</Trans>
				</p>
				<p className="mt-1 text-base leading-5 font-bold tabular-nums text-action min-[1001px]:mt-1.5 min-[1001px]:text-lg">
					{formatToken(data.unclaimedRewards, { decimals: 2, symbol: "USDC" })}
				</p>
			</article>

			<article className="min-h-[62px] px-3 py-2.5 min-[1001px]:min-h-[74px] min-[1001px]:px-3.5 min-[1001px]:py-3">
				<p className="text-2xs text-fg-muted min-[1001px]:text-xs">
					<Trans>Active referral discount</Trans>
				</p>
				<p className="mt-1 text-base leading-5 font-bold tabular-nums text-fg min-[1001px]:mt-1.5 min-[1001px]:text-lg">
					{discountPercent === null ? "—" : `${formatNumber(discountPercent, { decimals: 2 })}%`}
				</p>
			</article>
		</section>
	);
}
