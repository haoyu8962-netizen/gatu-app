import { useMemo } from "react";
import { HL_ALL_DEXS } from "@/config/app";
import { addSpotMarketPriceAliases } from "@/domain/trade/balances";
import { type AssetAvailabilityStatus, getStreamAvailabilityStatus } from "@/domain/trade/order/availability";
import { useMarkets, useSubscription } from "@/lib/hyperliquid";

interface SpotTokenUsdPriceState {
	prices: Record<string, string>;
	status: AssetAvailabilityStatus;
}

export function useSpotTokenUsdPriceState(enabled: boolean): SpotTokenUsdPriceState {
	const markets = useMarkets();
	const { data: allMidsEvent, status, isStale } = useSubscription("allMids", { dex: HL_ALL_DEXS }, { enabled });
	const prices = useMemo(
		() => addSpotMarketPriceAliases(allMidsEvent?.mids, markets.spot) ?? {},
		[allMidsEvent?.mids, markets.spot],
	);
	const priceStatus = getStreamAvailabilityStatus({
		isConnected: enabled,
		hasData: allMidsEvent !== undefined,
		subscriptionStatus: status,
		isStale,
	});

	return { prices, status: priceStatus };
}

export function useSpotTokenUsdPrices(enabled: boolean): Record<string, string> {
	return useSpotTokenUsdPriceState(enabled).prices;
}
