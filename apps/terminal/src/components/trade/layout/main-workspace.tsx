import { Suspense } from "react";
import { Responsive, useContainerWidth } from "react-grid-layout";
import { MOBILE_BREAKPOINT_PX } from "@/config/layout";
import { getSpotAssetSocials } from "@/domain/market/spot-asset-info";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { type UnifiedMarketInfo, useSelectedMarketInfo } from "@/lib/hyperliquid";
import { createLazyComponent } from "@/lib/lazy";
import { useRenderCommitTrack } from "@/lib/performance/render-profile";
import { useExchangeScope } from "@/providers/exchange-scope";
import { TokenSelector } from "../chart/token-selector";
import { MarketAssetInfo } from "../components/market-asset-info";
import { SpotMarketSocialLinks } from "../components/spot-market-social-links";
import { FavoritesStrip } from "../header/favorites-strip";
import { MarketOverview } from "../market-overview";
import { DesktopGridLoadingSurface } from "./desktop-grid-loading-surface";
import { useDesktopGridLayout } from "./use-desktop-grid-layout";

const AccountPanel = createLazyComponent(() => import("../tradebox/account-panel"), "AccountPanel");
const ChartPanel = createLazyComponent(() => import("../chart/chart-panel"), "ChartPanel");
const OrderbookPanel = createLazyComponent(() => import("../orderbook/orderbook-panel"), "OrderbookPanel");
const PositionsPanel = createLazyComponent(() => import("../positions/positions-panel"), "PositionsPanel");
const TradePanel = createLazyComponent(() => import("../tradebox/trade-panel"), "TradePanel");

const panelFallback = <div aria-hidden="true" className="h-full w-full bg-surface" />;

function preloadPrimaryWorkspacePanels() {
	if (
		typeof window === "undefined" ||
		typeof window.matchMedia !== "function" ||
		!window.matchMedia(`(min-width: ${MOBILE_BREAKPOINT_PX + 1}px)`).matches
	) {
		return;
	}
	const preloads = [ChartPanel.preload?.(), OrderbookPanel.preload?.(), TradePanel.preload?.()].filter(
		(preload): preload is Promise<void> => preload !== undefined,
	);
	void Promise.allSettled(preloads);
}

preloadPrimaryWorkspacePanels();

function DesktopWorkspaceSkeleton() {
	return <DesktopGridLoadingSurface panelClassName="desktop-grid-panel bg-surface" />;
}

export function MainWorkspace() {
	useRenderCommitTrack("main-workspace");
	const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });
	const { gridProps, accountContentRef } = useDesktopGridLayout(width, mounted);
	const { data: selectedMarket } = useSelectedMarketInfo();
	const { routeMarketName } = useExchangeScope();
	const navigateToMarket = useMarketNavigation();
	const marketKey = routeMarketName ?? selectedMarket?.name ?? "default";
	const spotSocials = getSpotAssetSocials(selectedMarket);

	function handleMarketChange(marketName: string, nextMarket?: UnifiedMarketInfo) {
		navigateToMarket(marketName, nextMarket);
	}

	return (
		<main ref={containerRef} data-main-workspace className="min-h-0 flex-1 bg-grid-container">
			{mounted ? (
				<Responsive className="desktop-terminal-grid" {...gridProps}>
					<div
						key="favoriteCoins"
						className="desktop-grid-panel flex items-center overflow-hidden border-b border-stroke-weak bg-surface px-2"
					>
						<FavoritesStrip />
					</div>

					<div
						key="coinInfo"
						className="desktop-grid-panel flex min-w-0 items-center overflow-hidden border-b border-trading-panel-stroke-row bg-surface px-4 font-market-close text-trading-panel-fg"
					>
						<div className="flex h-full shrink-0 items-center">
							<div className="flex shrink-0 [&>span]:size-9 [&_button]:size-9 [&_.relative.inline-flex]:size-[26px]">
								<MarketAssetInfo key={selectedMarket?.name} market={selectedMarket} />
							</div>
							<TokenSelector selectedMarket={selectedMarket} onValueChange={handleMarketChange} showAssetIcon={false} />
						</div>
						{spotSocials ? (
							<div className="ms-6">
								<SpotMarketSocialLinks socials={spotSocials} />
							</div>
						) : null}
						<div className="ms-6 min-w-0 flex-1 overflow-hidden">
							<MarketOverview key={marketKey} />
						</div>
					</div>

					<div key="chart" className="desktop-grid-panel overflow-hidden bg-surface">
						<Suspense fallback={panelFallback}>
							<ChartPanel />
						</Suspense>
					</div>

					<div key="marketData" className="desktop-grid-panel overflow-hidden bg-surface">
						<Suspense fallback={panelFallback}>
							<OrderbookPanel key={marketKey} />
						</Suspense>
					</div>

					<div key="tradingInterface" className="desktop-grid-panel overflow-hidden bg-surface">
						<Suspense fallback={panelFallback}>
							<TradePanel key={marketKey} />
						</Suspense>
					</div>

					<div key="accountTable" className="desktop-grid-panel overflow-hidden bg-surface">
						<Suspense fallback={panelFallback}>
							<PositionsPanel />
						</Suspense>
					</div>

					<div
						key="accountInfo"
						data-panel-id="accountInfo"
						className="account-panel-container desktop-grid-panel overflow-hidden bg-surface"
					>
						<Suspense fallback={panelFallback}>
							<div ref={accountContentRef} className="h-full">
								<AccountPanel />
							</div>
						</Suspense>
					</div>
				</Responsive>
			) : (
				<DesktopWorkspaceSkeleton />
			)}
		</main>
	);
}
