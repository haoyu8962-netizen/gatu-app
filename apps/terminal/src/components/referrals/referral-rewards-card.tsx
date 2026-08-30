import { Trans } from "@lingui/react/macro";
import { ArrowSquareOutIcon, CaretDownIcon, InfoIcon } from "@phosphor-icons/react";
import { formatToken } from "@/lib/format";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import type { ReferralRewardRow } from "@/lib/trade/referral";

interface Props {
	rewards: ReferralRewardRow[];
}

export function ReferralRewardsCard({ rewards }: Props) {
	useNumberFormatRevision();
	return (
		<article className="h-full rounded-20 border border-stroke-weak bg-surface px-3 py-3 min-[1001px]:rounded-24 min-[1001px]:px-4 min-[1001px]:py-3.5">
			<div className="flex items-start justify-between gap-3">
				<div>
					<h2 className="text-xs font-bold text-fg min-[1001px]:text-2sm">
						<Trans>Rewards by asset</Trans>
					</h2>
					<p className="mt-1 text-2xs leading-4 text-fg-muted">
						<Trans>Quote-asset rewards are shown separately and are never added together as USD.</Trans>
					</p>
				</div>
			</div>

			<div className="mt-3 divide-y divide-stroke-weak border-y border-stroke-weak">
				{rewards.length ? (
					rewards.map((reward) => {
						return (
							<div
								key={reward.tokenId}
								className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-2.5 min-[1200px]:grid-cols-4"
							>
								<div className="col-span-2 min-[1200px]:col-span-1">
									<p className="text-xs font-semibold text-fg min-[1001px]:text-2sm">{reward.name}</p>
									<p className="text-2xs text-fg-muted">Token #{reward.tokenId}</p>
								</div>
								<div>
									<p className="text-2xs text-fg-muted">
										<Trans>Unclaimed</Trans>
									</p>
									<p className="mt-0.5 text-xs font-medium tabular-nums text-fg min-[1001px]:text-2sm">
										{formatToken(reward.unclaimedRewards, {
											symbol: reward.name,
											maximumFractionDigits: reward.weiDecimals ?? 8,
										})}
									</p>
								</div>
								<div>
									<p className="text-2xs text-fg-muted">
										<Trans>Claimed</Trans>
									</p>
									<p className="mt-0.5 text-xs font-medium tabular-nums text-fg min-[1001px]:text-2sm">
										{formatToken(reward.claimedRewards, {
											symbol: reward.name,
											maximumFractionDigits: reward.weiDecimals ?? 8,
										})}
									</p>
								</div>
								<div className="col-span-2 min-[1200px]:col-span-1">
									<p className="text-2xs text-fg-muted">
										<Trans>Builder rewards (cumulative)</Trans>
									</p>
									<p className="mt-0.5 text-xs font-medium tabular-nums text-fg min-[1001px]:text-2sm">
										{formatToken(reward.builderRewards, {
											symbol: reward.name,
											maximumFractionDigits: reward.weiDecimals ?? 8,
										})}
									</p>
								</div>
							</div>
						);
					})
				) : (
					<p className="px-4 py-8 text-center text-xs text-fg-muted">
						<Trans>No reward assets are currently reported for this account.</Trans>
					</p>
				)}
			</div>
			<p className="mt-2 text-2xs leading-4 text-fg-muted">
				<Trans>Builder rewards are a cumulative source breakdown, not an additional reward balance.</Trans>
			</p>
			<p className="mt-1 text-2xs leading-4 text-fg-muted">
				<Trans>
					Hyperliquid requires more than $1 in eligible rewards before a claim. Final eligibility is confirmed by the
					protocol.
				</Trans>
			</p>

			<details className="group mt-3 rounded-20 bg-fill-weaker">
				<summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-semibold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus">
					<InfoIcon className="size-4 text-info" />
					<span className="flex-1">
						<Trans>How Hyperliquid referrals work</Trans>
					</span>
					<CaretDownIcon className="size-3.5 text-fg-muted transition-transform group-open:rotate-180" />
				</summary>
				<div className="border-t border-stroke-weak px-3 py-3">
					<ul className="space-y-1.5 text-2xs leading-4 text-fg-muted">
						<li>
							<Trans>Referred traders currently receive a 4% fee discount on their first $25M of volume.</Trans>
						</li>
						<li>
							<Trans>
								Referrers currently earn 10% of referred fees after the trader discount, for the first $1B of volume.
							</Trans>
						</li>
						<li>
							<Trans>Rewards accrue in all supported quote assets and are claimed to Spot balances.</Trans>
						</li>
						<li>
							<Trans>Referral discounts do not apply to vaults or subaccounts.</Trans>
						</li>
					</ul>
					<a
						href="https://hyperliquid.gitbook.io/hyperliquid-docs/referrals"
						target="_blank"
						rel="noopener noreferrer"
						className="mt-2 inline-flex items-center gap-1 rounded-8 text-2xs font-medium text-signal hover:text-signal-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
					>
						<Trans>Read official referral rules</Trans>
						<ArrowSquareOutIcon className="size-3" />
					</a>
				</div>
			</details>
		</article>
	);
}
