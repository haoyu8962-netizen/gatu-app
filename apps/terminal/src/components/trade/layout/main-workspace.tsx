import { Suspense, useEffect, useState } from "react";
import { Responsive, useContainerWidth } from "react-grid-layout";
import {
	DESKTOP_GRID_BREAKPOINTS,
	DESKTOP_GRID_COLS,
	DESKTOP_GRID_GAP_PX,
	DESKTOP_GRID_ROW_HEIGHT_PX,
	getDesktopGridBreakpoint,
	readDesktopGridLayouts,
	syncGridItemResize,
	writeDesktopGridLayouts,
} from "@/config/desktop-grid-layout";
import { MOBILE_BREAKPOINT_PX } from "@/config/layout";
import { getSpotAssetSocials } from "@/domain/market/spot-asset-info";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { type UnifiedMarketInfo, useSelectedMarketInfo } from "@/lib/hyperliquid";
import { createLazyComponent } from "@/lib/lazy";
import { useExchangeScope } from "@/providers/exchange-scope";
import { TokenSelector } from "../chart/token-selector";
import { MarketAssetInfo } from "../components/market-asset-info";
import { SpotMarketSocialLinks } from "../components/spot-market-social-links";
import { FavoritesStrip } from "../header/favorites-strip";
import { MarketOverview } from "../market-overview";
import { DesktopGridLoadingSurface } from "./desktop-grid-loading-surface";
import { useGridContentHeight } from "./use-grid-content-height";

const AccountPanel = createLazyComponent(() => import("../tradebox/account-panel"), "AccountPanel");
const ChartPanel = createLazyComponent(() => import("../chart/chart-panel"), "ChartPanel");
const OrderbookPanel = createLazyComponent(() => import("../orderbook/orderbook-panel"), "OrderbookPanel");
const PositionsPanel = createLazyComponent(() => import("../positions/positions-panel"), "PositionsPanel");
const TradePanel = createLazyComponent(() => import("../tradebox/trade-panel"), "TradePanel");

const gridSpacing = [DESKTOP_GRID_GAP_PX, DESKTOP_GRID_GAP_PX] as const;
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
	const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });
	const [layouts, setLayouts] = useState(readDesktopGridLayouts);
	const activeBreakpoint = getDesktopGridBreakpoint(width);
	const tradeContentRef = useGridContentHeight(mounted, activeBreakpoint, "tradingInterface", setLayouts);
	const accountContentRef = useGridContentHeight(mounted, activeBreakpoint, "accountInfo", setLayouts);
	const { data: selectedMarket } = useSelectedMarketInfo();
	const { routeMarketName } = useExchangeScope();
	const navigateToMarket = useMarketNavigation();
	const marketKey = routeMarketName ?? selectedMarket?.name ?? "default";
	const spotSocials = getSpotAssetSocials(selectedMarket);

	useEffect(() => writeDesktopGridLayouts(layouts), [layouts]);

	function handleMarketChange(marketName: string, nextMarket?: UnifiedMarketInfo) {
		navigateToMarket(marketName, nextMarket);
	}

	return (
		<div ref={containerRef} className="min-h-0 flex-1 bg-grid-container">
			{mounted ? (
				<Responsive
					className="desktop-terminal-grid"
					width={width}
					layouts={layouts}
					breakpoints={DESKTOP_GRID_BREAKPOINTS}
					cols={DESKTOP_GRID_COLS}
					rowHeight={DESKTOP_GRID_ROW_HEIGHT_PX}
					margin={gridSpacing}
					containerPadding={gridSpacing}
					dragConfig={{ enabled: false }}
					resizeConfig={{ enabled: true }}
					onResizeStop={(_, _oldItem, resizedItem) => {
						if (!resizedItem) return;
						setLayouts((prev) => syncGridItemResize(prev, activeBreakpoint, resizedItem));
					}}
				>
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
							<div className="ml-6">
								<SpotMarketSocialLinks socials={spotSocials} />
							</div>
						) : null}
						<div className="ml-6 min-w-0 flex-1 overflow-hidden">
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
							<div ref={tradeContentRef}>
								<TradePanel key={marketKey} />
							</div>
						</Suspense>
					</div>

					<div key="accountTable" className="desktop-grid-panel overflow-hidden bg-surface">
						<Suspense fallback={panelFallback}>
							<PositionsPanel />
						</Suspense>
					</div>

					<div key="accountInfo" data-panel-id="accountInfo" className="desktop-grid-panel overflow-hidden bg-surface">
						<Suspense fallback={panelFallback}>
							<div ref={accountContentRef}>
								<AccountPanel />
							</div>
						</Suspense>
					</div>
				</Responsive>
			) : (
				<DesktopWorkspaceSkeleton />
			)}
		</div>
	);
}
