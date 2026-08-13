import { Button } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowClockwiseIcon, GiftIcon, SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { type ReactNode, useId, useState } from "react";
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
	code?: string;
	identityKey: string;
}

interface Props {
	initialReferralCode?: string;
}

function getActionIdentityKey(identity: { clientKey: string; env: string; walletAddress: string | undefined }): string {
	return `${identity.env}:${identity.clientKey}:${identity.walletAddress ?? "disconnected"}`;
}

function ReferralSurface({
	busy = false,
	children,
	titleId,
}: {
	busy?: boolean;
	children: ReactNode;
	titleId: string;
}) {
	return (
		<section
			aria-busy={busy || undefined}
			aria-labelledby={titleId}
			className="overflow-hidden rounded-[20px] bg-surface shadow-[0_8px_32px_rgba(20,30,45,0.08)] min-[1001px]:rounded-[14px]"
		>
			{children}
		</section>
	);
}

export function ReferralDashboard({ initialReferralCode }: Props) {
	const { t } = useLingui();
	const titleId = useId();
	const [claimHistoryEnabled, setClaimHistoryEnabled] = useState(false);
	const referrals = useReferrals({ claimHistoryEnabled });
	const referralActions = useReferralActions(referrals);
	const legalGate = useReferralLegalGate();
	const agentStatus = useAgentStatus();
	const { hasWalletAccess } = useWalletSession();
	const { reconnectWallet, isReconnecting } = useReconnectWallet();
	const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);
	const [connectionModalOpen, setConnectionModalOpen] = useState(false);
	const [legalModalOpen, setLegalModalOpen] = useState(false);
	const [isPreparingAction, setIsPreparingAction] = useState(false);

	async function requestAction(action: ReferralAction, code?: string) {
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
			setActiveAction({ action, code, identityKey: getActionIdentityKey(referralActions.identity) });
		} catch {
			toast.error(t`The secure Hyperliquid connection could not be verified. Try again.`);
		} finally {
			setIsPreparingAction(false);
		}
	}

	const actionBusy = referralActions.isPending || isPreparingAction || isReconnecting;
	const actionIdentityKey = getActionIdentityKey(referralActions.identity);
	const visibleAction = activeAction?.identityKey === actionIdentityKey ? activeAction.action : null;
	const readyData =
		referrals.status === "ready" && referrals.data && referrals.usdcRewardsEarned ? referrals.data : null;
	const invitationCanBeApplied = Boolean(readyData && initialReferralCode && canApplyReferralCode(readyData));
	const header = (
		<div className="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h1
					id={titleId}
					className="text-[18px] leading-6 font-bold text-fg min-[1001px]:text-lg min-[1001px]:leading-7"
				>
					<Trans>Referrals & rewards</Trans>
				</h1>
				<p className="mt-1 max-w-2xl text-xs leading-4 text-fg-muted">
					<Trans>Invite traders, review fee benefits, and claim rewards reported by Hyperliquid.</Trans>
				</p>
				{initialReferralCode ? (
					<p className="mt-2 rounded-[10px] border border-stroke-brand-weak bg-brand-soft px-3 py-2 text-xs text-fg">
						<Trans>You were invited with referral code {initialReferralCode}. Review it before applying.</Trans>
					</p>
				) : null}
			</div>
			{readyData ? (
				<div className="hidden flex-wrap gap-2 min-[1001px]:flex">
					{invitationCanBeApplied ? (
						<Button
							variant="outline"
							intent="brand"
							size="sm"
							className="rounded-[10px] text-2sm"
							disabled={actionBusy}
							onClick={() => void requestAction("apply", initialReferralCode)}
						>
							<Trans>Review invitation</Trans>
						</Button>
					) : null}
					{canApplyReferralCode(readyData) && !initialReferralCode ? (
						<Button
							variant="outline"
							intent="neutral"
							size="sm"
							className="rounded-[10px] text-2sm"
							disabled={actionBusy}
							onClick={() => void requestAction("apply")}
						>
							<Trans>Enter code</Trans>
						</Button>
					) : null}
					{readyData.referrerState.stage === "needToCreateCode" ? (
						<Button
							variant="outline"
							intent="brand"
							size="sm"
							className="rounded-[10px] text-2sm"
							disabled={actionBusy}
							onClick={() => void requestAction("create")}
						>
							<Trans>Create code</Trans>
						</Button>
					) : null}
					<Button
						size="sm"
						className="rounded-[10px] text-2sm"
						disabled={actionBusy || !referrals.hasClaimableRewards}
						onClick={() => void requestAction("claim")}
					>
						<Trans>Claim rewards</Trans>
					</Button>
				</div>
			) : null}
		</div>
	);

	let content: ReactNode;
	if (referrals.status === "idle") {
		content = (
			<div className="border-t border-stroke-weak px-4 py-14 text-center min-[1001px]:px-5 min-[1001px]:py-16">
				<GiftIcon aria-hidden="true" className="mx-auto size-10 text-brand" />
				<h2 className="mt-4 text-lg font-bold text-fg">
					<Trans>Connect to view referrals</Trans>
				</h2>
				<p className="mx-auto mt-2 max-w-md text-sm leading-5 text-fg-muted">
					<Trans>Referral stages, rewards, discount, and claim history are scoped to your Hyperliquid account.</Trans>
				</p>
				<Button
					aria-busy={isReconnecting || undefined}
					className="mt-5 rounded-[10px]"
					disabled={isReconnecting}
					onClick={() => void reconnectWallet()}
				>
					<Trans>Connect wallet</Trans>
				</Button>
			</div>
		);
	} else if (referrals.status === "loading") {
		content = (
			<output aria-live="polite" aria-label={t`Loading referrals`} className="block px-4 pb-4 min-[1001px]:px-5">
				<span className="sr-only">
					<Trans>Loading referrals</Trans>
				</span>
				<div aria-hidden="true" className="space-y-3 min-[1001px]:space-y-4">
					<div className="grid grid-cols-2 gap-2 min-[1001px]:grid-cols-4">
						{[0, 1, 2, 3].map((item) => (
							<div
								key={item}
								className="h-[62px] animate-pulse rounded-[10px] bg-fill-weak motion-reduce:animate-none min-[1001px]:h-[74px] min-[1001px]:rounded-[12px]"
							/>
						))}
					</div>
					<div className="grid gap-3 min-[1001px]:grid-cols-[minmax(0,560px)_minmax(0,1fr)] min-[1001px]:gap-4">
						<div className="h-72 animate-pulse rounded-[10px] bg-fill-weak motion-reduce:animate-none min-[1001px]:rounded-[12px]" />
						<div className="h-72 animate-pulse rounded-[10px] bg-fill-weak motion-reduce:animate-none min-[1001px]:rounded-[12px]" />
						<div className="h-36 animate-pulse bg-fill-weak motion-reduce:animate-none min-[1001px]:col-span-2" />
					</div>
				</div>
			</output>
		);
	} else if (!readyData) {
		content = (
			<div role="alert" className="border-t border-stroke-weak px-4 py-14 text-center min-[1001px]:px-5">
				<WarningCircleIcon aria-hidden="true" className="mx-auto size-10 text-error" weight="fill" />
				<h2 className="mt-4 text-lg font-bold text-fg">
					<Trans>Referral data unavailable</Trans>
				</h2>
				<p className="mx-auto mt-2 max-w-md text-sm leading-5 text-fg-muted">
					<Trans>The response could not be verified. No referral action is available until fresh data loads.</Trans>
				</p>
				<Button
					variant="outline"
					intent="neutral"
					className="mt-5 rounded-[10px]"
					iconLeft={<ArrowClockwiseIcon />}
					onClick={referrals.retry}
				>
					<Trans>Retry</Trans>
				</Button>
			</div>
		);
	} else {
		content = (
			<>
				{referrals.isRefreshing ? (
					<output
						aria-live="polite"
						className="flex items-center gap-1.5 px-4 pb-2 text-2xs text-fg-muted min-[1001px]:px-5"
					>
						<SpinnerGapIcon className="size-3 animate-spin motion-reduce:animate-none" />
						<Trans>Refreshing referral data…</Trans>
					</output>
				) : null}
				<div className="px-4 pb-3 min-[1001px]:px-5 min-[1001px]:pb-3.5">
					<ReferralSummaryCards
						data={readyData}
						discountPercent={referrals.discountPercent}
						usdcRewardsEarned={referrals.usdcRewardsEarned ?? "0"}
					/>
				</div>
				<div className="grid gap-3 px-4 pb-4 min-[1001px]:grid-cols-[minmax(0,560px)_minmax(0,1fr)] min-[1001px]:gap-4 min-[1001px]:px-5 min-[1001px]:pb-0">
					<div className="order-1">
						<ReferralCodeCard
							data={readyData}
							onApplyCode={() => void requestAction("apply", initialReferralCode)}
							onCreateCode={() => void requestAction("create")}
						/>
					</div>
					<div className="order-3 min-[1001px]:order-2">
						<ReferralRewardsCard
							claimDisabled={actionBusy || !referrals.hasClaimableRewards}
							onClaim={() => void requestAction("claim")}
							rewards={referrals.rewardRows}
						/>
					</div>
					<div className="order-2 -mx-4 min-[1001px]:order-3 min-[1001px]:col-span-2 min-[1001px]:-mx-5">
						<ReferralActivity
							claimHistory={referrals.claimHistory}
							claimHistoryStatus={referrals.claimHistoryStatus}
							data={readyData}
							onClaimHistoryRequested={() => setClaimHistoryEnabled(true)}
							onRetryClaimHistory={referrals.retryClaimHistory}
							tokenMetadata={referrals.tokenMetadata}
						/>
					</div>
				</div>
			</>
		);
	}

	return (
		<>
			<ReferralSurface busy={referrals.status === "loading"} titleId={titleId}>
				<div className="px-4 pt-3 pb-2.5 min-[1001px]:px-5 min-[1001px]:pt-4 min-[1001px]:pb-3.5">{header}</div>
				{content}
			</ReferralSurface>

			{readyData && (invitationCanBeApplied || referrals.hasClaimableRewards) ? (
				<div className="sticky bottom-0 z-20 mt-2 border-t border-stroke-weak bg-portfolio-canvas/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur min-[1001px]:hidden">
					<Button
						className="w-full rounded-[12px] text-sm font-bold"
						disabled={actionBusy}
						onClick={() =>
							void requestAction(
								invitationCanBeApplied ? "apply" : "claim",
								invitationCanBeApplied ? initialReferralCode : undefined,
							)
						}
					>
						{invitationCanBeApplied ? <Trans>Review invitation</Trans> : <Trans>Claim all available rewards</Trans>}
					</Button>
				</div>
			) : null}

			{readyData && visibleAction ? (
				<ReferralActionModal
					key={`${visibleAction}:${activeAction?.code ?? "manual"}:${actionIdentityKey}`}
					action={visibleAction}
					claimableRewards={referrals.claimableRewardRows}
					initialCode={activeAction?.code}
					onClose={() => setActiveAction(null)}
					onSubmit={referralActions.submit}
				/>
			) : null}
			{readyData && connectionModalOpen ? (
				<EstablishConnectionModal
					onClose={() => setConnectionModalOpen(false)}
					onConnected={() => {
						setConnectionModalOpen(false);
						toast.success(t`Secure connection established. Continue with the referral action.`);
					}}
				/>
			) : null}
			{readyData &&
			legalModalOpen &&
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
