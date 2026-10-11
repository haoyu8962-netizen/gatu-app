import type { MaxBuilderFeeResponse } from "@nktkas/hyperliquid";

export function isBuilderFeeApproved(
	maxBuilderFee: MaxBuilderFeeResponse | undefined,
	requiredFee: number | string | undefined,
): boolean {
	if (maxBuilderFee === undefined || requiredFee === undefined) return false;
	const requiredFeeNum = typeof requiredFee === "string" ? Number(requiredFee) : requiredFee;
	return maxBuilderFee >= requiredFeeNum;
}

export function convertFeeToPercentageString(fee: number | string): string {
	const feeNum = typeof fee === "string" ? Number(fee) : fee;
	const percentage = feeNum / 1000;
	return `${percentage}%`;
}
