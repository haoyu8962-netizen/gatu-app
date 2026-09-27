import { preloadTopNav, TopNav } from "@/components/trade/header/top-nav";
import { MobileHeader } from "@/components/trade/mobile/mobile-header";
import { TestnetBanner } from "@/components/trade/testnet-banner";
import { MOBILE_MEDIA_QUERY } from "@/hooks/use-mobile";
import { createLazyComponent, preloadLazyComponents } from "@/lib/lazy";

export const FooterBar = createLazyComponent(() => import("../trade/footer/footer-bar"), "FooterBar");
export const GlobalModals = createLazyComponent(() => import("../trade/components/global-modals"), "GlobalModals");

function matchesMobileLayout(): boolean {
	return typeof window.matchMedia === "function" && window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

export function preloadDashboardChrome(): Promise<void> {
	const footerAtStart = !matchesMobileLayout();
	const initial = Promise.all([
		preloadTopNav(),
		preloadLazyComponents(footerAtStart ? [GlobalModals, FooterBar] : [GlobalModals]),
	]);
	return initial
		.then(() => (footerAtStart || matchesMobileLayout() ? undefined : FooterBar.preload?.()))
		.then(() => undefined);
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
