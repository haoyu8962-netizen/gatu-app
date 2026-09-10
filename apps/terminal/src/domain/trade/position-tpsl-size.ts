import Big from "big.js";
import { type Numeric, toBig } from "@/lib/trade/numbers";

export function getPositionTpSlSizeForPercent(positionSize: Numeric, percent: number, szDecimals: number): string {
	const size = toBig(positionSize);
	if (!size?.gt(0) || !Number.isFinite(percent)) return "0";
	const boundedPercent = Math.min(100, Math.max(0, Math.round(percent)));
	return size.times(boundedPercent).div(100).toFixed(szDecimals, Big.roundDown);
}

export function getPositionTpSlSizePercent(sizeInput: Numeric, positionSize: Numeric): number {
	const size = toBig(sizeInput);
	const max = toBig(positionSize);
	if (!size?.gt(0) || !max?.gt(0)) return 0;
	return Math.min(100, size.div(max).times(100).toNumber());
}
