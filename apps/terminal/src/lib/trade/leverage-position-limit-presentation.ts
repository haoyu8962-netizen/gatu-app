import Big from "big.js";
import { DEFAULT_QUOTE_TOKEN, FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import type { LeveragePositionLimit } from "@/domain/trade/order/liquidation";
import { formatQuoteAmount, formatUSD } from "@/lib/format";
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
 * shown above the real cap.
 */
export function formatLeveragePositionLimit(
	{ limit, quoteSymbol, noTierLimitLabel }: LeveragePositionLimitDisplayInput,
	_numberFormatRevision: number,
): string {
	if (limit.status === "unlimited") return noTierLimitLabel;
	const symbol = quoteSymbol?.trim();
	const maxPositionNotional = limit.status === "limited" ? toBig(limit.maxPositionNotional) : null;
	if (!maxPositionNotional || !symbol) return FALLBACK_VALUE_PLACEHOLDER;

	const displayedNotional = maxPositionNotional.round(0, Big.roundDown).toFixed();
	if (symbol === DEFAULT_QUOTE_TOKEN) return formatUSD(displayedNotional, { compact: false, decimals: 0 });
	return formatQuoteAmount(displayedNotional, symbol, { compact: false, decimals: 0 });
}
