import { Suspense } from "react";
import { DashboardFrameView } from "@/components/dashboard/dashboard-frame-view";
import { TopNav } from "@/components/trade/header/top-nav";
import { MobileHeader } from "@/components/trade/mobile/mobile-header";
import { TestnetBanner } from "@/components/trade/testnet-banner";
import { DASHBOARD_FRAMES } from "@/config/dashboard-frames";
import { MOBILE_MEDIA_QUERY, useIsMobile } from "@/hooks/use-mobile";
import { createLazyComponent, preloadLazyComponents } from "@/lib/lazy";
import { renderMarkdown } from "@/lib/markdown";
import { useIsTestnet } from "@/stores/use-global-settings-store";

const FooterBar = createLazyComponent(() => import("../trade/footer/footer-bar"), "FooterBar");
const GlobalModals = createLazyComponent(() => import("../trade/components/global-modals"), "GlobalModals");

export function preloadLegalDocPage(): Promise<void> {
	const mobile = typeof window.matchMedia === "function" && window.matchMedia(MOBILE_MEDIA_QUERY).matches;
	return preloadLazyComponents(mobile ? [GlobalModals] : [GlobalModals, FooterBar]);
}

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
