import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { Button } from "@sairn/ui";
import { Link } from "@tanstack/react-router";
import { type ReactNode, Suspense, useEffect, useRef } from "react";
import { toast } from "sonner";
import { DashboardHeader, FooterBar, GlobalModals } from "@/components/dashboard/dashboard-chrome";
import { DashboardFrameView } from "@/components/dashboard/dashboard-frame-view";
import { DASHBOARD_FRAMES } from "@/config/dashboard-frames";
import { FUNDS_OUTCOME_TOAST_DURATION_MS } from "@/config/time";
import { useIsMobile } from "@/hooks/use-mobile";
import { type ActionFailure, describeActionFailure } from "@/lib/errors/action-error";
import { shortenAddress, useNumberFormat } from "@/lib/format";
import { getExplorerTxUrl } from "@/lib/hyperliquid";
import type { Translate } from "@/lib/translate";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { getVaultValueTone } from "./domain/vaults";
import { useVaultActionController } from "./use-vault-action-controller";
import { useVaultDetailController, useVaultsController } from "./use-vaults-controller";
import { formatVaultOperationReference } from "./vault-action-domain";
import { VaultActionModal } from "./vault-action-modal";
import { VaultDetailView, type VaultRequestedAction } from "./vault-detail-view";
import {
	getVaultDetailFixtureFromLocation,
	getVaultsFixtureFromLocation,
	VaultDetailFixture,
	VaultsFixture,
} from "./vaults-fixture";
import { VaultsList } from "./vaults-list";

export function VaultsPage() {
	const fixture = getVaultsFixtureFromLocation();
	if (fixture) {
		return (
			<VaultFixtureFrame>
				<VaultsFixture fixture={fixture} />
			</VaultFixtureFrame>
		);
	}
	return <VaultsLive />;
}

function VaultsLive() {
	const controller = useVaultsController();
	return (
		<VaultPageFrame>
			<VaultsList {...controller} />
		</VaultPageFrame>
	);
}

export interface VaultDetailPageProps {
	vaultAddress: string;
	onRequestAction?: (action: VaultRequestedAction) => void;
}

export function VaultDetailPage({ vaultAddress, onRequestAction }: VaultDetailPageProps) {
	const fixture = getVaultDetailFixtureFromLocation();
	if (fixture) {
		return (
			<VaultFixtureFrame>
				<VaultDetailFixture />
			</VaultFixtureFrame>
		);
	}
	return <VaultDetailLive vaultAddress={vaultAddress} onRequestAction={onRequestAction} />;
}

function VaultDetailLive({ vaultAddress, onRequestAction }: VaultDetailPageProps) {
	const { t } = useLingui();
	const { formatNumber } = useNumberFormat();
	const isTestnet = useIsTestnet();
	const controller = useVaultDetailController(vaultAddress);
	const vaultAction = useVaultActionController({
		vaultAddress,
		detail: controller.detail,
		detailCurrent: controller.detailCurrent,
		owner: controller.actionOwner,
	});
	const activeAction = vaultAction.action;
	const reportedOutcomeRef = useRef<string | null>(null);
	useEffect(() => {
		const settledResult = activeAction?.state.stage === "done" ? activeAction.state.result : null;
		if (!activeAction || !settledResult || settledResult === "unknown") {
			reportedOutcomeRef.current = null;
			return;
		}
		const outcomeKey = `${activeAction.id}:${settledResult}`;
		if (reportedOutcomeRef.current === outcomeKey) return;
		reportedOutcomeRef.current = outcomeKey;
		if (settledResult === "success") {
			const receipt = activeAction.receipt;
			const isDeposit = activeAction.action === "deposit";
			const amount = formatNumber(receipt?.finalAmount ?? activeAction.amount, 2);
			const charges = [
				{ label: t`Leader commission`, value: receipt?.commission },
				{ label: t`Closing cost`, value: receipt?.closingCost },
			].filter((charge) => getVaultValueTone(charge.value) === "positive");
			toast.success(isDeposit ? t`Vault deposit confirmed` : t`Vault withdrawal confirmed`, {
				description: (
					<span className="flex flex-col gap-1 tabular-nums">
						{isDeposit ? <bdi dir="ltr">{amount} USDC</bdi> : null}
						{!isDeposit && receipt?.finalAmount ? (
							<span>
								<Trans>
									You received <bdi dir="ltr">{amount} USDC</bdi>.
								</Trans>
							</span>
						) : null}
						{charges.map((charge) => (
							<span key={charge.label}>
								{charge.label}: <bdi dir="ltr">{formatNumber(charge.value, 2)} USDC</bdi>
							</span>
						))}
						{receipt?.hash ? (
							<a
								href={getExplorerTxUrl(receipt.hash, isTestnet)}
								target="_blank"
								rel="noopener"
								className="text-signal hover:text-signal-hover hover:underline"
							>
								<bdi dir="ltr">{shortenAddress(receipt.hash, 6, 6)}</bdi>
							</a>
						) : null}
					</span>
				),
				duration: FUNDS_OUTCOME_TOAST_DURATION_MS,
			});
			vaultAction.close();
			return;
		}
		const isRejected = settledResult === "rejected";
		toast.error(isRejected ? t`Authorization rejected` : t`Vault request failed`, {
			description: getVaultFailureDescription(isRejected, activeAction.error, (descriptor) => t(descriptor)),
			duration: FUNDS_OUTCOME_TOAST_DURATION_MS,
		});
		vaultAction.retry();
	});
	const markerReference = activeAction?.marker
		? formatVaultOperationReference({
				env: activeAction.marker.env,
				owner: activeAction.marker.owner,
				method: "vaultTransfer",
				target: activeAction.marker.target,
				direction: activeAction.action,
				atomicAmount: activeAction.marker.atomicAmount,
				startedAt: activeAction.marker.startedAt,
				identityEpoch: activeAction.marker.identityEpoch,
			})
		: undefined;

	return (
		<VaultPageFrame>
			{controller.state === "loading" ? <VaultDetailSkeleton /> : null}
			{controller.state === "notFound" ? (
				<VaultDetailMessage state="notFound" title={t`Vault not found`}>
					<Trans>The address is invalid or Hyperliquid returned no Vault details for it.</Trans>
				</VaultDetailMessage>
			) : null}
			{controller.state === "error" ? <VaultDetailRetry onRetry={controller.onRetry} /> : null}
			{controller.state === "normal" && controller.detail ? (
				<VaultDetailView
					detail={controller.detail}
					owner={controller.owner}
					actionAvailability={vaultAction.actionAvailability}
					isTestnet={isTestnet}
					onRetry={controller.needsRetry ? controller.onRetry : undefined}
					onRequestAction={onRequestAction ?? ((action) => void vaultAction.requestAction(action))}
				/>
			) : null}
			{activeAction ? (
				<VaultActionModal
					open
					action={activeAction.action}
					stage={activeAction.state.stage}
					result={activeAction.state.result ?? undefined}
					detail={activeAction.detail}
					ownerAddress={activeAction.ownerAddress}
					amount={activeAction.amount}
					availableAmount={vaultAction.availableAmount}
					maxAmount={vaultAction.maxAmount}
					minimumAmount={vaultAction.minimumAmount}
					belowMinimum={vaultAction.belowMinimum}
					errorMessage={
						activeAction.error ? describeActionFailure(activeAction.error, (descriptor) => t(descriptor)) : undefined
					}
					operationReference={activeAction.receipt?.operationReference ?? markerReference}
					canReview={vaultAction.canReview}
					canConfirm={vaultAction.canConfirm}
					onAmountChange={vaultAction.setAmount}
					onReview={vaultAction.review}
					onBack={vaultAction.back}
					onConfirm={() => void vaultAction.confirm()}
					onVerifyAgain={() => void vaultAction.verifyAgain()}
					onClose={vaultAction.close}
					onRetry={controller.needsRetry ? controller.onRetry : undefined}
				/>
			) : null}
		</VaultPageFrame>
	);
}

function VaultFixtureFrame({ children }: { children: ReactNode }) {
	return <DashboardFrameView {...DASHBOARD_FRAMES["/vaults"]} header={null} headerOffset={false} main={children} />;
}

function VaultPageFrame({ children }: { children: ReactNode }) {
	const isMobile = useIsMobile();
	const isTestnet = useIsTestnet();
	return (
		<>
			<DashboardFrameView
				{...DASHBOARD_FRAMES["/vaults"]}
				isMobile={isMobile}
				bannerOffset={isTestnet}
				testnet={isTestnet}
				header={<DashboardHeader isMobile={isMobile} />}
				main={children}
				footer={
					!isMobile ? (
						<Suspense fallback={null}>
							<FooterBar />
						</Suspense>
					) : null
				}
			/>
			<Suspense fallback={null}>
				<GlobalModals enableLegalGate />
			</Suspense>
		</>
	);
}

function VaultDetailSkeleton() {
	const { t } = useLingui();
	return (
		<section
			data-state="loading"
			aria-busy="true"
			aria-label={t`Loading Vault details`}
			className="min-h-80 rounded-24 bg-surface shadow-raised"
		/>
	);
}

function VaultDetailMessage({ state, title, children }: { state: "notFound"; title: string; children: ReactNode }) {
	return (
		<div
			data-state={state}
			role="alert"
			className="flex min-h-80 flex-col items-center justify-center rounded-24 bg-surface px-6 text-center shadow-raised"
		>
			<WarningCircleIcon className="size-9 text-error" weight="fill" />
			<h1 className="mt-3 text-lg font-bold text-fg">{title}</h1>
			<p className="mt-1 max-w-lg text-xs leading-5 text-fg-muted">{children}</p>
			<div className="mt-4 flex gap-2">
				<Button nativeButton={false} variant="outline" intent="neutral" render={<Link to="/vaults" />}>
					<Trans>Back to Vaults</Trans>
				</Button>
			</div>
		</div>
	);
}

function VaultDetailRetry({ onRetry }: { onRetry: () => void }) {
	return (
		<div
			data-state="error"
			className="flex min-h-80 items-center justify-center gap-2 rounded-24 bg-surface px-6 shadow-raised"
		>
			<Button variant="outline" intent="neutral" onClick={onRetry}>
				<Trans>Retry</Trans>
			</Button>
			<Button nativeButton={false} variant="outline" intent="neutral" render={<Link to="/vaults" />}>
				<Trans>Back to Vaults</Trans>
			</Button>
		</div>
	);
}

function getVaultFailureDescription(
	rejected: boolean,
	error: ActionFailure | undefined,
	translate: Translate,
): string | undefined {
	if (rejected) return translate(msg`No operation was submitted.`);
	return error ? describeActionFailure(error, translate) : undefined;
}
