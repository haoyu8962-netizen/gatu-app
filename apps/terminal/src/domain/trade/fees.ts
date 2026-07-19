import Big from "big.js";
import { toBig } from "@/lib/trade/numbers";

export function applyReferralDiscountToFeeRate(
	feeRate: string | number | null | undefined,
	referralDiscount: string | number | null | undefined,
): number | null {
	const parsedFeeRate = toBig(feeRate);
	if (!parsedFeeRate) return null;
	if (parsedFeeRate.lte(0)) return parsedFeeRate.toNumber();

	const parsedDiscount = toBig(referralDiscount);
	if (!parsedDiscount || parsedDiscount.lte(0)) return parsedFeeRate.toNumber();

	const boundedDiscount = parsedDiscount.gte(1) ? Big(1) : parsedDiscount;
	return parsedFeeRate.times(Big(1).minus(boundedDiscount)).toNumber();
}
