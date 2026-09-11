import { useSyncExternalStore } from "react";

export type BrowserOrderbookLevel = { n: number; px: string; sz: string };
export type BrowserOrderbookEvent = {
	coin: string;
	fast?: true;
	levels: [BrowserOrderbookLevel[], BrowserOrderbookLevel[]];
	time: number;
};

const listeners = new Set<() => void>();
const hyperliquidContext = { env: "Mainnet" };
const selectedMarket = {
	data: {
		kind: "perp",
		markPx: "100.05",
		midPx: "100.05",
		markPriceStatus: "success",
		get midPriceReceivedAt() {
			return Date.now();
		},
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

interface BrowserOrderbookSnapshot {
	data: BrowserOrderbookEvent | undefined;
	error: Error | undefined;
	isStale: boolean;
	lastMessageAt: number | undefined;
	source?: "l2" | "l2Book-fast" | "l2Book-full";
	status: string;
}

let orderbookSnapshot: BrowserOrderbookSnapshot = pendingSubscription;

function notifyOrderbookListeners() {
	for (const listener of listeners) listener();
}

export function setBrowserOrderbookPending() {
	orderbookSnapshot = pendingSubscription;
	notifyOrderbookListeners();
}

export function setBrowserOrderbookEvent(
	data: BrowserOrderbookEvent,
	source: "l2" | "l2Book-fast" | "l2Book-full" = "l2Book-fast",
) {
	orderbookSnapshot = {
		data,
		error: undefined,
		isStale: false,
		lastMessageAt: performance.now(),
		source,
		status: "active",
	};
	notifyOrderbookListeners();
}

export function setBrowserOrderbookUnavailable(state: "pending" | "stale" | "error") {
	orderbookSnapshot = {
		...orderbookSnapshot,
		data: state === "pending" ? undefined : orderbookSnapshot.data,
		error: state === "error" ? new Error("Fixture feed failure") : undefined,
		isStale: state === "stale",
		status: state === "stale" ? "active" : state,
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
