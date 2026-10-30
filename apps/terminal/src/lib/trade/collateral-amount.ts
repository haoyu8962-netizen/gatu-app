import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import type { FormatOptions, NumberFormatters } from "@/lib/format";
import type { UnifiedMarket } from "@/lib/hyperliquid";

/** The token a market's positions settle in: a HIP-3 DEX's collateral, otherwise USDC. */
export function getMarketCollateralSymbol(market: UnifiedMarket | undefined): string {
	return market?.kind === "builderPerp" ? (market.quoteToken?.displayName ?? DEFAULT_QUOTE_TOKEN) : DEFAULT_QUOTE_TOKEN;
}

/**
 * The collateral a funding payment on `coin` settled in, or null when the catalog cannot tell: a
 * HIP-3 market that is no longer listed, or one whose quote token has not loaded. A HIP-3 payment is
 * never labelled USDC by guess; main-DEX perpetuals always settle in USDC.
 */
export function getFundingCollateralSymbol(coin: string, market: UnifiedMarket | undefined): string | null {
	if (market?.kind === "builderPerp") return market.quoteToken?.displayName ?? null;
	if (market) return DEFAULT_QUOTE_TOKEN;
	return coin.includes(":") ? null : DEFAULT_QUOTE_TOKEN;
}

/**
 * An amount a position settles in its collateral (PNL, margin, funding): US dollars for USDC
 * markets, otherwise an amount of the collateral token, like the position value next to it.
 */
export function formatCollateralAmount(
	value: string | number | null | undefined,
	collateralSymbol: string,
	numberFormat: Pick<NumberFormatters, "formatQuoteAmount" | "formatUSD">,
	options: FormatOptions = {},
): string {
	if (collateralSymbol === DEFAULT_QUOTE_TOKEN) {
		return numberFormat.formatUSD(value, { compact: false, currencyDisplay: "narrowSymbol", ...options });
	}
	return numberFormat.formatQuoteAmount(value, collateralSymbol, { compact: false, decimals: 2, ...options });
}
