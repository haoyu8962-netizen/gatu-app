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
	markPx?: number;
	marginNotionalForSize?: (size: string) => number | undefined;
}

interface PerpEntryMarginInput {
	maxTradeSize: Numeric;
	markPx: Numeric;
	szDecimals: number;
	/** What a perp order of this total size reserves margin on; undefined when it executes at mark. */
	marginNotionalForSize?: (size: string) => number | undefined;
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
	return getPerpEntryMaxSize({
		maxTradeSize,
		markPx: input.markPx ?? 0,
		szDecimals: input.szDecimals,
		marginNotionalForSize: input.marginNotionalForSize,
	});
}

/**
 * The price a resting perp order reserves margin at, as the official terminal sizes it: a buy below
 * mark or a sell above mark at its own price, an order that crosses mark at mark.
 */
export function getRestingMarginPrice(side: Side, markPx: Big, orderPx: Big): Big {
	if (side === "buy") return orderPx.lt(markPx) ? orderPx : markPx;
	return orderPx.gt(markPx) ? orderPx : markPx;
}

function getPerpMarginBudget(input: PerpEntryMarginInput): Big | null {
	const maxTradeSize = toBig(input.maxTradeSize);
	const mark = toBig(input.markPx);
	if (!maxTradeSize?.gt(0) || !mark?.gt(0)) return null;
	return maxTradeSize.times(mark);
}

const MAX_SIZE_SEARCH_DOUBLINGS = 80;

function fitsPerpMarginBudget(input: PerpEntryMarginInput, budget: Big, maxTradeSize: Big, size: string): boolean {
	const marginNotional = toBig(input.marginNotionalForSize?.(size));
	return marginNotional ? marginNotional.lte(budget) : Big(size).lte(maxTradeSize);
}

/**
 * The exchange's `maxTradeSzs` is a size at mark. A resting order reserves margin at its own price
 * (`getRestingMarginPrice`), so this is the largest whole-lot size whose margin fits that budget:
 * found by doubling and then bisecting lot counts, with every candidate checked against the budget,
 * because a scale order's lot split is not a straight line through its average price. A size too
 * small to split into levels has no margin yet and keeps the search going upward, but is never the
 * answer: when even the smallest size that splits exceeds the budget, the maximum is zero.
 */
export function getPerpEntryMaxSize(input: PerpEntryMarginInput): number {
	const maxTradeSize = toBig(input.maxTradeSize);
	if (!maxTradeSize?.gt(0)) return 0;
	const budget = getPerpMarginBudget(input);
	if (!budget || !input.marginNotionalForSize) return maxTradeSize.toNumber();
	const lot = Big(1).div(Big(10).pow(input.szDecimals));
	const marginForLots = (lots: Big) => toBig(input.marginNotionalForSize?.(lots.times(lot).toFixed(input.szDecimals)));
	const fits = (lots: Big) => {
		const marginNotional = marginForLots(lots);
		return !marginNotional || marginNotional.lte(budget);
	};
	let fitting = Big(0);
	let exceeding = Big(1);
	for (let step = 0; step < MAX_SIZE_SEARCH_DOUBLINGS && fits(exceeding); step += 1) {
		fitting = exceeding;
		exceeding = exceeding.times(2);
	}
	if (fits(exceeding)) return maxTradeSize.toNumber();
	while (exceeding.minus(fitting).gt(1)) {
		const middle = fitting.plus(exceeding).div(2).round(0, Big.roundDown);
		if (fits(middle)) fitting = middle;
		else exceeding = middle;
	}
	return marginForLots(fitting) ? fitting.times(lot).toNumber() : 0;
}

/**
 * Whether a perp entry size reserves more margin than the exchange's maximum at mark allows. A side
 * with no capacity fails closed for any size, as the official terminal's `size > maxTradeSz` does.
 */
export function exceedsPerpEntryMaxSize(input: PerpEntryMarginInput & { size: string }): boolean {
	const size = toBig(input.size);
	if (!size?.gt(0)) return false;
	const maxTradeSize = toBig(input.maxTradeSize);
	if (!maxTradeSize?.gt(0)) return true;
	const budget = getPerpMarginBudget(input);
	if (!budget) return size.gt(maxTradeSize);
	return !fitsPerpMarginBudget(input, budget, maxTradeSize, input.size);
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
