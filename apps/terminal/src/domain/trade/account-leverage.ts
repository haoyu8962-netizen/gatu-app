import type { AllBorrowLendReserveStatesResponse } from "@nktkas/hyperliquid";
import Big from "big.js";
import type { SpotBalance } from "@/hooks/trade/use-account-balances";
import { toBig } from "@/lib/trade/numbers";
import type { AccountOverviewCollateral } from "./account-overview";
import { getTokenAmountUsdValue, type TokenUsdPrices } from "./balances";

export function getAccountLeverageCollateralValue({
	collaterals,
	spotBalances,
	tokenUsdPrices,
	portfolioMargin,
	reserves,
}: {
	collaterals: readonly AccountOverviewCollateral[];
	spotBalances: readonly SpotBalance[];
	tokenUsdPrices: TokenUsdPrices;
	portfolioMargin: boolean;
	reserves?: AllBorrowLendReserveStatesResponse;
}): string | null {
	if (collaterals.some(({ tokenIndex }) => tokenIndex === null)) return null;
	const collateralTokens = new Set(collaterals.map(({ tokenIndex }) => tokenIndex));
	let total = Big(0);
	for (const balance of spotBalances) {
		if (!("token" in balance)) continue;
		const amount = toBig(balance.total);
		if (!amount) return null;
		if (amount.eq(0)) continue;
		if (collateralTokens.has(balance.token)) {
			const value = getTokenAmountUsdValue(balance.total, balance.coin, tokenUsdPrices);
			if (value === null) return null;
			total = total.plus(value);
		} else if (portfolioMargin) {
			if (!reserves) return null;
			const reserve = reserves.find(([token]) => token === balance.token)?.[1];
			if (!reserve) continue;
			const ltv = toBig(reserve.ltv);
			if (!ltv || ltv.lt(0) || ltv.gt(1)) return null;
			if (ltv.eq(0)) continue;
			const price = toBig(reserve.oraclePx);
			if (!price || price.lte(0)) return null;
			total = total.plus(amount.times(price).times(ltv));
		}
	}
	return total.toString();
}
