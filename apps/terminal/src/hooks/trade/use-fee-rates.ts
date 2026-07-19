import { type MarketKind, useInfo } from "@gatu/hl-react";
import {
	ORDER_FEE_RATE_MAKER,
	ORDER_FEE_RATE_SPOT_MAKER,
	ORDER_FEE_RATE_SPOT_TAKER,
	ORDER_FEE_RATE_TAKER,
} from "@/config/trade";
import { applyReferralDiscountToFeeRate } from "@/domain/trade/fees";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";

interface FeeRates {
	takerRate: number;
	makerRate: number;
}

const USER_FEES_STALE_TIME_MS = 30 * 60 * 1000;

function getDefaults(marketKind?: MarketKind): FeeRates {
	if (marketKind === "spot") {
		return { takerRate: ORDER_FEE_RATE_SPOT_TAKER, makerRate: ORDER_FEE_RATE_SPOT_MAKER };
	}
	return { takerRate: ORDER_FEE_RATE_TAKER, makerRate: ORDER_FEE_RATE_MAKER };
}

export function useFeeRates(marketKind?: MarketKind): FeeRates {
	const { address, isConnected } = useWalletSession();
	const defaults = getDefaults(marketKind);
	const user = address ?? "";

	const { data } = useInfo(
		"userFees",
		{ user },
		{ enabled: isConnected && Boolean(address), staleTime: USER_FEES_STALE_TIME_MS, persist: true },
	);

	if (!data) return defaults;

	const isSpot = marketKind === "spot";
	const referralDiscount = data.activeReferralDiscount;
	const takerRate = applyReferralDiscountToFeeRate(
		isSpot ? data.userSpotCrossRate : data.userCrossRate,
		referralDiscount,
	);
	const makerRate = applyReferralDiscountToFeeRate(isSpot ? data.userSpotAddRate : data.userAddRate, referralDiscount);

	return {
		takerRate: takerRate ?? defaults.takerRate,
		makerRate: makerRate ?? defaults.makerRate,
	};
}
