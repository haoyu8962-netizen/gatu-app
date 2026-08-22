import Big from "big.js";
import { toBig } from "@/lib/trade/numbers";

interface OrderMetricsInput {
	sizeValue: number;
	price: number;
	leverage: number | null;
}

interface OrderMetricsResult {
	marginRequired: number;
}

export function getOrderMetrics(input: OrderMetricsInput): OrderMetricsResult {
	const sz = toBig(input.sizeValue);
	const px = toBig(input.price);
	const orderValue = sz && px ? sz.times(px).toNumber() : 0;
	const marginRequired = input.leverage ? Big(orderValue).div(input.leverage).toNumber() : 0;
	return { marginRequired };
}
