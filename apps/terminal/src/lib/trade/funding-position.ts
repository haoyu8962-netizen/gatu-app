import { msg } from "@lingui/core/macro";
import { getToolbarAbsoluteSize } from "@/domain/trade/trading-toolbar-metrics";
import type { NumberFormatters } from "@/lib/format";
import type { UnifiedMarket } from "@/lib/hyperliquid";
import { getFundingHistorySide } from "@/lib/trade/funding-history";
import type { Translate } from "@/lib/translate";

export interface FundingPositionPresentation {
	side: ReturnType<typeof getFundingHistorySide>;
	sideLabel: string | null;
	size: string;
}

/**
 * The position a funding payment was charged on, with its side: the exchange reports a signed
 * size, and its absolute value alone would hide whether a long paid or a short received.
 */
export function getFundingPositionPresentation(
	szi: string,
	market: UnifiedMarket | undefined,
	formatToken: NumberFormatters["formatToken"],
	translate: Translate,
): FundingPositionPresentation {
	const size = formatToken(getToolbarAbsoluteSize(szi), { decimals: market?.szDecimals, symbol: market?.shortName });
	return { side: getFundingHistorySide(szi), sideLabel: getFundingSideLabel(szi, translate), size };
}

/** The side of the position a funding payment was charged on, or `null` for a flat one. */
export function getFundingSideLabel(szi: string, translate: Translate): string | null {
	const side = getFundingHistorySide(szi);
	if (side === null) return null;
	return translate(side === "long" ? msg`Long` : msg`Short`);
}
