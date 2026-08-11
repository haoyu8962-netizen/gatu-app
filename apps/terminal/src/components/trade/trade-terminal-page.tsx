import { useNavigate } from "@tanstack/react-router";
import { Suspense, useEffect } from "react";
import { NotFoundPage } from "@/components/pages/not-found-page";
import { AppShellSkeleton } from "@/components/trade/layout/app-shell-skeleton";
import { APP_HEADER_OFFSET_CLASS, APP_HEADER_PLUS_BANNER_OFFSET_CLASS } from "@/config/layout";
import { TabTitleSync } from "@/hooks/use-document-title";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { useMarketsInfo, useSelectedMarketInfo } from "@/lib/hyperliquid";
import { findCanonicalMarketForRoute, getTradePathForMarket } from "@/lib/hyperliquid/market-route";
import { getExchangeDexForMarket, getExchangeScopeForMarket } from "@/lib/hyperliquid/market-scope";
import { createLazyComponent } from "@/lib/lazy";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { useMarketActions } from "@/stores/use-market-store";
import { GeoRestrictionBanner } from "./geo/geo-restriction-banner";
import { TopNav } from "./header/top-nav";
import { MainWorkspace } from "./layout/main-workspace";
import { MobileLoadingFallback } from "./mobile/mobile-loading-fallback";
import { MobileTerminal } from "./mobile/mobile-terminal";
import { TestnetBanner } from "./testnet-banner";
import { OrderToast } from "./tradebox/order-toast";

const GlobalModals = createLazyComponent(() => import("./components/global-modals"), "GlobalModals");
const FooterBar = createLazyComponent(() => import("./footer/footer-bar"), "FooterBar");

export function TradeTerminalPage() {
	const navigate = useNavigate();
	const { routeMarketName, routeScope } = useExchangeScope();
	const { getMarketInfo, markets, isLoading, error } = useMarketsInfo();
	const exactMarket = routeMarketName ? getMarketInfo(routeMarketName) : undefined;
	const canonicalMarket =
		routeMarketName && !exactMarket && markets.length > 0
			? findCanonicalMarketForRoute(markets, routeMarketName)
			: undefined;

	useEffect(() => {
		if (!canonicalMarket) return;
		void navigate({
			to: getTradePathForMarket(canonicalMarket),
			search: (previous) => ({ ...previous, scope: routeScope === "all" ? "all" : undefined }),
			replace: true,
			resetScroll: false,
		});
	}, [canonicalMarket, navigate, routeScope]);

	if (routeMarketName && !exactMarket) {
		if (canonicalMarket || isLoading) return <AppShellSkeleton />;
		if (!error) return <NotFoundPage />;
	}

	return <TradeTerminalContent />;
}

function TradeTerminalContent() {
	const isMobile = useIsMobile();
	const isTestnet = useIsTestnet();

	return (
		<>
			<RouteMarketSync />
			<TabTitleSync />
			{isMobile ? (
				<Suspense fallback={<MobileLoadingFallback />}>
					<MobileTerminal />
				</Suspense>
			) : (
				<div
					className={cn(
						"bg-background text-fg min-h-dvh w-full flex flex-col overflow-x-hidden font-sans pb-8",
						isTestnet ? APP_HEADER_PLUS_BANNER_OFFSET_CLASS : APP_HEADER_OFFSET_CLASS,
						isTestnet && "testnet-bg",
					)}
				>
					<TestnetBanner />
					<TopNav />
					<GeoRestrictionBanner />
					<MainWorkspace />
					<Suspense fallback={null}>
						<FooterBar />
					</Suspense>
				</div>
			)}
			<OrderToast />
			<Suspense fallback={null}>
				<GlobalModals enableHip3Disclaimer enableLegalGate enablePositionMarketClose enableTradingOnboarding />
			</Suspense>
		</>
	);
}

function RouteMarketSync() {
	const { routeMarketName, routeScope, setScope } = useExchangeScope();
	const { data: selectedMarket } = useSelectedMarketInfo();
	const { setSelectedMarket } = useMarketActions();
	const selectedMarketName = selectedMarket?.name;
	const selectedMarketPairName = selectedMarket?.pairName;
	const selectedMarketScope = selectedMarket ? getExchangeScopeForMarket(selectedMarket) : undefined;
	const selectedMarketDex = selectedMarket ? getExchangeDexForMarket(selectedMarket) : undefined;

	useEffect(() => {
		if (!routeMarketName) return;

		if (!selectedMarketName || !selectedMarketScope) {
			return;
		}

		if (routeMarketName !== selectedMarketName && routeMarketName !== selectedMarketPairName) return;

		setScope(routeScope === "all" ? "all" : selectedMarketScope, selectedMarketDex, selectedMarketName);
		setSelectedMarket(selectedMarketScope, selectedMarketName);
		setSelectedMarket("all", selectedMarketName);
	}, [
		routeMarketName,
		routeScope,
		selectedMarketName,
		selectedMarketPairName,
		selectedMarketScope,
		selectedMarketDex,
		setScope,
		setSelectedMarket,
	]);

	return null;
}
