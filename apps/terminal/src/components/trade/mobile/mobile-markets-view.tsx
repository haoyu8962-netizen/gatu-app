import { useId } from "react";
import { useSelectedMarketInfo } from "@/lib/hyperliquid";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useMarketActions } from "@/stores/use-market-store";
import { TokenSelectorContent } from "../chart/token-selector-content";
import { useTokenSelector } from "../chart/use-token-selector";
import { useMobileTerminalTab } from "./use-mobile-terminal-tab";

export function MobileMarketsView() {
	const headingId = useId();
	const { data: market } = useSelectedMarketInfo();
	const { scope } = useExchangeScope();
	const { setSelectedMarket } = useMarketActions();
	const { setActiveTab } = useMobileTerminalTab();

	function handleSelectMarket(name: string) {
		setSelectedMarket(scope, name);
		setActiveTab("trade");
	}

	const ts = useTokenSelector({ value: market?.name ?? "", onValueChange: handleSelectMarket, open: true });

	return (
		<div className="flex flex-col h-full min-h-0 bg-background">
			<TokenSelectorContent
				selectedMarket={market}
				scope={ts.scope}
				exchangeScope={ts.exchangeScope}
				exchangeDex={ts.exchangeDex}
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
				virtualizer={ts.virtualizer}
				containerRef={ts.containerRef}
				filteredMarkets={ts.filteredMarkets}
				highlightedIndex={ts.highlightedIndex}
				headingId={headingId}
				mobile
			/>
		</div>
	);
}
