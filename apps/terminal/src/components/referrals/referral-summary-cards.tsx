import { Trans, useLingui } from "@lingui/react/macro";
import { formatNumber, formatToken } from "@/lib/format";
import type { ReferralData } from "@/lib/trade/referral";

interface Props {
	data: ReferralData;
	discountPercent: string | null;
	usdcRewardsEarned: string;
}

export function ReferralSummaryCards({ data, discountPercent, usdcRewardsEarned }: Props) {
	const { t } = useLingui();
	const referrals = data.referrerState.stage === "ready" ? data.referrerState.data.nReferrals : 0;

	return (
		<section className="grid grid-cols-2 gap-2 min-[1001px]:grid-cols-4" aria-label={t`Referral summary`}>
			<article className="rounded-12 border border-stroke-weak bg-fill-weak px-3 py-2.5 min-[1001px]:px-3.5 min-[1001px]:py-3">
				<p className="text-2xs text-fg-muted min-[1001px]:text-xs">
					<Trans>Traders referred</Trans>
				</p>
				<p className="mt-1.5 text-lg font-semibold leading-none tabular-nums text-fg min-[1001px]:text-xl">
					{formatNumber(referrals)}
				</p>
			</article>

			<article className="rounded-12 border border-stroke-weak bg-fill-weak px-3 py-2.5 min-[1001px]:px-3.5 min-[1001px]:py-3">
				<p className="text-2xs text-fg-muted min-[1001px]:text-xs">
					<Trans>USDC rewards</Trans>
				</p>
				<p className="mt-1.5 text-base font-semibold leading-none tabular-nums text-fg min-[1001px]:text-xl">
					{formatToken(usdcRewardsEarned, { decimals: 2, symbol: "USDC" })}
				</p>
			</article>

			<article className="rounded-12 border border-stroke-weak bg-fill-weak px-3 py-2.5 min-[1001px]:px-3.5 min-[1001px]:py-3">
				<p className="text-2xs text-fg-muted min-[1001px]:text-xs">
					<Trans>USDC claimable</Trans>
				</p>
				<p className="mt-1.5 text-base font-semibold leading-none tabular-nums text-brand min-[1001px]:text-xl">
					{formatToken(data.unclaimedRewards, { decimals: 2, symbol: "USDC" })}
				</p>
			</article>

			<article className="rounded-12 border border-stroke-weak bg-fill-weak px-3 py-2.5 min-[1001px]:px-3.5 min-[1001px]:py-3">
				<p className="text-2xs text-fg-muted min-[1001px]:text-xs">
					<Trans>Active referral discount</Trans>
				</p>
				<p className="mt-1.5 text-lg font-semibold leading-none tabular-nums text-fg min-[1001px]:text-xl">
					{discountPercent === null ? "—" : `${formatNumber(discountPercent, { decimals: 2 })}%`}
				</p>
			</article>
		</section>
	);
}
