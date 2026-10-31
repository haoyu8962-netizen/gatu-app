import Big from "big.js";
import { QUOTE_SIZE_INPUT_MAX_DECIMALS } from "@/config/trade";
import type { SpotBalanceData } from "@/domain/trade/balances";
import { floorToDecimals, type Numeric, toBig } from "@/lib/trade/numbers";
import type { Side, SizeMode } from "@/lib/trade/types";

interface MaxSizeInput {
	isConnected: boolean;
	maxTradeSzs: [number, number] | null;
	szDecimals?: number;
	side: Side;
}

interface OrderEntryMaxSizeInput {
	isConnected: boolean;
	isSpotMarket: boolean;
	side: Side;
	price: Numeric;
	spotBalance: SpotBalanceData;
	szDecimals: number;
	maxTradeSzs: [number, number] | null;
}

interface SizeValueInput {
	sizeInput: string;
	sizeMode: SizeMode;
	price: number;
	szDecimals: number;
}

interface SizeValueResult {
	sizeInputValue: number;
	sizeValue: number;
}

interface SizeValuesInput {
	sizeInput: string;
	sizeMode: SizeMode;
	conversionPx: number;
}

interface SizeForPercentInput {
	pct: number;
	isSpotMarket: boolean;
	side: Side;
	sizeMode: SizeMode;
	price: number;
	maxSize: number;
	spotBalance: SpotBalanceData;
	szDecimals: number;
}

interface SizeModeToggleInput {
	sizeValue: number;
	sizeMode: SizeMode;
	price: number;
	szDecimals: number;
}

function formatSizeValue(value: Numeric, decimals: number): string {
	const size = toBig(value);
	if (!size || size.lte(0)) return "0";
	const fixed = size.toFixed(decimals, Big.roundDown);
	return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

export function getMaxSizeForOrderEntry(input: OrderEntryMaxSizeInput): number {
	if (!input.isConnected) return 0;

	const isBuy = input.side === "buy";

	if (input.isSpotMarket) {
		if (isBuy) {
			const quote = toBig(input.spotBalance.quoteAvailable);
			const px = toBig(input.price);
			if (!quote || !px || quote.lte(0) || px.lte(0)) return 0;
			const floored = quote.div(px).round(input.szDecimals, Big.roundDown).toNumber();
			return Number.isFinite(floored) ? floored : 0;
		}
		const floored = floorToDecimals(input.spotBalance.baseAvailable, input.szDecimals);
		return Number.isFinite(floored) ? floored : 0;
	}

	const maxTradeSize = input.maxTradeSzs?.[isBuy ? 0 : 1];
	if (maxTradeSize == null || !Number.isFinite(maxTradeSize) || maxTradeSize <= 0) return 0;
	return maxTradeSize;
}

export function getMaxSize(input: MaxSizeInput): number {
	if (!input.isConnected) return 0;

	const maxTradeSize = input.maxTradeSzs?.[input.side === "buy" ? 0 : 1] ?? 0;
	if (maxTradeSize > 0) {
		const floored = floorToDecimals(maxTradeSize, input.szDecimals ?? 0);
		return Number.isFinite(floored) ? floored : 0;
	}
	return 0;
}

export function getSizeStringFromInput(input: SizeValueInput): string {
	const inputVal = toBig(input.sizeInput);
	if (!inputVal || inputVal.lte(0)) return "0";
	if (input.sizeMode === "base") return inputVal.toFixed();
	const px = toBig(input.price);
	if (!px || px.lte(0)) return "0";
	return inputVal.div(px).round(input.szDecimals, Big.roundDown).toFixed();
}
const MAX_QUOTE_CAP_STEPS = 200;

/**
 * Lowers a size converted from a quote amount by whole lots until what it actually costs (a scale
 * order's lot-rounded levels) is no more than the amount typed, as size × price already is for other
 * orders. The size stays unchanged when its cost cannot be computed or no smaller size fits within
 * the step limit.
 */
export function capSizeToQuoteAmount(
	size: string,
	quoteAmount: string,
	szDecimals: number,
	valueForSize: (size: string) => number | undefined,
): string {
	const limit = toBig(quoteAmount);
	const start = toBig(size);
	if (!limit?.gt(0) || !start?.gt(0)) return size;
	const lot = Big(1).div(Big(10).pow(szDecimals));
	let candidate = start;
	for (let step = 0; step <= MAX_QUOTE_CAP_STEPS && candidate.gt(0); step += 1) {
		const candidateSize = candidate.toFixed(szDecimals);
		const value = valueForSize(candidateSize);
		if (value === undefined) return size;
		if (Big(value).lte(limit)) return step === 0 ? size : candidateSize;
		candidate = candidate.minus(lot);
	}
	return size;
}

export function getSizeValueFromInput(input: SizeValueInput): number {
	const value = Number(getSizeStringFromInput(input));
	return Number.isFinite(value) ? value : 0;
}

export function getOrderValue(sizeValue: number, price: number): number {
	const sz = toBig(sizeValue);
	const px = toBig(price);
	if (!sz || !px || sz.lte(0) || px.lte(0)) return 0;
	return sz.times(px).toNumber();
}

export function getSizeValues(input: SizeValuesInput): SizeValueResult {
	const sizeInput = toBig(input.sizeInput) ?? Big(0);
	const sizeInputValue = sizeInput.toNumber();
	const convPx = toBig(input.conversionPx);
	const sizeValue = input.sizeMode === "quote" && convPx?.gt(0) ? sizeInput.div(convPx).toNumber() : sizeInputValue;
	return { sizeInputValue, sizeValue };
}

export function getSizeForPercent(input: SizeForPercentInput): string {
	const isBuy = input.side === "buy";
	const isQuoteMode = input.sizeMode === "quote";
	const pct = Big(input.pct).div(100);

	if (input.isSpotMarket) {
		if (isBuy) {
			if (isQuoteMode) {
				const quoteAmount = Big(input.maxSize).times(input.price).times(pct);
				return quoteAmount.toFixed(QUOTE_SIZE_INPUT_MAX_DECIMALS, Big.roundDown);
			}
			const tokenAmount = Big(input.maxSize).times(pct);
			return formatSizeValue(tokenAmount, input.szDecimals);
		}

		if (isQuoteMode) {
			if (input.price <= 0) return "";
			const tokenAmount = Big(input.spotBalance.baseAvailable).times(pct);
			const quoteAmount = tokenAmount.times(input.price);
			return quoteAmount.toFixed(QUOTE_SIZE_INPUT_MAX_DECIMALS, Big.roundDown);
		}
		const tokenAmount = Big(input.spotBalance.baseAvailable).times(pct);
		return formatSizeValue(tokenAmount, input.szDecimals);
	}

	if (input.maxSize <= 0) return "";
	const size = Big(input.maxSize).times(pct);

	if (isQuoteMode) {
		if (input.price <= 0) return "";
		return size.times(input.price).toFixed(QUOTE_SIZE_INPUT_MAX_DECIMALS, Big.roundDown);
	}
	return formatSizeValue(size, input.szDecimals);
}

export function getSizeValueForModeToggle(input: SizeModeToggleInput): string {
	if (input.sizeValue <= 0 || input.price <= 0) return "";

	if (input.sizeMode === "base") {
		return Big(input.sizeValue).times(input.price).toFixed(QUOTE_SIZE_INPUT_MAX_DECIMALS, Big.roundDown);
	}
	return formatSizeValue(input.sizeValue, input.szDecimals);
}

export function getSliderValue(sizeValue: number, maxSize: number): number {
	const sz = toBig(sizeValue);
	const max = toBig(maxSize);
	if (!sz || !max || sz.lte(0) || max.lte(0)) return 0;
	return Math.min(100, sz.div(max).times(100).toNumber());
}

export function formatSliderPercent(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return "0";
	return Math.min(100, value).toFixed(0);
}

export function getSizeInputMaxDecimals(sizeMode: SizeMode, szDecimals: number): number {
	return sizeMode === "quote" ? QUOTE_SIZE_INPUT_MAX_DECIMALS : szDecimals;
}

/** Select in base first. The rounded quote string is presentation, never the execution source. */
export function getReduceOnlySizeSelection(
	maxBase: string,
	pct: number,
	sizeMode: SizeMode,
	price: number,
	szDecimals: number,
) {
	const max = toBig(maxBase);
	if (!max?.gt(0) || !Number.isFinite(pct) || pct < 0 || pct > 100) return null;
	const baseSize = max.times(pct).div(100).round(szDecimals, Big.roundDown).toFixed();
	const size = getSelectedSizeDisplay(baseSize, sizeMode, price);
	return size === null ? null : { size, baseSize };
}
export function getSelectedSizeDisplay(baseSize: string, sizeMode: SizeMode, price: number): string | null {
	const base = toBig(baseSize);
	if (!base || base.lt(0)) return null;
	if (sizeMode === "base") return base.toFixed();
	const px = toBig(price);
	return px?.gt(0) ? base.times(px).toFixed(QUOTE_SIZE_INPUT_MAX_DECIMALS, Big.roundDown) : null;
}
