import Big from "big.js";
import { toBig } from "@/lib/trade/numbers";

interface OrderMetricsInput {
	sizeValue: number;
	price: number;
	leverage: number | null;
	reduceOnly?: boolean;
	/** A scale order's value summed over its lot-rounded levels; margin follows it instead of size × price. */
	scaleOrderValue?: number;
}

interface OrderMetricsResult {
	marginRequired: number | null;
}

export function getOrderMetrics(input: OrderMetricsInput): OrderMetricsResult {
	const sz = toBig(input.sizeValue);
	const px = toBig(input.price);
	const orderValue = input.scaleOrderValue ?? (sz && px ? sz.times(px).toNumber() : 0);
	const marginRequired = input.leverage ? Big(orderValue).div(input.leverage).toNumber() : 0;
	return { marginRequired: input.reduceOnly ? null : marginRequired };
}
