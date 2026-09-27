import { Suspense } from "react";
import { DashboardHeader, FooterBar, GlobalModals } from "@/components/dashboard/dashboard-chrome";
import { DashboardFrameView } from "@/components/dashboard/dashboard-frame-view";
import { DASHBOARD_FRAMES } from "@/config/dashboard-frames";
import { useIsMobile } from "@/hooks/use-mobile";
import { renderMarkdown } from "@/lib/markdown";
import { useIsTestnet } from "@/stores/use-global-settings-store";

interface Props {
	content: string;
}

export function LegalDocPage({ content }: Props) {
	const isMobile = useIsMobile();
	const isTestnet = useIsTestnet();

	return (
		<>
			<DashboardFrameView
				{...DASHBOARD_FRAMES.legal}
				isMobile={isMobile}
				bannerOffset={isTestnet}
				testnet={isTestnet}
				header={<DashboardHeader isMobile={isMobile} />}
				main={
					<article lang="en" dir="ltr">
						{renderMarkdown(content)}
					</article>
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
