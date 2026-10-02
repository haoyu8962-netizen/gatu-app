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

function getPriceDecimals(price: Big, maxDecimals: number): number {
	const exponent = price.prec(HL_PRICE_MAX_SIG_FIGS).e;
	return Math.min(maxDecimals, Math.max(0, HL_PRICE_MAX_SIG_FIGS - 1 - exponent));
}

function getTickSize(decimals: number): string {
	return TEN.pow(-decimals).toFixed(decimals);
}

function getPreviousDouble(value: number): number {
	const view = new DataView(new ArrayBuffer(8));
	view.setFloat64(0, value);
	view.setBigUint64(0, view.getBigUint64(0) - 1n);
	return view.getFloat64(0);
}

// TradingView gives a band's tick to prices up to and including the band's limit. A price that rounds
// up into the next band at five significant figures (99.9995 → 100.00) must take the coarser tick, so
// each limit is the last double below that rounding threshold.
function getBandLimit(decimals: number): string {
	const roundingThreshold = TEN.pow(HL_PRICE_MAX_SIG_FIGS - decimals).minus(TEN.pow(-decimals).div(2));
	return String(getPreviousDouble(roundingThreshold.toNumber()));
}

function getVariableTickSize(maxDecimals: number): string | undefined {
	if (maxDecimals === 0) return undefined;
	const bands: string[] = [];
	for (let decimals = maxDecimals; decimals > 0; decimals -= 1) {
		bands.push(getTickSize(decimals), getBandLimit(decimals));
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
	const decimals = reference?.gt(0) ? getPriceDecimals(reference, maxDecimals) : maxDecimals;
	const variableTickSize = getVariableTickSize(maxDecimals);
	return variableTickSize
		? { pricescale: 10 ** decimals, variable_tick_size: variableTickSize }
		: { pricescale: 10 ** decimals };
}
