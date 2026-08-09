import { type Dispatch, type SetStateAction, Suspense, useEffect, useRef, useState } from "react";
import { Responsive, type ResponsiveLayouts, useContainerWidth } from "react-grid-layout";
import {
	DESKTOP_GRID_BREAKPOINTS,
	DESKTOP_GRID_COLS,
	DESKTOP_GRID_GAP_PX,
	DESKTOP_GRID_ROW_HEIGHT_PX,
	type DesktopGridBreakpoint,
	readDesktopGridLayouts,
	syncGridItemContentHeight,
	writeDesktopGridLayouts,
} from "@/config/desktop-grid-layout";
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

const AccountPanel = createLazyComponent(() => import("../tradebox/account-panel"), "AccountPanel");
const ChartPanel = createLazyComponent(() => import("../chart/chart-panel"), "ChartPanel");
const OrderbookPanel = createLazyComponent(() => import("../orderbook/orderbook-panel"), "OrderbookPanel");
const PositionsPanel = createLazyComponent(() => import("../positions/positions-panel"), "PositionsPanel");
const TradePanel = createLazyComponent(() => import("../tradebox/trade-panel"), "TradePanel");

const gridSpacing = [DESKTOP_GRID_GAP_PX, DESKTOP_GRID_GAP_PX] as const;

function useGridContentHeight(
	mounted: boolean,
	itemId: string,
	setLayouts: Dispatch<SetStateAction<ResponsiveLayouts<DesktopGridBreakpoint>>>,
) {
	const contentRef = useRef<HTMLDivElement | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: ref target only exists after the grid mounts
	useEffect(() => {
		const node = contentRef.current;
		if (!node) return;
		const observer = new ResizeObserver(() => {
			const contentHeight = node.offsetHeight;
			if (contentHeight === 0) return;
			setLayouts((prev) => syncGridItemContentHeight(prev, itemId, contentHeight));
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, [mounted]);

	return contentRef;
}
const panelFallback = <div className="h-full w-full animate-pulse bg-fill-weaker" />;
const tradePanelFallback = <div className="h-[41rem] w-full animate-pulse bg-fill-weaker" />;
const accountPanelFallback = <div className="h-80 w-full animate-pulse bg-fill-weaker" />;
const chartPanelFallback = <div className="h-full w-full bg-background" />;

export function MainWorkspace() {
	const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });
	const [layouts, setLayouts] = useState(readDesktopGridLayouts);
	const tradeContentRef = useGridContentHeight(mounted, "tradingInterface", setLayouts);
	const accountContentRef = useGridContentHeight(mounted, "accountInfo", setLayouts);
	const { data: selectedMarket } = useSelectedMarketInfo();
	const { routeMarketName } = useExchangeScope();
	const navigateToMarket = useMarketNavigation();
	const marketKey = routeMarketName ?? selectedMarket?.name ?? "default";
	const spotSocials = getSpotAssetSocials(selectedMarket);

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
					onLayoutChange={(_, nextLayouts) => {
						setLayouts(nextLayouts);
						writeDesktopGridLayouts(nextLayouts);
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
						className="desktop-grid-panel flex min-w-0 items-center overflow-hidden border-b border-stroke-weak bg-surface px-2"
					>
						<div className="flex h-10 shrink-0 items-center">
							<MarketAssetInfo key={selectedMarket?.name} market={selectedMarket} />
							<TokenSelector
								selectedMarket={selectedMarket}
								onValueChange={handleMarketChange}
								showAssetIcon={false}
								showMetadataBadge={false}
							/>
						</div>
						{spotSocials ? (
							<div className="ml-8">
								<SpotMarketSocialLinks socials={spotSocials} />
							</div>
						) : null}
						<div className="ml-8 min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
							<MarketOverview />
						</div>
					</div>

					<div key="chart" className="desktop-grid-panel overflow-hidden bg-surface">
						<Suspense fallback={chartPanelFallback}>
							<ChartPanel />
						</Suspense>
					</div>

					<div key="marketData" className="desktop-grid-panel overflow-hidden bg-surface">
						<Suspense fallback={panelFallback}>
							<OrderbookPanel key={marketKey} />
						</Suspense>
					</div>

					<div key="tradingInterface" className="desktop-grid-panel overflow-hidden bg-surface">
						<div ref={tradeContentRef}>
							<Suspense fallback={tradePanelFallback}>
								<TradePanel key={marketKey} />
							</Suspense>
						</div>
					</div>

					<div key="accountTable" className="desktop-grid-panel overflow-hidden bg-surface">
						<Suspense fallback={panelFallback}>
							<PositionsPanel />
						</Suspense>
					</div>

					<div key="accountInfo" data-panel-id="accountInfo" className="desktop-grid-panel overflow-hidden bg-surface">
						<div ref={accountContentRef}>
							<Suspense fallback={accountPanelFallback}>
								<AccountPanel />
							</Suspense>
						</div>
					</div>
				</Responsive>
			) : (
				<div className="h-[41rem] bg-grid-container" />
			)}
		</div>
	);
}
