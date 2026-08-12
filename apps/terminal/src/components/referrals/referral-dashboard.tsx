import { Button } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowClockwiseIcon, GiftIcon, SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { EstablishConnectionModal } from "@/components/trade/components/establish-connection-modal";
import { LegalAcceptanceModal } from "@/components/trade/components/legal-acceptance-modal";
import { type ReferralAction, useReferralActions } from "@/hooks/trade/use-referral-actions";
import { useReferralLegalGate } from "@/hooks/trade/use-referral-legal-gate";
import { useReferrals } from "@/hooks/trade/use-referrals";
import { useReconnectWallet, useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useAgentStatus } from "@/lib/hyperliquid";
import { canApplyReferralCode } from "@/lib/trade/referral";
import { ReferralActionModal } from "./referral-action-modal";
import { ReferralActivity } from "./referral-activity";
import { ReferralCodeCard } from "./referral-code-card";
import { ReferralRewardsCard } from "./referral-rewards-card";
import { ReferralSummaryCards } from "./referral-summary-cards";

interface ActiveAction {
	action: ReferralAction;
	identityKey: string;
}

function getActionIdentityKey(identity: { clientKey: string; env: string; walletAddress: string | undefined }): string {
	return `${identity.env}:${identity.clientKey}:${identity.walletAddress ?? "disconnected"}`;
}

export function ReferralDashboard() {
	const { t } = useLingui();
	const referrals = useReferrals();
	const referralActions = useReferralActions(referrals);
	const legalGate = useReferralLegalGate();
	const agentStatus = useAgentStatus();
	const { hasWalletAccess } = useWalletSession();
	const { reconnectWallet, isReconnecting } = useReconnectWallet();
	const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);
	const [connectionModalOpen, setConnectionModalOpen] = useState(false);
	const [legalModalOpen, setLegalModalOpen] = useState(false);
	const [isPreparingAction, setIsPreparingAction] = useState(false);

	async function requestAction(action: ReferralAction) {
		if (!hasWalletAccess) {
			await reconnectWallet();
			return;
		}
		if (legalGate.state !== "accepted") {
			if (legalGate.state === "checking") {
				toast.error(t`Referral access is still being verified.`);
				return;
			}
			setLegalModalOpen(true);
			return;
		}

		setIsPreparingAction(true);
		try {
			const requirements = await agentStatus.refetchAgent();
			if (requirements.needsAgent || !requirements.isAgentReady) {
				setConnectionModalOpen(true);
				return;
			}
			setActiveAction({ action, identityKey: getActionIdentityKey(referralActions.identity) });
		} catch {
			toast.error(t`The secure Hyperliquid connection could not be verified. Try again.`);
		} finally {
			setIsPreparingAction(false);
		}
	}

	const actionBusy = referralActions.isPending || isPreparingAction || isReconnecting;
	const actionIdentityKey = getActionIdentityKey(referralActions.identity);
	const visibleAction = activeAction?.identityKey === actionIdentityKey ? activeAction.action : null;
	const header = (
		<div className="mb-6 flex flex-wrap items-start justify-between gap-4 min-[1001px]:mb-8">
			<div>
				<div className="flex items-center gap-2">
					<span className="grid size-9 place-items-center rounded-10 bg-brand text-white">
						<GiftIcon className="size-5" />
					</span>
					<h1 className="text-2xl font-normal tracking-tight text-fg">
						<Trans>Referrals & rewards</Trans>
					</h1>
				</div>
				<p className="mt-2 max-w-2xl text-sm leading-5 text-fg-muted">
					<Trans>Invite traders, review fee benefits, and claim rewards reported by Hyperliquid.</Trans>
				</p>
			</div>
			{referrals.status === "ready" && referrals.data ? (
				<div className="hidden flex-wrap gap-2 min-[1001px]:flex">
					{canApplyReferralCode(referrals.data) ? (
						<Button
							variant="outline"
							intent="neutral"
							size="sm"
							disabled={actionBusy}
							onClick={() => void requestAction("apply")}
						>
							<Trans>Enter code</Trans>
						</Button>
					) : null}
					{referrals.data.referrerState.stage === "needToCreateCode" ? (
						<Button
							variant="outline"
							intent="brand"
							size="sm"
							disabled={actionBusy}
							onClick={() => void requestAction("create")}
						>
							<Trans>Create code</Trans>
						</Button>
					) : null}
					<Button
						size="sm"
						disabled={actionBusy || !referrals.hasClaimableRewards}
						onClick={() => void requestAction("claim")}
					>
						<Trans>Claim rewards</Trans>
					</Button>
				</div>
			) : null}
		</div>
	);

	if (referrals.status === "idle") {
		return (
			<>
				{header}
				<section className="rounded-12 bg-surface px-5 py-16 text-center">
					<GiftIcon className="mx-auto size-10 text-brand" />
					<h2 className="mt-4 text-lg font-semibold text-fg">
						<Trans>Connect to view referrals</Trans>
					</h2>
					<p className="mx-auto mt-2 max-w-md text-sm leading-5 text-fg-muted">
						<Trans>Referral stages, rewards, discount, and claim history are scoped to your Hyperliquid account.</Trans>
					</p>
					<Button className="mt-5" disabled={isReconnecting} onClick={() => void reconnectWallet()}>
						<Trans>Connect wallet</Trans>
					</Button>
				</section>
			</>
		);
	}

	if (referrals.status === "loading") {
		return (
			<>
				{header}
				<output aria-live="polite" aria-label={t`Loading referrals`} className="block space-y-2">
					<div className="grid grid-cols-2 gap-2 min-[1001px]:grid-cols-4">
						{[0, 1, 2, 3].map((item) => (
							<div key={item} className="h-28 animate-pulse rounded-12 bg-surface" />
						))}
					</div>
					<div className="grid gap-2 min-[1001px]:grid-cols-2">
						<div className="h-96 animate-pulse rounded-12 bg-surface" />
						<div className="h-96 animate-pulse rounded-12 bg-surface" />
					</div>
				</output>
			</>
		);
	}

	if (referrals.status === "error" || !referrals.data || !referrals.usdcRewardsEarned) {
		return (
			<>
				{header}
				<section className="rounded-12 bg-surface px-5 py-14 text-center">
					<WarningCircleIcon className="mx-auto size-10 text-error" weight="fill" />
					<h2 className="mt-4 text-lg font-semibold text-fg">
						<Trans>Referral data unavailable</Trans>
					</h2>
					<p className="mx-auto mt-2 max-w-md text-sm leading-5 text-fg-muted">
						<Trans>The response could not be verified. No referral action is available until fresh data loads.</Trans>
					</p>
					<Button
						variant="outline"
						intent="neutral"
						className="mt-5"
						iconLeft={<ArrowClockwiseIcon />}
						onClick={referrals.retry}
					>
						<Trans>Retry</Trans>
					</Button>
				</section>
			</>
		);
	}

	const data = referrals.data;
	return (
		<>
			{header}
			{referrals.isRefreshing ? (
				<output aria-live="polite" className="mb-2 flex items-center gap-1.5 text-2xs text-fg-muted">
					<SpinnerGapIcon className="size-3 animate-spin" />
					<Trans>Refreshing referral data…</Trans>
				</output>
			) : null}
			<ReferralSummaryCards
				data={data}
				discountPercent={referrals.discountPercent}
				usdcRewardsEarned={referrals.usdcRewardsEarned}
			/>
			<div className="mt-2 grid items-start gap-2 min-[1001px]:grid-cols-2">
				<ReferralCodeCard
					data={data}
					onApplyCode={() => void requestAction("apply")}
					onCreateCode={() => void requestAction("create")}
				/>
				<ReferralRewardsCard
					claimDisabled={actionBusy || !referrals.hasClaimableRewards}
					onClaim={() => void requestAction("claim")}
					rewards={referrals.rewardRows}
				/>
			</div>
			<ReferralActivity
				claimHistory={referrals.claimHistory}
				claimHistoryStatus={referrals.claimHistoryStatus}
				data={data}
				onRetryClaimHistory={referrals.retryClaimHistory}
				tokenMetadata={referrals.tokenMetadata}
			/>

			{referrals.hasClaimableRewards ? (
				<div className="sticky bottom-0 z-20 -mx-4 mt-2 border-t border-stroke-weak bg-portfolio-canvas/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur min-[1001px]:hidden">
					<Button className="w-full" disabled={actionBusy} onClick={() => void requestAction("claim")}>
						<Trans>Claim all available rewards</Trans>
					</Button>
				</div>
			) : null}

			{visibleAction ? (
				<ReferralActionModal
					key={`${visibleAction}:${actionIdentityKey}`}
					action={visibleAction}
					claimableRewards={referrals.claimableRewardRows}
					onClose={() => setActiveAction(null)}
					onSubmit={referralActions.submit}
				/>
			) : null}
			{connectionModalOpen ? (
				<EstablishConnectionModal
					onClose={() => setConnectionModalOpen(false)}
					onConnected={() => {
						setConnectionModalOpen(false);
						toast.success(t`Secure connection established. Continue with the referral action.`);
					}}
				/>
			) : null}
			{legalModalOpen &&
			legalGate.state !== "inactive" &&
			legalGate.state !== "checking" &&
			legalGate.state !== "accepted" ? (
				<LegalAcceptanceModal
					key={legalGate.identity}
					state={legalGate.state}
					acceptanceError={legalGate.acceptanceError}
					blockedDescription={<Trans>This account is not currently permitted to use Hyperliquid referrals.</Trans>}
					onAccept={legalGate.accept}
					onRetryStatus={legalGate.retryStatus}
					onResetAcceptance={legalGate.resetAcceptance}
				/>
			) : null}
		</>
	);
}
