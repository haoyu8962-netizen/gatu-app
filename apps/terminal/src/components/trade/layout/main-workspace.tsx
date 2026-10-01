import { Suspense } from "react";
import { Responsive, useContainerWidth } from "react-grid-layout";
import { BRAND_NAME } from "@/config/brand";
import { MOBILE_BREAKPOINT_PX } from "@/config/layout";
import { getSpotAssetSocials } from "@/domain/market/spot-asset-info";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { type UnifiedMarketInfo, useSelectedMarketInfo } from "@/lib/hyperliquid";
import { createLazyComponent, preloadLazyComponents } from "@/lib/lazy";
import { useRenderCommitTrack } from "@/lib/performance/render-profile";
import { useExchangeScope } from "@/providers/exchange-scope";
import { TokenSelector } from "../chart/token-selector";
import { MarketAssetInfo } from "../components/market-asset-info";
import { SpotMarketSocialLinks } from "../components/spot-market-social-links";
import { useFavoritesStripProps } from "../header/favorites-strip";
import { FavoritesStripView } from "../header/favorites-strip-view";
import { MarketOverview } from "../market-overview";
import { MarketHeaderView } from "./market-header-view";
import { useDesktopGridLayout } from "./use-desktop-grid-layout";

const AccountPanel = createLazyComponent(() => import("../tradebox/account-panel"), "AccountPanel");
const ChartPanel = createLazyComponent(() => import("../chart/chart-panel"), "ChartPanel");
const OrderbookPanel = createLazyComponent(() => import("../orderbook/orderbook-panel"), "OrderbookPanel");
const PositionsPanel = createLazyComponent(() => import("../positions/positions-panel"), "PositionsPanel");
const TradePanel = createLazyComponent(() => import("../tradebox/trade-panel"), "TradePanel");

// Resolved lazies render synchronously; a panel that suspends at boot makes React throttle the reveal.
export function preloadMainWorkspacePanels(): Promise<void> {
	return Promise.all([
		preloadLazyComponents([AccountPanel, ChartPanel, OrderbookPanel, PositionsPanel, TradePanel]),
		import("../chart/chart-panel").then((module) => module.preloadChartPanel()),
		import("../positions/positions-panel").then((module) => module.preloadPositionsPanel()),
	]).then(() => undefined);
}

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

interface Props {
	orderEntryDraftReady?: boolean;
}

export function MainWorkspace({ orderEntryDraftReady = true }: Props) {
	useRenderCommitTrack("main-workspace");
	const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });
	const { gridProps, accountContentRef } = useDesktopGridLayout(width, mounted);
	const { data: selectedMarket } = useSelectedMarketInfo();
	const { routeMarketName } = useExchangeScope();
	const navigateToMarket = useMarketNavigation();
	const marketKey = routeMarketName ?? selectedMarket?.name ?? "default";
	const spotSocials = getSpotAssetSocials(selectedMarket);
	const favoritesProps = useFavoritesStripProps();

	function handleMarketChange(marketName: string, nextMarket?: UnifiedMarketInfo) {
		navigateToMarket(marketName, nextMarket);
	}

	return (
		<main ref={containerRef} aria-busy={!mounted} data-main-workspace className="min-h-0 flex-1 bg-grid-container">
			{mounted ? (
				<Responsive className="desktop-terminal-grid" {...gridProps}>
					<div key="favoriteCoins" className="desktop-grid-panel overflow-hidden bg-surface">
						<FavoritesStripView {...favoritesProps} />
					</div>
					<div key="coinInfo" className="desktop-grid-panel overflow-hidden bg-surface">
						<MarketHeaderView
							head={
								<>
									<MarketAssetInfo key={selectedMarket?.name} market={selectedMarket} />
									<TokenSelector
										selectedMarket={selectedMarket}
										onValueChange={handleMarketChange}
										showAssetIcon={false}
									/>
								</>
							}
							socials={spotSocials ? <SpotMarketSocialLinks socials={spotSocials} /> : undefined}
							overview={<MarketOverview key={marketKey} />}
						/>
					</div>

					<div key="chart" className="desktop-grid-panel overflow-hidden bg-surface">
						<Suspense fallback={panelFallback}>
							<ChartPanel showFundingTab />
						</Suspense>
					</div>

					<div key="marketData" className="desktop-grid-panel overflow-hidden bg-surface">
						<Suspense fallback={panelFallback}>
							<OrderbookPanel key={marketKey} />
						</Suspense>
					</div>

					<div key="tradingInterface" className="desktop-grid-panel overflow-hidden bg-surface">
						<Suspense fallback={panelFallback}>
							{orderEntryDraftReady ? (
								<TradePanel key={marketKey} />
							) : (
								<div aria-hidden="true" data-testid="order-entry-draft-loading" className="h-full bg-surface" />
							)}
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
				<output className="sr-only">{`Loading ${BRAND_NAME}...`}</output>
			)}
		</main>
	);
}
