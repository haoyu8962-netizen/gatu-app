import { useMemo } from "react";
import { HL_ALL_DEXS } from "@/config/app";
import { addSpotMarketPriceAliases } from "@/domain/trade/balances";
import { useMarkets, useSubscription } from "@/lib/hyperliquid";

export function useSpotTokenUsdPrices(enabled: boolean) {
	const markets = useMarkets();
	const { data: allMidsEvent } = useSubscription("allMids", { dex: HL_ALL_DEXS }, { enabled });

	return useMemo(() => addSpotMarketPriceAliases(allMidsEvent?.mids, markets.spot), [allMidsEvent?.mids, markets.spot]);
}
