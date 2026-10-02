import Big from "big.js";
import { DEFAULT_QUOTE_TOKEN, FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import type { LeveragePositionLimit } from "@/domain/trade/order/liquidation";
import type { NumberFormatters } from "@/lib/format";
import { toBig } from "@/lib/trade/numbers";

interface LeveragePositionLimitDisplayInput {
	limit: LeveragePositionLimit;
	quoteSymbol: string | null | undefined;
	noTierLimitLabel: string;
}

/**
 * Formats the leverage dialog's maximum position value. USDC-quoted markets use
 * the dollar format; other collateral uses the quote-aware amount format the
 * terminal uses for builder-perp position values. A capped value without a
 * known quote symbol shows the placeholder instead of guessing a currency. The
 * whole-unit display truncates toward zero so a fractional tier bound is never
 * shown above the real cap. The shared formatters convert to a JavaScript
 * number, so a truncated bound above `Number.MAX_SAFE_INTEGER` could round up
 * again; such a bound shows the placeholder instead.
 */
export function formatLeveragePositionLimit(
	{ limit, quoteSymbol, noTierLimitLabel }: LeveragePositionLimitDisplayInput,
	numberFormat: NumberFormatters,
): string {
	if (limit.status === "unlimited") return noTierLimitLabel;
	const symbol = quoteSymbol?.trim();
	const maxPositionNotional = limit.status === "limited" ? toBig(limit.maxPositionNotional) : null;
	if (!maxPositionNotional || !symbol) return FALLBACK_VALUE_PLACEHOLDER;

	const truncatedNotional = maxPositionNotional.round(0, Big.roundDown);
	if (truncatedNotional.gt(Number.MAX_SAFE_INTEGER)) return FALLBACK_VALUE_PLACEHOLDER;

	const displayedNotional = truncatedNotional.toFixed();
	if (symbol === DEFAULT_QUOTE_TOKEN) return numberFormat.formatUSD(displayedNotional, { compact: false, decimals: 0 });
	return numberFormat.formatQuoteAmount(displayedNotional, symbol, { compact: false, decimals: 0 });
}
