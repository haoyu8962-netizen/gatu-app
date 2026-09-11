import { Responsive, useContainerWidth } from "react-grid-layout";
import { useDesktopGridLayout } from "@/components/trade/layout/use-desktop-grid-layout";
import { TradePanel } from "@/components/trade/tradebox/trade-panel";
import { useOrderType } from "@/stores/use-order-entry-store";
import "react-grid-layout/css/styles.css";

export function DesktopOrderEntryGrid() {
	const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });
	const { gridProps } = useDesktopGridLayout(width, mounted);
	const orderType = useOrderType();
	return (
		<div ref={containerRef} className="bg-canvas" data-fixture-desktop-grid>
			{mounted && (
				<Responsive {...gridProps}>
					<div key="favoriteCoins" data-panel="favoriteCoins" className="overflow-hidden bg-surface">
						Favorites
					</div>
					<div key="coinInfo" data-panel="coinInfo" className="overflow-hidden bg-surface">
						Market information
					</div>
					<div key="chart" data-panel="chart" className="overflow-hidden bg-surface">
						Chart
					</div>
					<div key="marketData" data-panel="marketData" className="overflow-hidden bg-surface">
						Order book
					</div>
					<div key="tradingInterface" data-panel="tradingInterface" className="overflow-hidden bg-surface">
						<div data-fixture-form data-order-type={orderType} className="h-full">
							<TradePanel />
						</div>
					</div>
					<div key="accountTable" data-panel="accountTable" className="overflow-hidden bg-surface">
						Positions
					</div>
					<div key="accountInfo" data-panel="accountInfo" className="overflow-hidden bg-surface">
						Account information
					</div>
				</Responsive>
			)}
		</div>
	);
}
