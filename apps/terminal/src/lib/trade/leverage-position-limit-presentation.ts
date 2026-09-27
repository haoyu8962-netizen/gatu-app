import { DEFAULT_QUOTE_TOKEN, FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import type { LeveragePositionLimit } from "@/domain/trade/order/liquidation";
import { formatQuoteAmount, formatUSD } from "@/lib/format";

interface LeveragePositionLimitDisplayInput {
	limit: LeveragePositionLimit;
	quoteSymbol: string | null | undefined;
	noTierLimitLabel: string;
}

/**
 * Formats the leverage dialog's maximum position value. USDC-quoted markets use
 * the dollar format; other collateral uses the quote-aware amount format the
 * terminal uses for builder-perp position values. A capped value without a
 * known quote symbol shows the placeholder instead of guessing a currency.
 */
export function formatLeveragePositionLimit(
	{ limit, quoteSymbol, noTierLimitLabel }: LeveragePositionLimitDisplayInput,
	_numberFormatRevision: number,
): string {
	if (limit.status === "unlimited") return noTierLimitLabel;
	const symbol = quoteSymbol?.trim();
	if (limit.status === "unavailable" || !symbol) return FALLBACK_VALUE_PLACEHOLDER;
	if (symbol === DEFAULT_QUOTE_TOKEN) return formatUSD(limit.maxPositionNotional, { compact: false, decimals: 0 });
	return formatQuoteAmount(limit.maxPositionNotional, symbol, { compact: false, decimals: 0 });
}
