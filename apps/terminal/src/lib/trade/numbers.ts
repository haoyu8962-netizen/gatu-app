import Big from "big.js";

export type { Big };

export type Numeric = string | number | null | undefined | Big;

export const BIG_ZERO = Big(0);

export function toBig(value: Numeric): Big | null {
	if (value == null || value === "") return null;
	if (value instanceof Big) return value;
	try {
		if (typeof value === "number") {
			if (!Number.isFinite(value)) return null;
			return new Big(value);
		}
		const trimmed = (value as string).trim();
		return trimmed ? new Big(trimmed) : null;
	} catch {
		return null;
	}
}

export function toSafeBig(value: Numeric): Big {
	return toBig(value) ?? BIG_ZERO;
}

export function toNumber(value: Numeric): number | null {
	const big = toBig(value);
	if (!big) return null;
	const num = big.toNumber();
	return Number.isFinite(num) ? num : null;
}

export function toNumberOrZero(value: Numeric): number {
	return toNumber(value) ?? 0;
}

export function isPositive(value: Numeric): value is number {
	const num = toNumber(value);
	return num !== null && num > 0;
}

export function clamp(value: number, min: number, max: number): number {
	const big = toBig(value);
	if (!big) return min;
	const minBig = toBig(min);
	const maxBig = toBig(max);
	if (!minBig || !maxBig) return min;
	if (big.lt(minBig)) return min;
	if (big.gt(maxBig)) return max;
	return big.toNumber();
}

export function clampInt(value: number, min: number, max: number): number {
	return Math.round(clamp(value, min, max));
}

export function toFixed(value: Numeric, decimals: number): string {
	const big = toBig(value);
	if (!big) return "0";
	return big.toFixed(decimals);
}

export function floor(value: Numeric, decimals: number): number | null {
	const big = toBig(value);
	if (!big) return null;
	const factor = new Big(10).pow(decimals);
	const floored = big.times(factor).round(0, Big.roundDown).div(factor);
	return floored.toNumber();
}

/** A decimal such as a typed amount ("0005", "5.") in plain notation with every digit kept, or null. */
export function toPlainDecimal(value: Numeric): string | null {
	return toBig(value)?.toFixed() ?? null;
}

export function floorToString(value: Numeric, decimals: number): string {
	const big = toBig(value);
	return big === null ? "0" : big.round(decimals, Big.roundDown).toFixed(decimals);
}

export function floorToDecimals(value: number, maxDecimals: number): number {
	return floor(value, maxDecimals) ?? Number.NaN;
}

/**
 * Floors to `maxDecimals` and drops trailing zeros, but keeps at least `minDecimals` places on a nonzero value
 * (12.5 reads 12.50 with two), so an amount the terminal fills in shows cents without losing exact digits.
 */
export function formatDecimalFloor(value: Numeric, maxDecimals: number, minDecimals = 0): string {
	const fixed = floorToString(value, maxDecimals);
	const trimmed = fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
	const minimum = Math.min(minDecimals, maxDecimals);
	if (trimmed === "0" || minimum <= 0) return trimmed;
	const pointIndex = trimmed.indexOf(".");
	const decimals = pointIndex === -1 ? 0 : trimmed.length - pointIndex - 1;
	if (decimals >= minimum) return trimmed;
	return `${trimmed}${pointIndex === -1 ? "." : ""}${"0".repeat(minimum - decimals)}`;
}

/**
 * Decimals the official terminal shows for one price (its `L3`): five significant figures, never more than the
 * market's protocol decimals. The same rule gives the finest order book grouping (`getPriceGroupingOptions`).
 *
 * @example getPriceDisplayDecimals(85.81, 4) -> 3 (HYPE shows 85.810)
 * @example getPriceDisplayDecimals(88140.5, 2) -> 0 (BTC shows 88,141)
 */
export function getPriceDisplayDecimals(price: number, maxDecimals: number): number {
	const magnitude = Math.abs(price);
	if (!Number.isFinite(magnitude) || magnitude === 0) return maxDecimals;
	return Math.max(0, Math.min(4 - Math.floor(Math.log10(magnitude)), maxDecimals));
}

/**
 * A price rounded half up to the decimals the official terminal shows for it, with every one of those decimals kept.
 * The decimals follow the rounded price, so 99.9996 under a cap of four reads 100.00, not 100.000.
 */
export function formatPriceAtDisplayDecimals(price: Big, maxDecimals: number): string {
	const rounded = price.round(getPriceDisplayDecimals(price.toNumber(), maxDecimals), Big.roundHalfUp);
	return rounded.toFixed(getPriceDisplayDecimals(rounded.toNumber(), maxDecimals));
}

export function limitDecimalInput(input: string, maxDecimals: number): string {
	if (!input) return input;
	const decimalIndex = input.indexOf(".");
	if (decimalIndex === -1) return input;
	const decimalsInInput = input.length - decimalIndex - 1;
	if (decimalsInInput <= maxDecimals) return input;
	return input.slice(0, decimalIndex + maxDecimals + 1);
}
