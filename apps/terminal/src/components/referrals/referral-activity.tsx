import { Trans, useLingui } from "@lingui/react/macro";
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@sairn/ui";
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
	claimHistoryCanConfirmEmpty: boolean;
	claimHistoryRefreshing: boolean;
	claimHistoryStatus: AccountLedgerStatus;
	data: ReferralData;
	onClaimHistoryRequested: () => void;
	onRetryClaimHistory: () => void;
	onRetrySnapshot: () => void;
	snapshotCurrent: boolean;
	tokenMetadata: ReadonlyMap<number, ReferralTokenMetadata> | null;
}

export function ReferralActivity({
	claimHistory,
	claimHistoryCanConfirmEmpty,
	claimHistoryRefreshing,
	claimHistoryStatus,
	data,
	onClaimHistoryRequested,
	onRetryClaimHistory,
	onRetrySnapshot,
	snapshotCurrent,
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

	function renderRetry(onRetry: () => void) {
		return (
			<div className="px-4 py-10 text-center">
				<Button variant="outline" intent="neutral" size="sm" onClick={onRetry}>
					<Trans>Retry</Trans>
				</Button>
			</div>
		);
	}

	function renderReferredTraders() {
		if (referredTraders.length) return <ReferredTraders traders={referredTraders} tokenMetadata={tokenMetadata} />;
		if (!snapshotCurrent) return renderRetry(onRetrySnapshot);
		return <ReferralEmptyState text={t`No referred traders yet.`} />;
	}

	function renderLegacyHistory() {
		if (data.rewardHistory.length) return <ReferralLegacyHistory rows={data.rewardHistory} />;
		if (!snapshotCurrent) return renderRetry(onRetrySnapshot);
		return <ReferralEmptyState text={t`No legacy reward history.`} />;
	}

	function renderClaimHistory() {
		const loading = claimHistoryStatus === "loading" || claimHistoryStatus === "idle";
		if (loading || (claimHistoryStatus === "ready" && !claimHistory.length && claimHistoryRefreshing)) {
			return (
				<div aria-busy="true" className="min-h-28">
					<span className="sr-only">
						<Trans>Loading recent reward claims…</Trans>
					</span>
				</div>
			);
		}
		if (claimHistoryStatus !== "ready") return renderRetry(onRetryClaimHistory);
		if (claimHistory.length) return <ReferralClaimHistory rows={claimHistory} />;
		if (!claimHistoryCanConfirmEmpty) return renderRetry(onRetryClaimHistory);
		return <ReferralEmptyState text={t`No recent reward claims.`} />;
	}

	return (
		<section className="overflow-hidden border-y border-stroke-weak bg-surface" aria-label={t`Referral activity`}>
			<Tabs defaultValue="traders" onValueChange={handleActivityChange}>
				<TabsList
					aria-label={t`Referral activity views`}
					className="w-full gap-3 overflow-x-auto px-4 min-[1001px]:gap-[18px] min-[1001px]:px-5"
				>
					<TabsTrigger
						value="traders"
						className="whitespace-nowrap px-1 py-2.5 text-xs min-[1001px]:py-[11px] min-[1001px]:text-2sm"
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
						className="whitespace-nowrap px-1 py-2.5 text-xs min-[1001px]:py-[11px] min-[1001px]:text-2sm"
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
						className="whitespace-nowrap px-1 py-2.5 text-xs min-[1001px]:py-[11px] min-[1001px]:text-2sm"
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
					{renderReferredTraders()}
				</TabsContent>
				<TabsContent value="claims" className="mt-0">
					<div className="border-b border-stroke-weak px-4 py-3 text-2xs leading-4 text-fg-muted min-[1001px]:px-6">
						<Trans>
							Shows reward claims reported in the last 30 days. Claims can include referral and builder rewards.
						</Trans>
					</div>
					{renderClaimHistory()}
				</TabsContent>
				<TabsContent value="legacy" className="mt-0">
					<div className="border-b border-stroke-weak px-4 py-3 text-2xs leading-4 text-fg-muted min-[1001px]:px-6">
						<Trans>This is the legacy earned-reward history. Current claims are shown in the previous tab.</Trans>
					</div>
					{renderLegacyHistory()}
				</TabsContent>
			</Tabs>
		</section>
	);
}
