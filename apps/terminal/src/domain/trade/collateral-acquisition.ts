import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import type { SpotMarketInfo, UnifiedMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";

export function getBuilderPerpSwapTargetToken(
	market: UnifiedMarketInfo | undefined,
	spotMarkets: readonly SpotMarketInfo[],
): string | null {
	if (!market || market.kind !== "builderPerp") return null;

	const quoteToken = market.quoteToken?.name.trim();
	if (!quoteToken || quoteToken === DEFAULT_QUOTE_TOKEN) return null;

	const hasDirectPair = spotMarkets.some((spotMarket) => {
		const baseToken = spotMarket.tokensInfo[0]?.name;
		const spotQuoteToken = spotMarket.tokensInfo[1]?.name;
		return (
			(baseToken === DEFAULT_QUOTE_TOKEN && spotQuoteToken === quoteToken) ||
			(baseToken === quoteToken && spotQuoteToken === DEFAULT_QUOTE_TOKEN)
		);
	});

	return hasDirectPair ? quoteToken : null;
}
