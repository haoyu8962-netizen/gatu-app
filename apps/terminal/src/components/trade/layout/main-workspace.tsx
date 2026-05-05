import { Divider } from "@hypeterminal/ui";
import { Suspense, useCallback, useState } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { PANEL_LAYOUT } from "@/config/layout";
import { useSelectedMarketInfo } from "@/lib/hyperliquid";
import { createLazyComponent } from "@/lib/lazy";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useMarketActions } from "@/stores/use-market-store";
import { TokenSelector } from "../chart/token-selector";
import { FavoritesStrip } from "../header/favorites-strip";
import { MarketOverview } from "../market-overview";

const AnalysisSection = createLazyComponent(() => import("./analysis-section"), "AnalysisSection");
const TradeSidebar = createLazyComponent(() => import("./trade-sidebar"), "TradeSidebar");

const { id, analysis, sidebar } = PANEL_LAYOUT.MAIN;

export function MainWorkspace() {
	const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id });
	const { data: selectedMarket } = useSelectedMarketInfo();
	const { scope } = useExchangeScope();
	const { setSelectedMarket } = useMarketActions();
	const [marketBodyMinHeightPx, setMarketBodyMinHeightPx] = useState<number>(PANEL_LAYOUT.ANALYSIS.minHeightPx);
	const marketBodyHeight = `max(calc(100dvh - 9.375rem), ${marketBodyMinHeightPx}px)`;

	const handleAnalysisHeightChange = useCallback((heightPx: number) => {
		setMarketBodyMinHeightPx(Math.max(PANEL_LAYOUT.ANALYSIS.minHeightPx, Math.ceil(heightPx)));
	}, []);

	function handleMarketChange(marketName: string) {
		setSelectedMarket(scope, marketName);
	}

	return (
		<div className="flex-1 min-h-0 flex flex-col bg-background">
			<div className="shrink-0 border-b border-stroke-weak">
				<div className="flex items-center min-w-0 px-2 py-1.5">
					<TokenSelector selectedMarket={selectedMarket} onValueChange={handleMarketChange} />
					<Divider orientation="vertical" className="mx-2.5 my-1" />
					<FavoritesStrip />
				</div>
				<div className="border-t border-stroke-weak/35 px-2 py-1.5 min-w-0 overflow-x-auto scrollbar-none">
					<MarketOverview />
				</div>
			</div>
			<ResizablePanelGroup
				className="min-h-0 shrink-0"
				defaultLayout={defaultLayout}
				onLayoutChanged={onLayoutChanged}
				style={{ height: marketBodyHeight, minHeight: marketBodyMinHeightPx }}
			>
				<ResizablePanel defaultSize={analysis.defaultSize} minSize={analysis.minSize}>
					<div className="h-full flex flex-col bg-surface">
						<div className="flex-1 min-h-0">
							<Suspense fallback={<PanelSkeleton />}>
								<AnalysisSection onDesiredHeightChange={handleAnalysisHeightChange} />
							</Suspense>
						</div>
					</div>
				</ResizablePanel>
				<ResizableHandle withHandle />
				<ResizablePanel defaultSize={sidebar.defaultSize} minSize={sidebar.minSize}>
					<Suspense fallback={<SidebarSkeleton />}>
						<TradeSidebar />
					</Suspense>
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	);
}

function PanelSkeleton() {
	return (
		<div className="h-full min-h-0 bg-surface p-2">
			<div className="h-full rounded-xs bg-fill-weak animate-pulse" />
		</div>
	);
}

function SidebarSkeleton() {
	return (
		<div className="h-full min-h-0 bg-surface p-3 space-y-3">
			<div className="h-8 rounded-xs bg-fill-weak animate-pulse" />
			<div className="h-24 rounded-xs bg-fill-weaker animate-pulse" />
			<div className="h-48 rounded-xs bg-fill-weaker animate-pulse" />
			<div className="h-20 rounded-xs bg-fill-weaker animate-pulse" />
		</div>
	);
}
