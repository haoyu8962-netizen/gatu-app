import { useId } from "react";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { type UnifiedMarketInfo, useSelectedMarketInfo } from "@/lib/hyperliquid";
import { TokenSelectorContent } from "../chart/token-selector-content";
import { useTokenSelector } from "../chart/use-token-selector";
import { useMobileTerminalTab } from "./use-mobile-terminal-tab";

export function MobileMarketsView() {
	const headingId = useId();
	const { data: market } = useSelectedMarketInfo();
	const { setActiveTab } = useMobileTerminalTab();
	const navigateToMarket = useMarketNavigation();

	function handleSelectMarket(name: string, nextMarket?: UnifiedMarketInfo) {
		navigateToMarket(name, nextMarket, { displayedContent: "trade" });
		setActiveTab("trade");
	}

	const ts = useTokenSelector({
		value: market?.name ?? "",
		onValueChange: handleSelectMarket,
		open: true,
		mobile: true,
	});

	return (
		<div className="flex flex-col h-full min-h-0 bg-background">
			<TokenSelectorContent
				selectedMarket={market}
				scope={ts.scope}
				subcategory={ts.subcategory}
				subcategories={ts.subcategories}
				search={ts.search}
				setSearch={ts.setSearch}
				isLoading={ts.isLoading}
				isFavorite={ts.isFavorite}
				sorting={ts.sorting}
				handleSort={ts.handleSort}
				handleSelect={ts.handleSelect}
				handleSubcategorySelect={ts.handleSubcategorySelect}
				handleScopeSelect={ts.handleScopeSelect}
				toggleFavorite={ts.toggleFavorite}
				table={ts.table}
				rows={ts.rows}
				virtualItems={ts.virtualItems}
				virtualTotalSize={ts.virtualTotalSize}
				containerRef={ts.containerRef}
				filteredMarkets={ts.filteredMarkets}
				highlightedIndex={ts.highlightedIndex}
				headingId={headingId}
				mobile
			/>
		</div>
	);
}
