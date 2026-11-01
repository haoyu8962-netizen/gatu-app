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
	const streamStatus = getStreamAvailabilityStatus({
		isConnected: enabled,
		hasData: allMidsEvent !== undefined,
		subscriptionStatus: status,
		isStale,
	});

	return { prices, status: streamStatus === "success" ? getSpotCatalogStatus(markets) : streamStatus };
}

/**
 * A spot token's USD price comes from its market's mid, found through the spot catalog. Until the
 * catalog has loaded, a token without a price may simply be one whose market is not known yet, so the
 * prices count as current only once the catalog is ready; a failed catalog leaves them unavailable.
 */
function getSpotCatalogStatus(markets: { isLoading: boolean; error: Error | null }): AssetAvailabilityStatus {
	if (markets.error) return "error";
	return markets.isLoading ? "loading" : "success";
}

export function useSpotTokenUsdPrices(enabled: boolean): Record<string, string> {
	return useSpotTokenUsdPriceState(enabled).prices;
}
