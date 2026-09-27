import { Suspense } from "react";
import { DashboardHeader, FooterBar, GlobalModals } from "@/components/dashboard/dashboard-chrome";
import { DashboardFrameView } from "@/components/dashboard/dashboard-frame-view";
import { DASHBOARD_FRAMES } from "@/config/dashboard-frames";
import { useIsMobile } from "@/hooks/use-mobile";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { FundingComparisonView } from "./funding-comparison-view";
import { useFundingComparisonController } from "./use-funding-comparison-controller";

export function FundingComparisonPage() {
	const isMobile = useIsMobile();
	const isTestnet = useIsTestnet();

	return (
		<>
			<DashboardFrameView
				{...DASHBOARD_FRAMES["/funding-comparison"]}
				isMobile={isMobile}
				bannerOffset={isTestnet}
				testnet={isTestnet}
				header={<DashboardHeader isMobile={isMobile} />}
				main={<FundingComparisonLive />}
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

function FundingComparisonLive() {
	const controller = useFundingComparisonController();
	return <FundingComparisonView {...controller} />;
}
