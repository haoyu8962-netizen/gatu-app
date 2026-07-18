import { useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { type UnifiedMarketInfo, useMarketsInfo } from "@/lib/hyperliquid";
import { getTradePathForMarket, getTradePathForMarketName } from "@/lib/hyperliquid/market-route";
import { getExchangeDexForMarket, getExchangeScopeForMarket } from "@/lib/hyperliquid/market-scope";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useMarketActions, useSelectedMarket } from "@/stores/use-market-store";
import { useOrderEntryActions } from "@/stores/use-order-entry-store";

type MobileDisplayedContent = "markets" | "trade" | "account";

interface NavigateToMarketOptions {
	displayedContent?: MobileDisplayedContent;
}

export function useMarketNavigation() {
	const navigate = useNavigate();
	const location = useLocation();
	const { scope, setScope } = useExchangeScope();
	const { getMarketInfo } = useMarketsInfo();
	const { setSelectedMarket } = useMarketActions();
	const currentMarketName = useSelectedMarket();
	const { resetPrices } = useOrderEntryActions();

	return useCallback(
		(marketName: string, marketOverride?: UnifiedMarketInfo, options: NavigateToMarketOptions = {}) => {
			const market = marketOverride ?? getMarketInfo(marketName);
			const targetPath = market ? getTradePathForMarket(market) : getTradePathForMarketName(marketName);
			if (!options.displayedContent && location.pathname === targetPath) return;

			const isCurrentMarket =
				marketName === currentMarketName ||
				market?.name === currentMarketName ||
				market?.pairName === currentMarketName;
			if (!isCurrentMarket) {
				resetPrices();
			}

			if (!market) {
				void navigate({
					to: targetPath,
					search: (previous) => ({ ...previous, scope: scope === "all" ? "all" : undefined }),
					resetScroll: false,
					state: (previous) =>
						options.displayedContent
							? {
									...previous,
									displayedContent: options.displayedContent,
								}
							: previous,
				});
				return;
			}

			const nextScope = getExchangeScopeForMarket(market);
			const nextDex = getExchangeDexForMarket(market);
			const preserveAllScope = scope === "all";
			setScope(preserveAllScope ? "all" : nextScope, nextDex, market.name);
			setSelectedMarket(nextScope, market.name);
			void navigate({
				to: targetPath,
				search: (previous) => ({ ...previous, scope: preserveAllScope ? "all" : undefined }),
				resetScroll: false,
				state: (previous) =>
					options.displayedContent
						? {
								...previous,
								displayedContent: options.displayedContent,
							}
						: previous,
			});
		},
		[currentMarketName, getMarketInfo, location.pathname, navigate, resetPrices, scope, setScope, setSelectedMarket],
	);
}
