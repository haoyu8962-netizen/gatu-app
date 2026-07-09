import type { ExchangeScope } from "@/domain/market";
import type { UnifiedMarketInfo } from "./hooks/useMarketsInfo";

export function getExchangeScopeForMarket(market: UnifiedMarketInfo): ExchangeScope {
	if (market.kind === "spot") return "spot";
	if (market.kind === "builderPerp") return "builders-perp";
	return "perp";
}

export function getExchangeDexForMarket(market: UnifiedMarketInfo): string | undefined {
	return market.kind === "builderPerp" ? market.dex : undefined;
}
