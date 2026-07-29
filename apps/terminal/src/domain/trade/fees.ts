import type { UnifiedMarket } from "@gatu/hl-react";
import Big from "big.js";
import { type Numeric, toBig } from "@/lib/trade/numbers";

export const STABLE_PAIR_FEE_SCALE = "0.2";
const GROWTH_MODE_FEE_SCALE = "0.1";

export function applyReferralDiscountToFeeRate(feeRate: Numeric, referralDiscount: Numeric): number | null {
	const parsedFeeRate = toBig(feeRate);
	if (!parsedFeeRate) return null;
	if (parsedFeeRate.lte(0)) return parsedFeeRate.toNumber();

	const parsedDiscount = toBig(referralDiscount);
	if (!parsedDiscount || parsedDiscount.lte(0)) return parsedFeeRate.toNumber();

	const boundedDiscount = parsedDiscount.gte(1) ? Big(1) : parsedDiscount;
	return parsedFeeRate.times(Big(1).minus(boundedDiscount)).toNumber();
}

export function getHip3DeployerFeeScale(deployerFeeScale: Numeric): Big {
	const parsed = toBig(deployerFeeScale);
	if (!parsed || parsed.lt(0)) return Big(1);
	return parsed.lt(1) ? parsed.plus(1) : parsed.times(2);
}

export function applyMarketFeeScale(feeRate: number, market: UnifiedMarket | undefined): number {
	if (!market) return feeRate;

	if (market.kind === "spot") {
		if (!market.isStablePair) return feeRate;
		return Big(feeRate).times(STABLE_PAIR_FEE_SCALE).toNumber();
	}

	if (market.kind !== "builderPerp") return feeRate;

	const growthScaled = market.growthMode === "enabled" ? Big(feeRate).times(GROWTH_MODE_FEE_SCALE) : Big(feeRate);
	if (growthScaled.lte(0)) return growthScaled.toNumber();
	return growthScaled.times(getHip3DeployerFeeScale(market.deployerFeeScale)).toNumber();
}
