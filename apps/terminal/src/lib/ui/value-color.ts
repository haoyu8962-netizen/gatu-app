import { type Numeric, toNumber } from "@/lib/trade/numbers";

export function getValueColorClass(value: Numeric): "text-success" | "text-error" {
	const num = toNumber(value);
	return num !== null && num >= 0 ? "text-success" : "text-error";
}
