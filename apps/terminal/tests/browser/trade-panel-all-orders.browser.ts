import { useSyncExternalStore } from "react";
import { useSelectedMarketInfo as useOrderbookMarket } from "./mobile-orderbook-cls.browser";


export {
	getExplorerTxUrl,
	useHyperliquid,
	useOrderbookFeed,
	useOrderbookMidPrice,
	useSubscription,
} from "./mobile-orderbook-cls.browser";

const walletSession = { isConnected: true };
const marketListeners = new Set<() => void>();
let hoverMarket = {
	name: "CLS_HYPE",
	kind: "perp",
	markPx: "100" as string | undefined,
	midPx: "100" as string | undefined,
	markPriceStatus: "success",
	markPriceReceivedAt: Date.now(),
	midPriceReceivedAt: Date.now(),
};

export function setBrowserOrderbookReference(price: string | undefined, ready = true) {
	hoverMarket = {
		...hoverMarket,
		markPx: price,
		midPx: price,
		markPriceStatus: ready ? "success" : "stale",
		markPriceReceivedAt: Date.now(),
		midPriceReceivedAt: Date.now(),
	};
	for (const listener of marketListeners) listener();
}

export function useMarketsInfo() {
	const market = useSyncExternalStore(
		(listener) => {
			marketListeners.add(listener);
			return () => marketListeners.delete(listener);
		},
		() => hoverMarket,
	);
	return { getMarketByName: (name: string) => (name === market.name ? market : undefined) };
}

export function useWalletSession() {
	return walletSession;
}

export function useSelectedMarketInfo() {
	const market = useOrderbookMarket();
	return { ...market, data: { ...market.data, assetId: 0 } };
}
