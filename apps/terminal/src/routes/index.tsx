import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { DEFAULT_SELECTED_MARKETS } from "@/config/markets";
import { ROUTE_SEO } from "@/config/seo";
import { getTradePathForMarketName } from "@/lib/hyperliquid/market-route";
import { buildPageHead } from "@/lib/seo";
import { useSelectedMarkets } from "@/stores/use-market-store";

export const Route = createFileRoute("/")({
	ssr: false,
	head: () => buildPageHead(ROUTE_SEO.TRADE),
	component: TradeIndexRedirect,
});

function TradeIndexRedirect() {
	const navigate = useNavigate();
	const selectedMarkets = useSelectedMarkets();
	const marketName = selectedMarkets.all ?? DEFAULT_SELECTED_MARKETS.all;

	useEffect(() => {
		void navigate({
			to: getTradePathForMarketName(marketName),
			replace: true,
			resetScroll: false,
		});
	}, [marketName, navigate]);

	return null;
}
