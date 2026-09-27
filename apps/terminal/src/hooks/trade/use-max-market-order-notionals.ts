import type { MaxMarketOrderNtlsResponse } from "@nktkas/hyperliquid";
import { useInfo } from "@/lib/hyperliquid";

const MAX_MARKET_ORDER_NOTIONALS_CACHE_MS = 30 * 60_000;

export function useMaxMarketOrderNotionals(enabled: boolean): MaxMarketOrderNtlsResponse | undefined {
	const query = useInfo("maxMarketOrderNtls", undefined, {
		enabled,
		staleTime: MAX_MARKET_ORDER_NOTIONALS_CACHE_MS,
		gcTime: MAX_MARKET_ORDER_NOTIONALS_CACHE_MS,
	});
	return query.isSuccess ? query.data : undefined;
}
