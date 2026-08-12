import { Trans, useLingui } from "@lingui/react/macro";
import { CoinsIcon, PercentIcon, UserPlusIcon, WalletIcon } from "@phosphor-icons/react";
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
			<article className="rounded-12 bg-surface p-4 min-[1001px]:p-5">
				<div className="flex items-center justify-between gap-2">
					<p className="text-xs text-fg-muted">
						<Trans>Traders referred</Trans>
					</p>
					<UserPlusIcon className="size-4 text-brand" />
				</div>
				<p className="mt-3 text-2xl font-semibold tabular-nums text-fg">{formatNumber(referrals)}</p>
				<p className="mt-1 text-2xs text-fg-muted">
					<Trans>Confirmed by Hyperliquid</Trans>
				</p>
			</article>

			<article className="rounded-12 bg-surface p-4 min-[1001px]:p-5">
				<div className="flex items-center justify-between gap-2">
					<p className="text-xs text-fg-muted">
						<Trans>USDC rewards</Trans>
					</p>
					<CoinsIcon className="size-4 text-brand" />
				</div>
				<p className="mt-3 text-xl font-semibold tabular-nums text-fg min-[1001px]:text-2xl">
					{formatToken(usdcRewardsEarned, { decimals: 2, symbol: "USDC" })}
				</p>
				<p className="mt-1 text-2xs text-fg-muted">
					<Trans>Claimed and unclaimed</Trans>
				</p>
			</article>

			<article className="rounded-12 bg-surface p-4 min-[1001px]:p-5">
				<div className="flex items-center justify-between gap-2">
					<p className="text-xs text-fg-muted">
						<Trans>USDC claimable</Trans>
					</p>
					<WalletIcon className="size-4 text-brand" />
				</div>
				<p className="mt-3 text-xl font-semibold tabular-nums text-fg min-[1001px]:text-2xl">
					{formatToken(data.unclaimedRewards, { decimals: 2, symbol: "USDC" })}
				</p>
				<p className="mt-1 text-2xs text-fg-muted">
					<Trans>Builder rewards are shown below</Trans>
				</p>
			</article>

			<article className="rounded-12 bg-surface p-4 min-[1001px]:p-5">
				<div className="flex items-center justify-between gap-2">
					<p className="text-xs text-fg-muted">
						<Trans>Active referral discount</Trans>
					</p>
					<PercentIcon className="size-4 text-brand" />
				</div>
				<p className="mt-3 text-2xl font-semibold tabular-nums text-fg">
					{discountPercent === null ? "—" : `${formatNumber(discountPercent, { decimals: 2 })}%`}
				</p>
				<p className="mt-1 text-2xs text-fg-muted">
					<Trans>Live account fee benefit</Trans>
				</p>
			</article>
		</section>
	);
}
