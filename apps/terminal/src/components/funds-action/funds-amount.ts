import Big from "big.js";

export const USDC_ATOMIC_DECIMALS = 6;
export const HYPE_ATOMIC_DECIMALS = 8;

export type FundsAmountError = "required" | "invalid" | "nonPositive" | "precision" | "unsafe";

export type FundsAmountResult =
	| {
			valid: true;
			displayAmount: string;
			atomicAmount: string;
			atomicNumber: number;
	  }
	| { valid: false; error: FundsAmountError };

const DECIMAL_INPUT_PATTERN = /^\d+(?:\.\d+)?$/;

export function scaleFundsAmount(input: string, decimals: number): FundsAmountResult {
	const trimmed = input.trim();
	if (!trimmed) return { valid: false, error: "required" };
	if (!DECIMAL_INPUT_PATTERN.test(trimmed)) return { valid: false, error: "invalid" };

	let amount: Big;
	try {
		amount = new Big(trimmed);
	} catch {
		return { valid: false, error: "invalid" };
	}
	if (amount.lte(0)) return { valid: false, error: "nonPositive" };

	const atomic = amount.times(new Big(10).pow(decimals));
	if (!atomic.round(0, Big.roundDown).eq(atomic)) return { valid: false, error: "precision" };

	const atomicNumber = Number(atomic.toFixed(0));
	if (!Number.isSafeInteger(atomicNumber) || atomicNumber < 1) return { valid: false, error: "unsafe" };

	return {
		valid: true,
		displayAmount: amount.toFixed(),
		atomicAmount: atomic.toFixed(0),
		atomicNumber,
	};
}

export function compareFundsAmounts(left: string, right: string): -1 | 0 | 1 | null {
	try {
		return new Big(left).cmp(new Big(right)) as -1 | 0 | 1;
	} catch {
		return null;
	}
}

export function floorDecimalToAtomic(value: number, decimals: number): string | null {
	if (!Number.isFinite(value) || value < 0) return null;
	try {
		return new Big(value.toString()).times(new Big(10).pow(decimals)).round(0, Big.roundDown).toFixed(0);
	} catch {
		return null;
	}
}

export function atomicToDecimal(value: string, decimals: number): string | null {
	if (!/^\d+$/.test(value)) return null;
	try {
		return new Big(value).div(new Big(10).pow(decimals)).toFixed();
	} catch {
		return null;
	}
}
