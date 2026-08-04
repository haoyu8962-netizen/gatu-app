import { type Numeric, toNumber } from "@/lib/trade/numbers";

export function getValueColorClass(value: Numeric): "text-success" | "text-error" {
	const num = toNumber(value);
	return num !== null && num >= 0 ? "text-success" : "text-error";
}

export function getMarketCloseValueColorClass(
	value: Numeric,
): "text-market-close-success" | "text-market-close-danger" {
	const num = toNumber(value);
	return num !== null && num >= 0 ? "text-market-close-success" : "text-market-close-danger";
}
