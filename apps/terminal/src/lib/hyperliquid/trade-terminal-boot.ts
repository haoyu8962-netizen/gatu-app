import type { MarketCatalogState } from "./markets/market-catalog-state";

export type TradeTerminalBootStatus = "ready" | "redirecting" | "loading" | "paused" | "error" | "notFound";

interface GetTradeTerminalBootStatusParams {
	hasRouteMarketName: boolean;
	hasResolvedMarket: boolean;
	hasCanonicalMarket: boolean;
	hasMalformedRouteMarket: boolean;
	catalogState: MarketCatalogState;
}

export function getTradeTerminalBootStatus({
	hasRouteMarketName,
	hasResolvedMarket,
	hasCanonicalMarket,
	hasMalformedRouteMarket,
	catalogState,
}: GetTradeTerminalBootStatusParams): TradeTerminalBootStatus {
	if (hasMalformedRouteMarket) return "notFound";
	if (!hasRouteMarketName || hasResolvedMarket) return "ready";
	if (hasCanonicalMarket) return "redirecting";
	if (catalogState.isRestoring || catalogState.status === "loading" || catalogState.isRefreshing) return "loading";
	if (catalogState.canResolveNotFound) return "notFound";
	if (catalogState.isPaused || catalogState.status === "paused") return "paused";
	return "error";
}
