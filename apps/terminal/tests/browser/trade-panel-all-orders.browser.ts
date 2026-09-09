import { useSelectedMarketInfo as useOrderbookMarket } from "./mobile-orderbook-cls.browser";

export { getMidReferencePrice } from "../../src/hooks/trade/use-orderbook-mid-price";

export {
	getExplorerTxUrl,
	useHyperliquid,
	useOrderbookFeed,
	useOrderbookMidPrice,
	useSubscription,
} from "./mobile-orderbook-cls.browser";

const walletSession = { isConnected: true };

export function useWalletSession() {
	return walletSession;
}

export function useSelectedMarketInfo() {
	const market = useOrderbookMarket();
	return { ...market, data: { ...market.data, assetId: 0 } };
}
