import { Suspense } from "react";
import { DashboardHeader, FooterBar, GlobalModals } from "@/components/dashboard/dashboard-chrome";
import { DashboardFrameView } from "@/components/dashboard/dashboard-frame-view";
import { DASHBOARD_FRAMES } from "@/config/dashboard-frames";
import { useIsMobile } from "@/hooks/use-mobile";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { ApiWalletFixture, getApiWalletFixtureFromLocation } from "./api-wallet-fixture";
import { ApiWalletView } from "./api-wallet-view";
import { useApiWalletController } from "./use-api-wallet-controller";

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
				header={isFixture ? null : <DashboardHeader isMobile={isMobile} />}
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
