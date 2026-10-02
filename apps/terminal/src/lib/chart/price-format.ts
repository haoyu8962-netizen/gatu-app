import Big from "big.js";
import { HL_PRICE_MAX_SIG_FIGS } from "@/config/trade";
import { szDecimalsToPriceDecimals } from "@/lib/format";
import { type Numeric, toBig } from "@/lib/trade/numbers";

export type ChartPriceMarketType = "perp" | "spot";

export interface ChartPriceFormat {
	pricescale: number;
	variable_tick_size?: string;
}

const TEN = new Big(10);

function getMaxPriceDecimals(szDecimals: number | undefined, marketType: ChartPriceMarketType): number {
	if (szDecimals === undefined || !Number.isSafeInteger(szDecimals) || szDecimals < 0) {
		return szDecimalsToPriceDecimals(0, marketType);
	}
	return szDecimalsToPriceDecimals(szDecimals, marketType);
}

function getPriceDecimalsAtExponent(exponent: number, maxDecimals: number): number {
	return Math.min(maxDecimals, Math.max(0, HL_PRICE_MAX_SIG_FIGS - 1 - exponent));
}

function getTickSize(decimals: number): string {
	return TEN.pow(-decimals).toFixed(decimals);
}

// TradingView applies a band's tick up to and including the band's price limit, so each limit is
// the largest five-significant-figure price that still has the band's decimals (9.9999, 99.999, …).
function getLargestPriceWithDecimals(decimals: number): string {
	return TEN.pow(HL_PRICE_MAX_SIG_FIGS - decimals)
		.minus(TEN.pow(-decimals))
		.toFixed(decimals);
}

function getVariableTickSize(maxDecimals: number): string | undefined {
	if (maxDecimals === 0) return undefined;
	const bands: string[] = [];
	for (let decimals = maxDecimals; decimals > 0; decimals -= 1) {
		bands.push(getTickSize(decimals), getLargestPriceWithDecimals(decimals));
	}
	bands.push(getTickSize(0));
	return bands.join(" ");
}

export function getChartPriceFormat(
	szDecimals: number | undefined,
	marketType: ChartPriceMarketType,
	referencePrice: Numeric,
): ChartPriceFormat {
	const maxDecimals = getMaxPriceDecimals(szDecimals, marketType);
	const reference = toBig(referencePrice);
	const decimals = reference?.gt(0) ? getPriceDecimalsAtExponent(reference.e, maxDecimals) : maxDecimals;
	const variableTickSize = getVariableTickSize(maxDecimals);
	return variableTickSize
		? { pricescale: 10 ** decimals, variable_tick_size: variableTickSize }
		: { pricescale: 10 ** decimals };
}
