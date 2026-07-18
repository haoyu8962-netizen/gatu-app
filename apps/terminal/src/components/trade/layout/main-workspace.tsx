import { Divider } from "@gatu/ui";
import { Suspense, useState } from "react";
import { Responsive, useContainerWidth } from "react-grid-layout";
import {
	DESKTOP_GRID_BREAKPOINTS,
	DESKTOP_GRID_COLS,
	DESKTOP_GRID_GAP_PX,
	DESKTOP_GRID_ROW_HEIGHT_PX,
	readDesktopGridLayouts,
	writeDesktopGridLayouts,
} from "@/config/desktop-grid-layout";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { type UnifiedMarketInfo, useSelectedMarketInfo } from "@/lib/hyperliquid";
import { createLazyComponent } from "@/lib/lazy";
import { useExchangeScope } from "@/providers/exchange-scope";
import { TokenSelector } from "../chart/token-selector";
import { FavoritesStrip } from "../header/favorites-strip";
import { MarketOverview } from "../market-overview";

const AccountPanel = createLazyComponent(() => import("../tradebox/account-panel"), "AccountPanel");
const ChartPanel = createLazyComponent(() => import("../chart/chart-panel"), "ChartPanel");
const OrderbookPanel = createLazyComponent(() => import("../orderbook/orderbook-panel"), "OrderbookPanel");
const PositionsPanel = createLazyComponent(() => import("../positions/positions-panel"), "PositionsPanel");
const TradePanel = createLazyComponent(() => import("../tradebox/trade-panel"), "TradePanel");

const gridSpacing = [DESKTOP_GRID_GAP_PX, DESKTOP_GRID_GAP_PX] as const;
const panelFallback = <div className="h-full w-full animate-pulse bg-fill-weaker" />;

export function MainWorkspace() {
	const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });
	const [initialLayouts] = useState(readDesktopGridLayouts);
	const { data: selectedMarket } = useSelectedMarketInfo();
	const { routeMarketName } = useExchangeScope();
	const navigateToMarket = useMarketNavigation();
	const marketKey = routeMarketName ?? selectedMarket?.name ?? "default";

	function handleMarketChange(marketName: string, nextMarket?: UnifiedMarketInfo) {
		navigateToMarket(marketName, nextMarket);
	}

	return (
		<div ref={containerRef} className="min-h-0 flex-1 bg-grid-container">
			{mounted ? (
				<Responsive
					className="desktop-terminal-grid"
					width={width}
					layouts={initialLayouts}
					breakpoints={DESKTOP_GRID_BREAKPOINTS}
					cols={DESKTOP_GRID_COLS}
					rowHeight={DESKTOP_GRID_ROW_HEIGHT_PX}
					margin={gridSpacing}
					containerPadding={gridSpacing}
					dragConfig={{ enabled: false }}
					resizeConfig={{ enabled: true }}
					onLayoutChange={(_, layouts) => writeDesktopGridLayouts(layouts)}
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
						<TokenSelector selectedMarket={selectedMarket} onValueChange={handleMarketChange} />
						<Divider orientation="vertical" className="mx-2.5 my-1" />
						<div className="min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
							<MarketOverview />
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

					<div key="tradingInterface" className="desktop-grid-panel overflow-y-auto overscroll-contain bg-surface">
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
						className="desktop-grid-panel overflow-y-auto overscroll-contain bg-surface"
					>
						<Suspense fallback={panelFallback}>
							<AccountPanel />
						</Suspense>
					</div>
				</Responsive>
			) : (
				<div className="h-[41rem] animate-pulse bg-surface/20" />
			)}
		</div>
	);
}
