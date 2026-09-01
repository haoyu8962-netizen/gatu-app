import { Suspense } from "react";
import { APP_HEADER_OFFSET_CLASS, APP_HEADER_PLUS_BANNER_OFFSET_CLASS } from "@/config/layout";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
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
			<div className="min-h-dvh bg-dashboard-canvas font-sans text-fg min-[1001px]:pb-8">
				<main className="mx-auto w-full max-w-[var(--earn-frame-max)] py-4 min-[1001px]:px-10 min-[1001px]:py-6">
					<LeaderboardFixture fixture={fixture} />
				</main>
			</div>
		);
	}
	return <LeaderboardLivePage />;
}

function LeaderboardLivePage() {
	const isMobile = useIsMobile();
	const isTestnet = useIsTestnet();

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
				<main className="mx-auto w-full max-w-[var(--earn-frame-max)] py-4 min-[1001px]:px-10 min-[1001px]:py-6">
					<LeaderboardLive />
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

function LeaderboardLive() {
	const controller = useLeaderboardController();
	return <LeaderboardView {...controller} />;
}
