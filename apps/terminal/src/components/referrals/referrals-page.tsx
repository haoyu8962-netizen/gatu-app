import { Suspense } from "react";
import { DashboardHeader, FooterBar, GlobalModals } from "@/components/dashboard/dashboard-chrome";
import { DashboardFrameView } from "@/components/dashboard/dashboard-frame-view";
import { DASHBOARD_FRAMES } from "@/config/dashboard-frames";
import { useIsMobile } from "@/hooks/use-mobile";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { ReferralDashboard } from "./referral-dashboard";

interface Props {
	initialReferralCode?: string;
}

export function ReferralsPage({ initialReferralCode }: Props) {
	const isMobile = useIsMobile();
	const isTestnet = useIsTestnet();

	return (
		<>
			<DashboardFrameView
				{...DASHBOARD_FRAMES["/referrals"]}
				isMobile={isMobile}
				bannerOffset={isTestnet}
				testnet={isTestnet}
				header={<DashboardHeader isMobile={isMobile} />}
				main={<ReferralDashboard key={initialReferralCode ?? "referrals"} initialReferralCode={initialReferralCode} />}
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
