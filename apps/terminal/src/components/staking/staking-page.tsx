import { Suspense } from "react";
import { APP_HEADER_OFFSET_CLASS, APP_HEADER_PLUS_BANNER_OFFSET_CLASS } from "@/config/layout";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { createLazyComponent } from "@/lib/lazy";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { TopNav } from "../trade/header/top-nav";
import { MobileHeader } from "../trade/mobile/mobile-header";
import { TestnetBanner } from "../trade/testnet-banner";
import type { StakingActionSubmission } from "./domain/staking";
import { getStakingFixtureFromLocation, StakingFixture } from "./staking-fixture";
import { StakingView } from "./staking-view";
import { useStakingActions } from "./use-staking-actions";
import { useStakingController } from "./use-staking-controller";

const FooterBar = createLazyComponent(() => import("../trade/footer/footer-bar"), "FooterBar");
const GlobalModals = createLazyComponent(() => import("../trade/components/global-modals"), "GlobalModals");

export interface StakingPageProps {
	onActionSubmit?: (submission: StakingActionSubmission) => void;
}

export function StakingPage({ onActionSubmit }: StakingPageProps) {
	const fixture = getStakingFixtureFromLocation();
	const isTestnet = useIsTestnet();
	if (fixture) {
		return (
			<div className="min-h-dvh bg-dashboard-canvas font-sans text-fg min-[1001px]:pb-8">
				<main className="mx-auto w-full max-w-[var(--staking-frame-max)] px-4 py-4 min-[1001px]:px-8 min-[1001px]:py-6 min-[1200px]:px-16">
					<StakingFixture fixture={fixture} env={isTestnet ? "Testnet" : "Mainnet"} />
				</main>
			</div>
		);
	}
	return <StakingLive onActionSubmit={onActionSubmit} isTestnet={isTestnet} />;
}

function StakingLive({ onActionSubmit, isTestnet }: StakingPageProps & { isTestnet: boolean }) {
	const isMobile = useIsMobile();
	const controller = useStakingController();
	const actions = useStakingActions(controller.ownerAddress);
	const actionSubmit = onActionSubmit ?? actions.review;

	return (
		<>
			<div
				className={cn(
					"min-h-dvh bg-dashboard-canvas font-sans text-fg",
					!isMobile && "pb-8",
					!isMobile && (isTestnet ? APP_HEADER_PLUS_BANNER_OFFSET_CLASS : APP_HEADER_OFFSET_CLASS),
					isTestnet && "testnet-bg",
				)}
			>
				{isMobile ? (
					<MobileHeader />
				) : (
					<>
						<TestnetBanner />
						<TopNav />
					</>
				)}
				<main className="mx-auto w-full max-w-[var(--staking-frame-max)] px-4 py-4 min-[1001px]:px-8 min-[1001px]:py-6 min-[1200px]:px-16">
					<StakingView
						{...controller}
						onActionSubmit={actionSubmit}
						actionsEnabled={onActionSubmit ? controller.hasExactMasterSigner : actions.canStart}
						actionSession={onActionSubmit ? null : actions.active}
						actionLocked={onActionSubmit ? false : actions.isLocked}
						hasPendingAction={onActionSubmit ? false : actions.hasPendingMarker}
						onActionBack={actions.back}
						onActionConfirm={() => {
							void actions.submit();
						}}
						onActionRetry={actions.retry}
						onActionVerify={() => {
							void actions.verify();
						}}
						onActionClose={actions.close}
					/>
				</main>
				{!isMobile ? (
					<Suspense fallback={null}>
						<FooterBar />
					</Suspense>
				) : null}
			</div>
			<Suspense fallback={null}>
				<GlobalModals />
			</Suspense>
		</>
	);
}
