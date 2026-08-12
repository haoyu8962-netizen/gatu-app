import { Button } from "@gatu/ui";
import { Trans } from "@lingui/react/macro";
import { ArrowSquareOutIcon, CoinsIcon, InfoIcon } from "@phosphor-icons/react";
import { formatToken } from "@/lib/format";
import type { ReferralRewardRow } from "@/lib/trade/referral";

interface Props {
	claimDisabled: boolean;
	onClaim: () => void;
	rewards: ReferralRewardRow[];
}

export function ReferralRewardsCard({ claimDisabled, onClaim, rewards }: Props) {
	return (
		<article className="rounded-12 bg-surface p-4 min-[1001px]:p-6">
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="flex items-center gap-2">
						<span className="grid size-8 place-items-center rounded-8 bg-brand-soft text-brand">
							<CoinsIcon className="size-4" />
						</span>
						<h2 className="text-base font-semibold text-fg">
							<Trans>Rewards by asset</Trans>
						</h2>
					</div>
					<p className="mt-2 text-xs leading-5 text-fg-muted">
						<Trans>Quote-asset rewards are shown separately and are never added together as USD.</Trans>
					</p>
				</div>
				<Button size="sm" disabled={claimDisabled} onClick={onClaim} className="hidden min-[1001px]:inline-flex">
					<Trans>Claim rewards</Trans>
				</Button>
			</div>

			<div className="mt-5 divide-y divide-stroke-weak overflow-hidden rounded-12 border border-stroke-weak">
				{rewards.length ? (
					rewards.map((reward) => {
						return (
							<div
								key={reward.tokenId}
								className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-3 min-[1001px]:grid-cols-4 min-[1001px]:px-4"
							>
								<div className="col-span-2 min-[1001px]:col-span-1">
									<p className="text-xs font-semibold text-fg">{reward.name}</p>
									<p className="text-2xs text-fg-muted">Token #{reward.tokenId}</p>
								</div>
								<div>
									<p className="text-2xs text-fg-muted">
										<Trans>Unclaimed</Trans>
									</p>
									<p className="mt-0.5 text-xs font-medium tabular-nums text-fg">
										{formatToken(reward.unclaimedRewards, {
											symbol: reward.name,
											maximumFractionDigits: reward.weiDecimals ?? 8,
										})}
									</p>
								</div>
								<div>
									<p className="text-2xs text-fg-muted">
										<Trans>Cumulative builder</Trans>
									</p>
									<p className="mt-0.5 text-xs font-medium tabular-nums text-fg">
										{formatToken(reward.builderRewards, {
											symbol: reward.name,
											maximumFractionDigits: reward.weiDecimals ?? 8,
										})}
									</p>
								</div>
								<div className="col-span-2 min-[1001px]:col-span-1">
									<p className="text-2xs text-fg-muted">
										<Trans>Total claimable</Trans>
									</p>
									<p className="mt-0.5 text-xs font-semibold tabular-nums text-brand">
										{formatToken(reward.claimableRewards, {
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
				<Trans>Builder totals are cumulative attribution and are not added to claimable rewards.</Trans>
			</p>
			<p className="mt-2 text-2xs leading-4 text-fg-muted">
				<Trans>
					Hyperliquid requires more than $1 in eligible rewards before a claim. Final eligibility is confirmed by the
					protocol.
				</Trans>
			</p>

			<div className="mt-5 rounded-12 bg-fill-weak p-4">
				<div className="flex items-center gap-2 text-sm font-semibold text-fg">
					<InfoIcon className="size-4 text-brand" />
					<Trans>How Hyperliquid referrals work</Trans>
				</div>
				<ul className="mt-3 space-y-2 text-xs leading-5 text-fg-muted">
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
					className="mt-3 inline-flex items-center gap-1 rounded-4 text-xs font-medium text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
				>
					<Trans>Read official referral rules</Trans>
					<ArrowSquareOutIcon className="size-3.5" />
				</a>
			</div>
		</article>
	);
}
