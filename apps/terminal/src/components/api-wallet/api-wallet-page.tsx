import { Suspense } from "react";
import { DashboardFrameView } from "@/components/dashboard/dashboard-frame-view";
import { TopNav } from "@/components/trade/header/top-nav";
import { MobileHeader } from "@/components/trade/mobile/mobile-header";
import { TestnetBanner } from "@/components/trade/testnet-banner";
import { DASHBOARD_FRAMES } from "@/config/dashboard-frames";
import { useIsMobile } from "@/hooks/use-mobile";
import { createLazyComponent } from "@/lib/lazy";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { ApiWalletFixture, getApiWalletFixtureFromLocation } from "./api-wallet-fixture";
import { ApiWalletView } from "./api-wallet-view";
import { useApiWalletController } from "./use-api-wallet-controller";

const FooterBar = createLazyComponent(() => import("../trade/footer/footer-bar"), "FooterBar");
const GlobalModals = createLazyComponent(() => import("../trade/components/global-modals"), "GlobalModals");

export function ApiWalletPage() {
	const isMobile = useIsMobile();
	const isTestnet = useIsTestnet();
	const fixture = getApiWalletFixtureFromLocation();
	const isFixture = fixture !== null;

	return (
		<>
			<DashboardFrameView
				{...DASHBOARD_FRAMES["/api-wallet"]}
				isMobile={isMobile}
				bannerOffset={isTestnet}
				testnet={isTestnet}
				headerOffset={!isFixture}
				header={
					isFixture ? null : isMobile ? (
						<MobileHeader />
					) : (
						<>
							<TestnetBanner />
							<TopNav />
						</>
					)
				}
				main={fixture ? <ApiWalletFixture fixture={fixture} /> : <ApiWalletLive />}
				footer={
					!isFixture && !isMobile ? (
						<Suspense fallback={null}>
							<FooterBar />
						</Suspense>
					) : null
				}
			/>
			{isFixture ? null : (
				<Suspense fallback={null}>
					<GlobalModals />
				</Suspense>
			)}
		</>
	);
}

function ApiWalletLive() {
	const controller = useApiWalletController();
	return <ApiWalletView {...controller} />;
}
