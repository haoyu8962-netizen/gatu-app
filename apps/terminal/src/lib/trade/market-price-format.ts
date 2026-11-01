import { HL_PRICE_MAX_DECIMALS } from "@/config/trade";
import type { FormatPriceOptions } from "@/lib/format";

interface PriceFormatMarket {
	kind?: string;
	szDecimals?: number;
}

/**
 * Format options for a market's protocol prices (fills, order limits and triggers): the market's
 * tick precision, never compact notation. Without market metadata every protocol decimal is kept,
 * so an exact price is never shortened to two decimals.
 */
export function getMarketPriceFormatOptions(market: PriceFormatMarket | null | undefined): FormatPriceOptions {
	if (market?.szDecimals === undefined) return { decimals: HL_PRICE_MAX_DECIMALS };
	return { szDecimals: market.szDecimals, marketType: market.kind === "spot" ? "spot" : "perp" };
}
