import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { useRef } from "react";
import type { AccountLedgerStatus } from "@/hooks/trade/use-account-ledger";
import type { ReferralClaimHistoryRow } from "@/hooks/trade/use-referrals";
import type { ReferralData, ReferralTokenMetadata } from "@/lib/trade/referral";
import { ReferralClaimHistory } from "./referral-claim-history";
import { ReferralEmptyState } from "./referral-empty-state";
import { ReferralLegacyHistory } from "./referral-legacy-history";
import { ReferredTraders } from "./referred-traders";

interface Props {
	claimHistory: ReferralClaimHistoryRow[];
	claimHistoryStatus: AccountLedgerStatus;
	data: ReferralData;
	onClaimHistoryRequested: () => void;
	onRetryClaimHistory: () => void;
	tokenMetadata: ReadonlyMap<number, ReferralTokenMetadata> | null;
}

export function ReferralActivity({
	claimHistory,
	claimHistoryStatus,
	data,
	onClaimHistoryRequested,
	onRetryClaimHistory,
	tokenMetadata,
}: Props) {
	const { t } = useLingui();
	const hasRequestedClaimHistory = useRef(false);
	const referredTraders = data.referrerState.stage === "ready" ? data.referrerState.data.referralStates : [];
	const handleActivityChange = (value: string) => {
		if (value !== "claims" || hasRequestedClaimHistory.current) return;
		hasRequestedClaimHistory.current = true;
		onClaimHistoryRequested();
	};

	return (
		<section className="overflow-hidden border-y border-stroke-weak bg-surface" aria-label={t`Referral activity`}>
			<Tabs defaultValue="traders" onValueChange={handleActivityChange}>
				<TabsList className="w-full gap-3 overflow-x-auto px-4 min-[1001px]:gap-[18px] min-[1001px]:px-5">
					<TabsTrigger
						value="traders"
						className="whitespace-nowrap px-1 py-2.5 text-xs data-[state=active]:font-bold min-[1001px]:py-[11px] min-[1001px]:text-2sm"
					>
						<span className="min-[1001px]:hidden">
							<Trans>Traders</Trans>
						</span>
						<span className="max-[1000px]:hidden">
							<Trans>Referred traders</Trans>
						</span>
					</TabsTrigger>
					<TabsTrigger
						value="claims"
						className="whitespace-nowrap px-1 py-2.5 text-xs data-[state=active]:font-bold min-[1001px]:py-[11px] min-[1001px]:text-2sm"
					>
						<span className="min-[1001px]:hidden">
							<Trans>Claims</Trans>
						</span>
						<span className="max-[1000px]:hidden">
							<Trans>Recent reward claims</Trans>
						</span>
					</TabsTrigger>
					<TabsTrigger
						value="legacy"
						className="whitespace-nowrap px-1 py-2.5 text-xs data-[state=active]:font-bold min-[1001px]:py-[11px] min-[1001px]:text-2sm"
					>
						<span className="min-[1001px]:hidden">
							<Trans>Legacy</Trans>
						</span>
						<span className="max-[1000px]:hidden">
							<Trans>Legacy reward history</Trans>
						</span>
					</TabsTrigger>
				</TabsList>

				<TabsContent value="traders" className="mt-0">
					{referredTraders.length ? (
						<ReferredTraders traders={referredTraders} tokenMetadata={tokenMetadata} />
					) : (
						<ReferralEmptyState text={t`No referred traders yet.`} />
					)}
				</TabsContent>
				<TabsContent value="claims" className="mt-0">
					<div className="border-b border-stroke-weak px-4 py-3 text-2xs leading-4 text-fg-muted min-[1001px]:px-6">
						<Trans>
							Shows reward claims reported in the last 30 days. Claims can include referral and builder rewards.
						</Trans>
					</div>
					{claimHistoryStatus === "loading" || claimHistoryStatus === "idle" ? (
						<output aria-live="polite" className="block px-4 py-12 text-center text-xs text-fg-muted">
							<Trans>Loading recent reward claims…</Trans>
						</output>
					) : claimHistoryStatus === "error" || claimHistoryStatus === "unavailable" ? (
						<div role="alert" className="px-4 py-10 text-center">
							<p className="text-xs text-fg-muted">
								<Trans>Recent reward claims could not be verified.</Trans>
							</p>
							<Button
								variant="outline"
								intent="neutral"
								size="sm"
								className="mt-3 rounded-[10px]"
								onClick={onRetryClaimHistory}
							>
								<Trans>Retry</Trans>
							</Button>
						</div>
					) : claimHistory.length ? (
						<ReferralClaimHistory rows={claimHistory} />
					) : (
						<ReferralEmptyState text={t`No recent reward claims.`} />
					)}
				</TabsContent>
				<TabsContent value="legacy" className="mt-0">
					<div className="border-b border-stroke-weak px-4 py-3 text-2xs leading-4 text-fg-muted min-[1001px]:px-6">
						<Trans>This is the legacy earned-reward history. Current claims are shown in the previous tab.</Trans>
					</div>
					{data.rewardHistory.length ? (
						<ReferralLegacyHistory rows={data.rewardHistory} />
					) : (
						<ReferralEmptyState text={t`No legacy reward history.`} />
					)}
				</TabsContent>
			</Tabs>
		</section>
	);
}
