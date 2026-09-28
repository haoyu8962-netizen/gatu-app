import { Suspense } from "react";
import { DashboardHeader, FooterBar, GlobalModals } from "@/components/dashboard/dashboard-chrome";
import { DashboardFrameView } from "@/components/dashboard/dashboard-frame-view";
import { DASHBOARD_FRAMES } from "@/config/dashboard-frames";
import { useIsMobile } from "@/hooks/use-mobile";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { getLeaderboardFixtureFromLocation, LeaderboardFixture } from "./leaderboard-fixture";
import { LeaderboardView } from "./leaderboard-view";
import { useLeaderboardController } from "./use-leaderboard-controller";

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
				header={<DashboardHeader isMobile={isMobile} />}
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
