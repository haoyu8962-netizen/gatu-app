import { HL_PRICE_MAX_DECIMALS } from "@/config/trade";
import { type FormatPriceOptions, szDecimalsToPriceDecimals } from "@/lib/format";

interface PriceFormatMarket {
	kind?: string;
	szDecimals?: number;
}

/**
 * Format options for a market's protocol prices in history tables (fills, order limits and triggers, TWAP
 * averages): every decimal the market's tick allows, trailing zeros removed, never compact notation. An average
 * fill price can carry more digits than a tick, so history keeps them rather than the five-significant-figure
 * market display that `formatPrice` gives a bare `szDecimals` (AGENTS.md, History values). Without market
 * metadata every protocol decimal is kept, so an exact price is never shortened to two decimals.
 */
export function getMarketPriceFormatOptions(market: PriceFormatMarket | null | undefined): FormatPriceOptions {
	if (market?.szDecimals === undefined) return { decimals: HL_PRICE_MAX_DECIMALS };
	return { decimals: szDecimalsToPriceDecimals(market.szDecimals, market.kind === "spot" ? "spot" : "perp") };
}
