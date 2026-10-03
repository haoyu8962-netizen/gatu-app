import Big from "big.js";
import type { NumberFormatters } from "@/lib/format";

export function formatTokenBalance(amount: string, decimals: number, numberFormat: NumberFormatters): string {
	const value = Big(amount).div(Big(10).pow(decimals));
	if (value.lt(0.001)) return `<${numberFormat.formatDecimalString("0.001")}`;
	if (value.lt(1)) return numberFormat.formatDecimalString(value.toFixed(4));
	if (value.lt(1000)) return numberFormat.formatDecimalString(value.toFixed(3));
	return numberFormat.formatDecimalString(value.toFixed(2));
}

export function formatTokenAmount(amount: string, decimals: number, numberFormat: NumberFormatters): string {
	const value = Big(amount).div(Big(10).pow(decimals));
	if (value.lt(0.0001)) return `<${numberFormat.formatDecimalString("0.0001")}`;
	if (value.lt(1)) return numberFormat.formatDecimalString(value.toFixed(6));
	if (value.lt(1000)) return numberFormat.formatDecimalString(value.toFixed(4));
	return numberFormat.formatDecimalString(value.toFixed(2));
}

/**
 * Up to `maxSigFigs` significant digits, without rounding away integer digits: Big's toPrecision
 * would write 123456.789 as "1.2346e+5". Amounts of 1 or more round at the same digit as
 * toPrecision and then keep the significant digits of the rounded value (9.99996 -> "10.000").
 */
export function formatSendAmount(amount: string, numberFormat: NumberFormatters, maxSigFigs = 5): string {
	try {
		const value = Big(amount);
		if (value.eq(0)) return "0";
		const sign = value.lt(0) ? "-" : "";
		const abs = value.abs();
		if (abs.gte(1)) {
			const rounded = abs.round(Math.max(0, maxSigFigs - abs.e - 1));
			return numberFormat.formatDecimalString(`${sign}${rounded.toFixed(Math.max(0, maxSigFigs - rounded.e - 1))}`);
		}
		return numberFormat.formatDecimalString(`${sign}${truncateSubUnit(abs.toFixed(18), maxSigFigs)}`);
	} catch {
		return amount;
	}
}

function truncateSubUnit(str: string, maxSigFigs: number): string {
	let sigCount = 0;
	let endIdx = 0;
	for (let i = 2; i < str.length; i++) {
		if (str[i] !== "0" || sigCount > 0) sigCount++;
		if (sigCount >= maxSigFigs) {
			endIdx = i + 1;
			break;
		}
	}
	return endIdx > 0 ? str.slice(0, endIdx) : str;
}

export function isValidUsdInput(value: string): boolean {
	if (!value || value === "." || value === "0") return false;
	try {
		return Big(value).gt(0);
	} catch {
		return false;
	}
}

export function usdToTokenAmount(usd: string, priceUSD: string, decimals: number): string {
	try {
		const price = Big(priceUSD);
		if (price.lte(0)) return "";
		return Big(usd).div(price).toFixed(decimals);
	} catch {
		return "";
	}
}

export function processTypeLabel(type: string): string {
	switch (type) {
		case "TOKEN_ALLOWANCE":
			return "Approval tx";
		case "SWAP":
			return "Swap tx";
		case "CROSS_CHAIN":
			return "Bridge tx";
		case "RECEIVING_CHAIN":
			return "Deposit tx";
		default:
			return "Transaction";
	}
}
