import { preloadTopNav, TopNav } from "@/components/trade/header/top-nav";
import { MobileHeader } from "@/components/trade/mobile/mobile-header";
import { TestnetBanner } from "@/components/trade/testnet-banner";
import { MOBILE_MEDIA_QUERY } from "@/hooks/use-mobile";
import { createLazyComponent, preloadLazyComponents } from "@/lib/lazy";

export const FooterBar = createLazyComponent(() => import("../trade/footer/footer-bar"), "FooterBar");
export const GlobalModals = createLazyComponent(() => import("../trade/components/global-modals"), "GlobalModals");

export function preloadDashboardChrome(): Promise<void> {
	const mobile = typeof window.matchMedia === "function" && window.matchMedia(MOBILE_MEDIA_QUERY).matches;
	const lazyChrome = preloadLazyComponents(mobile ? [GlobalModals] : [GlobalModals, FooterBar]);
	return Promise.all([preloadTopNav(), lazyChrome]).then(() => undefined);
}

interface Props {
	isMobile: boolean;
}

export function DashboardHeader({ isMobile }: Props) {
	if (isMobile) return <MobileHeader />;
	return (
		<>
			<TestnetBanner />
			<TopNav />
		</>
	);
}
