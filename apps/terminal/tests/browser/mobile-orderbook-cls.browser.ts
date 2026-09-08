import { useSyncExternalStore } from "react";

export type BrowserOrderbookLevel = { n: number; px: string; sz: string };
export type BrowserOrderbookEvent = {
	coin: string;
	fast: true;
	levels: [BrowserOrderbookLevel[], BrowserOrderbookLevel[]];
	time: number;
};

const listeners = new Set<() => void>();
const hyperliquidContext = { env: "Mainnet" };
const selectedMarket = {
	data: {
		kind: "perp",
		markPx: "100.05",
		name: "CLS_HYPE",
		pairName: "CLS_HYPE-USDC",
		szDecimals: 2,
	},
};
const pendingSubscription = {
	data: undefined,
	error: undefined,
	isStale: false,
	lastMessageAt: undefined,
	status: "pending",
};
const midPrice = {
	bestAsk: "100.10",
	bestBid: "100.00",
	isStale: false,
	midPx: "100.05",
	snapshot: {},
	status: "active",
};

let orderbookSnapshot:
	| typeof pendingSubscription
	| {
			data: BrowserOrderbookEvent;
			error: undefined;
			isStale: false;
			lastMessageAt: number;
			source: "l2Book-fast";
			status: "active";
	  } = pendingSubscription;

function notifyOrderbookListeners() {
	for (const listener of listeners) listener();
}

export function setBrowserOrderbookPending() {
	orderbookSnapshot = pendingSubscription;
	notifyOrderbookListeners();
}

export function setBrowserOrderbookEvent(data: BrowserOrderbookEvent) {
	orderbookSnapshot = {
		data,
		error: undefined,
		isStale: false,
		lastMessageAt: performance.now(),
		source: "l2Book-fast",
		status: "active",
	};
	notifyOrderbookListeners();
}

export function useOrderbookFeed() {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => orderbookSnapshot,
	);
}

export function useHyperliquid() {
	return hyperliquidContext;
}

export function useSelectedMarketInfo() {
	return selectedMarket;
}

export function useSubscription(method: string) {
	const snapshot = useOrderbookFeed();
	return method === "l2Book" ? snapshot : pendingSubscription;
}

export function useOrderbookMidPrice() {
	return midPrice;
}

export function getExplorerTxUrl() {
	return "https://app.hyperliquid.xyz/explorer/tx/test";
}
