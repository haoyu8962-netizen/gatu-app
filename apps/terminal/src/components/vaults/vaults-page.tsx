import { Button } from "@gatu/ui";
import { Trans, useLingui } from "@lingui/react/macro";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { type ReactNode, Suspense } from "react";
import { DashboardFrameView } from "@/components/dashboard/dashboard-frame-view";
import { TopNav } from "@/components/trade/header/top-nav";
import { MobileHeader } from "@/components/trade/mobile/mobile-header";
import { TestnetBanner } from "@/components/trade/testnet-banner";
import { DASHBOARD_FRAMES } from "@/config/dashboard-frames";
import { useIsMobile } from "@/hooks/use-mobile";
import { createLazyComponent } from "@/lib/lazy";
import { useIsTestnet } from "@/stores/use-global-settings-store";
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

const FooterBar = createLazyComponent(() => import("../trade/footer/footer-bar"), "FooterBar");
const GlobalModals = createLazyComponent(() => import("../trade/components/global-modals"), "GlobalModals");
const VAULT_DETAIL_SKELETON_KEYS = ["metric-1", "metric-2", "metric-3", "metric-4"] as const;

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
	const isTestnet = useIsTestnet();
	const controller = useVaultDetailController(vaultAddress);
	const vaultAction = useVaultActionController({
		vaultAddress,
		detail: controller.detail,
		owner: controller.owner,
	});
	const activeAction = vaultAction.action;
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
			{controller.state === "error" ? (
				<VaultDetailMessage state="error" title={t`Vault details are unavailable`} onRetry={controller.onRetry}>
					<Trans>
						The response was missing, malformed, or could not be verified. No placeholder financial data is shown.
					</Trans>
				</VaultDetailMessage>
			) : null}
			{controller.state === "normal" && controller.detail ? (
				<VaultDetailView
					detail={controller.detail}
					owner={controller.owner}
					actionAvailability={vaultAction.actionAvailability}
					isTestnet={isTestnet}
					isRefreshing={controller.isRefreshing}
					onRetryOwner={controller.onRetry}
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
					errorMessage={activeAction.errorMessage}
					operationReference={activeAction.receipt?.operationReference ?? markerReference}
					transactionHash={activeAction.receipt?.hash}
					finalAmount={activeAction.receipt?.finalAmount}
					commission={activeAction.receipt?.commission}
					closingCost={activeAction.receipt?.closingCost}
					canReview={vaultAction.canReview}
					canConfirm={vaultAction.canConfirm}
					onAmountChange={vaultAction.setAmount}
					onReview={vaultAction.review}
					onBack={vaultAction.back}
					onConfirm={() => void vaultAction.confirm()}
					onRetry={vaultAction.retry}
					onVerifyAgain={() => void vaultAction.verifyAgain()}
					onClose={vaultAction.close}
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
				header={
					isMobile ? (
						<MobileHeader />
					) : (
						<>
							<TestnetBanner />
							<TopNav />
						</>
					)
				}
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
			className="space-y-3 rounded-12 bg-surface p-4 shadow-raised min-[1001px]:p-5"
		>
			<div className="h-14 animate-pulse rounded-10 bg-fill-weak motion-reduce:animate-none" />
			<div className="grid grid-cols-2 gap-2 min-[1001px]:grid-cols-4">
				{VAULT_DETAIL_SKELETON_KEYS.map((key) => (
					<div key={key} className="h-20 animate-pulse rounded-10 bg-fill-weak motion-reduce:animate-none" />
				))}
			</div>
			<div className="h-72 animate-pulse rounded-12 bg-fill-weak motion-reduce:animate-none" />
		</section>
	);
}

function VaultDetailMessage({
	state,
	title,
	children,
	onRetry,
}: {
	state: "error" | "notFound";
	title: string;
	children: ReactNode;
	onRetry?: () => void;
}) {
	return (
		<div
			data-state={state}
			role="alert"
			className="flex min-h-80 flex-col items-center justify-center rounded-12 bg-surface px-6 text-center shadow-raised"
		>
			<WarningCircleIcon className="size-9 text-error" weight="fill" />
			<h1 className="mt-3 text-lg font-bold text-fg">{title}</h1>
			<p className="mt-1 max-w-lg text-xs leading-5 text-fg-muted">{children}</p>
			<div className="mt-4 flex gap-2">
				{onRetry ? (
					<Button onClick={onRetry}>
						<Trans>Retry</Trans>
					</Button>
				) : null}
				<Button nativeButton={false} variant="outline" intent="neutral" render={<Link to="/vaults" />}>
					<Trans>Back to Vaults</Trans>
				</Button>
			</div>
		</div>
	);
}
