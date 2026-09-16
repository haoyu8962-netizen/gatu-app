import { Suspense } from "react";
import { DashboardFrameView } from "@/components/dashboard/dashboard-frame-view";
import { DASHBOARD_FRAMES } from "@/config/dashboard-frames";
import { useIsMobile } from "@/hooks/use-mobile";
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
			<DashboardFrameView
				{...DASHBOARD_FRAMES["/staking"]}
				header={null}
				headerOffset={false}
				main={<StakingFixture fixture={fixture} env={isTestnet ? "Testnet" : "Mainnet"} />}
			/>
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
			<DashboardFrameView
				{...DASHBOARD_FRAMES["/staking"]}
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
				main={
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
				}
				footer={
					!isMobile ? (
						<Suspense fallback={null}>
							<FooterBar />
						</Suspense>
					) : null
				}
			/>
			<Suspense fallback={null}>
				<GlobalModals />
			</Suspense>
		</>
	);
}
