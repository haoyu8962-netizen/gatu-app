import { useLocation, useNavigate } from "@tanstack/react-router";
import { Suspense, useEffect, useLayoutEffect } from "react";
import { NotFoundPage } from "@/components/pages/not-found-page";
import { TabTitleSync } from "@/hooks/use-document-title";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMarketsInfo, useSelectedMarketInfo } from "@/lib/hyperliquid";
import {
	findCanonicalMarketForRoute,
	getTradePathForMarket,
	isMalformedTradeMarketPath,
} from "@/lib/hyperliquid/market-route";
import { getExchangeDexForMarket, getExchangeScopeForMarket } from "@/lib/hyperliquid/market-scope";
import { getTradeTerminalBootStatus } from "@/lib/hyperliquid/trade-terminal-boot";
import { createLazyComponent } from "@/lib/lazy";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { useMarketActions, useSelectedMarket } from "@/stores/use-market-store";
import { useOrderEntryActions, useOrderEntryMarketIdentity } from "@/stores/use-order-entry-store";
import { AccountActivityFeedOwner } from "./account-activity-feed-owner";
import { DesktopTerminalSurface } from "./layout/desktop-terminal-surface";
import { TerminalBootError } from "./layout/terminal-boot-error";
import { MobileTerminal } from "./mobile/mobile-terminal";
import { OrderToast } from "./tradebox/order-toast";

const GlobalModals = createLazyComponent(() => import("./components/global-modals"), "GlobalModals");

/** Resolves every lazy piece of the first terminal render for the current surface, so none suspends at boot. */
export function preloadGlobalModals(): void {
	void GlobalModals.preload?.();
}

export function TradeTerminalPage() {
	const isTestnet = useIsTestnet();
	const selectedMarketName = useSelectedMarket();
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const { routeMarketName, routeScope } = useExchangeScope();
	const { getMarketByName, getMarketInfo, markets, catalogState, retryMarketCatalog } = useMarketsInfo();
	const exactMarket = routeMarketName ? getMarketByName(routeMarketName) : undefined;
	const routeMarket = exactMarket ?? (routeMarketName ? getMarketInfo(routeMarketName) : undefined);
	const canonicalMarket =
		routeMarketName && !routeMarket && markets.length > 0
			? findCanonicalMarketForRoute(markets, routeMarketName)
			: undefined;
	const bootStatus = getTradeTerminalBootStatus({
		hasRouteMarketName: Boolean(routeMarketName),
		hasResolvedMarket: Boolean(routeMarket),
		hasCanonicalMarket: Boolean(canonicalMarket),
		hasMalformedRouteMarket: isMalformedTradeMarketPath(pathname),
		catalogState,
	});

	useEffect(() => {
		if (!canonicalMarket) return;
		void navigate({
			to: getTradePathForMarket(canonicalMarket),
			search: (previous) => ({ ...previous, scope: routeScope === "all" ? "all" : undefined }),
			replace: true,
			resetScroll: false,
		});
	}, [canonicalMarket, navigate, routeScope]);

	if (bootStatus !== "ready" && bootStatus !== "loading" && bootStatus !== "redirecting") {
		if (bootStatus === "notFound") return <NotFoundPage />;
		return <TerminalBootError isPaused={bootStatus === "paused"} onRetry={() => void retryMarketCatalog()} />;
	}

	const marketIdentity = JSON.stringify([isTestnet, routeMarket?.name ?? routeMarketName ?? selectedMarketName]);
	return <TradeTerminalContent marketReady={bootStatus === "ready"} marketIdentity={marketIdentity} />;
}

interface Props {
	marketReady: boolean;
}

function TradeTerminalContent({ marketReady, marketIdentity }: Props & { marketIdentity: string }) {
	const isMobile = useIsMobile();
	const currentMarketIdentity = useOrderEntryMarketIdentity();
	const { resetFormForMarket } = useOrderEntryActions();
	const orderEntryDraftReady = marketReady && currentMarketIdentity === marketIdentity;
	useLayoutEffect(() => {
		if (marketReady) resetFormForMarket(marketIdentity);
	}, [marketReady, marketIdentity, resetFormForMarket]);

	return (
		<>
			<AccountActivityFeedOwner />
			<MarketReadySynchronizers marketReady={marketReady} />
			{isMobile ? (
				<MobileTerminal marketReady={marketReady} orderEntryDraftReady={orderEntryDraftReady} />
			) : (
				<DesktopTerminalSurface marketReady={marketReady} orderEntryDraftReady={orderEntryDraftReady} />
			)}
			<MarketReadyOverlays marketReady={marketReady} />
		</>
	);
}

function MarketReadySynchronizers({ marketReady }: Props) {
	if (!marketReady) return null;

	return (
		<>
			<RouteMarketSync />
			<TabTitleSync />
		</>
	);
}

function MarketReadyOverlays({ marketReady }: Props) {
	if (!marketReady) return null;

	return (
		<>
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
