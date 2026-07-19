import { DEFAULT_SELECTED_MARKETS } from "@/config/markets";
import { getTradePathForMarketName } from "@/lib/hyperliquid/market-route";
import { useSelectedMarkets } from "@/stores/use-market-store";

export function useTradeHomePath(): string {
	const selectedMarkets = useSelectedMarkets();
	return getTradePathForMarketName(selectedMarkets.all ?? DEFAULT_SELECTED_MARKETS.all);
}
