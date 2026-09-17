import { Suspense } from "react";
import { DashboardFrameView } from "@/components/dashboard/dashboard-frame-view";
import { DASHBOARD_FRAMES } from "@/config/dashboard-frames";
import { useIsMobile } from "@/hooks/use-mobile";
import { createLazyComponent } from "@/lib/lazy";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { TopNav } from "../trade/header/top-nav";
import { MobileHeader } from "../trade/mobile/mobile-header";
import { TestnetBanner } from "../trade/testnet-banner";
import { getLeaderboardFixtureFromLocation, LeaderboardFixture } from "./leaderboard-fixture";
import { LeaderboardView } from "./leaderboard-view";
import { useLeaderboardController } from "./use-leaderboard-controller";

const FooterBar = createLazyComponent(() => import("../trade/footer/footer-bar"), "FooterBar");
const GlobalModals = createLazyComponent(() => import("../trade/components/global-modals"), "GlobalModals");

export function LeaderboardPage() {
	const fixture = getLeaderboardFixtureFromLocation();
	if (fixture) {
		return (
			<DashboardFrameView
				{...DASHBOARD_FRAMES["/leaderboard"]}
				header={null}
				headerOffset={false}
				main={<LeaderboardFixture fixture={fixture} />}
			/>
		);
	}
	return <LeaderboardLivePage />;
}

function LeaderboardLivePage() {
	const isMobile = useIsMobile();
	const isTestnet = useIsTestnet();

	return (
		<>
			<DashboardFrameView
				{...DASHBOARD_FRAMES["/leaderboard"]}
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
				main={<LeaderboardLive />}
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

function LeaderboardLive() {
	const controller = useLeaderboardController();
	return <LeaderboardView {...controller} />;
}
