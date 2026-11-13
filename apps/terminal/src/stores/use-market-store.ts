import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { DEFAULT_FAVORITE_MARKETS, DEFAULT_MARKET_NAME, STORAGE_KEYS } from "@/config/app";
import { DEFAULT_SELECTED_MARKETS } from "@/config/markets";
import type { ExchangeScope } from "@/domain/market";
import { isSafeTradeRouteMarketName } from "@/lib/hyperliquid/market-route";
import { createValidatedStorage } from "@/lib/storage/validated-storage";
import { z } from "@/lib/zod";
import { useExchangeScope } from "@/providers/exchange-scope";

const safeMarketNameSchema = z.string().refine(isSafeTradeRouteMarketName);

const marketStoreSchema = z.object({
	state: z.object({
		selectedMarkets: z.record(z.string(), safeMarketNameSchema).optional(),
		favoriteMarkets: z.array(safeMarketNameSchema).optional(),
	}),
});

const validatedStorage = createValidatedStorage(marketStoreSchema, "market store");

const MARKET_STORE_VERSION = 3;

interface MarketStore {
	selectedMarkets: Record<ExchangeScope, string>;
	favoriteMarkets: string[];
	actions: {
		setSelectedMarket: (scope: ExchangeScope, marketName: string) => void;
		toggleFavoriteMarket: (marketName: string) => void;
	};
}

interface MarketPrefs {
	selectedMarkets: Record<string, string>;
	favoriteMarkets: string[];
}

function normalizeMarketPrefs(persisted: unknown, fallbackFavorites: readonly string[]): MarketPrefs {
	const p = persisted as (Partial<MarketPrefs> & { selectedMarket?: string }) | undefined;

	let selectedMarkets: Record<string, string> = { ...DEFAULT_SELECTED_MARKETS };
	if (p?.selectedMarkets) {
		selectedMarkets = { ...selectedMarkets, ...p.selectedMarkets };
	} else if (p?.selectedMarket) {
		selectedMarkets = { ...selectedMarkets, all: p.selectedMarket, perp: p.selectedMarket };
	}

	return {
		selectedMarkets,
		favoriteMarkets: Array.isArray(p?.favoriteMarkets) ? p.favoriteMarkets : [...fallbackFavorites],
	};
}

function partializeMarketPrefs(state: MarketStore): MarketPrefs {
	return { selectedMarkets: state.selectedMarkets, favoriteMarkets: state.favoriteMarkets };
}

// What this window last agreed with storage: its own selected markets (each window keeps showing the
// market it chose) and the favorites shared by every window. A write sends only what differs from it.
let lastSyncedPrefs: MarketPrefs | null = null;
let applyingStoredPrefs = false;

function readStoredPrefs(): MarketPrefs | null {
	const raw = validatedStorage.getItem(STORAGE_KEYS.MARKET_PREFS);
	if (typeof raw !== "string") return null;
	const stored = JSON.parse(raw) as { state: unknown; version?: unknown };
	if (typeof stored.version === "number" && stored.version !== MARKET_STORE_VERSION) return null;
	return normalizeMarketPrefs(stored.state, DEFAULT_FAVORITE_MARKETS);
}

function sameMarkets(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((market, index) => market === b[index]);
}

function combineWithStoredPrefs(outgoing: MarketPrefs): MarketPrefs | null {
	const previous = lastSyncedPrefs;
	if (!previous) return null;
	const stored = readStoredPrefs();
	if (!stored) return null;

	const selectedMarkets = { ...stored.selectedMarkets };
	for (const scope of new Set([...Object.keys(previous.selectedMarkets), ...Object.keys(outgoing.selectedMarkets)])) {
		const next = outgoing.selectedMarkets[scope];
		if (next !== undefined && next !== previous.selectedMarkets[scope]) selectedMarkets[scope] = next;
	}

	const added = outgoing.favoriteMarkets.filter((market) => !previous.favoriteMarkets.includes(market));
	const removed = previous.favoriteMarkets.filter((market) => !outgoing.favoriteMarkets.includes(market));
	const favoriteMarkets = [
		...stored.favoriteMarkets.filter((market) => !removed.includes(market)),
		...added.filter((market) => !stored.favoriteMarkets.includes(market)),
	];

	return { selectedMarkets, favoriteMarkets };
}

function applyStoredFavorites(favoriteMarkets: string[]) {
	if (!sameMarkets(useMarketStore.getState().favoriteMarkets, favoriteMarkets)) {
		applyingStoredPrefs = true;
		try {
			useMarketStore.setState({ favoriteMarkets });
		} finally {
			applyingStoredPrefs = false;
		}
	}
	lastSyncedPrefs = partializeMarketPrefs(useMarketStore.getState());
}

const crossWindowMarketStorage: StateStorage = {
	getItem: (name) => validatedStorage.getItem(name),
	setItem: (name, value) => {
		if (applyingStoredPrefs) return;
		const outgoing = JSON.parse(value) as { state: MarketPrefs; version: number };
		const combined = combineWithStoredPrefs(outgoing.state);
		if (!combined) {
			validatedStorage.setItem(name, value);
			lastSyncedPrefs = outgoing.state;
			return;
		}
		validatedStorage.setItem(name, JSON.stringify({ state: combined, version: outgoing.version }));
		applyStoredFavorites(combined.favoriteMarkets);
	},
	removeItem: (name) => validatedStorage.removeItem(name),
};

function syncStoredPrefs() {
	const stored = readStoredPrefs();
	if (!stored) return;
	applyStoredFavorites(stored.favoriteMarkets);
}

const useMarketStore = create<MarketStore>()(
	persist(
		(set) => ({
			selectedMarkets: { ...DEFAULT_SELECTED_MARKETS },
			favoriteMarkets: [...DEFAULT_FAVORITE_MARKETS],
			actions: {
				setSelectedMarket: (scope, marketName) => {
					if (!isSafeTradeRouteMarketName(marketName)) return;
					set((state) => ({
						selectedMarkets: { ...state.selectedMarkets, [scope]: marketName },
					}));
				},
				toggleFavoriteMarket: (marketName) => {
					if (!isSafeTradeRouteMarketName(marketName)) return;
					set((state) => ({
						favoriteMarkets: state.favoriteMarkets.includes(marketName)
							? state.favoriteMarkets.filter((m) => m !== marketName)
							: [...state.favoriteMarkets, marketName],
					}));
				},
			},
		}),
		{
			name: STORAGE_KEYS.MARKET_PREFS,
			version: MARKET_STORE_VERSION,
			storage: createJSONStorage(() => crossWindowMarketStorage),
			partialize: partializeMarketPrefs,
			merge: (persisted, current) => ({
				...current,
				...(normalizeMarketPrefs(persisted, current.favoriteMarkets) as Pick<
					MarketStore,
					"selectedMarkets" | "favoriteMarkets"
				>),
			}),
			onRehydrateStorage: () => (state) => {
				if (state) lastSyncedPrefs = partializeMarketPrefs(state);
			},
		},
	),
);

if (typeof window !== "undefined") {
	window.addEventListener("storage", (event) => {
		if (event.key !== STORAGE_KEYS.MARKET_PREFS || event.newValue === null) return;
		if (event.storageArea && event.storageArea !== window.localStorage) return;
		syncStoredPrefs();
	});
	window.addEventListener("pageshow", (event) => {
		if (event.persisted) syncStoredPrefs();
	});
}

export function useSelectedMarket(): string {
	const { marketName, scope } = useExchangeScope();
	const storedMarket = useMarketStore((state) => state.selectedMarkets[scope] ?? DEFAULT_MARKET_NAME);
	return marketName ?? storedMarket;
}

export function useSelectedMarkets() {
	return useMarketStore((state) => state.selectedMarkets);
}

export function getStoredSelectedMarket(scope: ExchangeScope): string | undefined {
	return useMarketStore.getState().selectedMarkets[scope];
}

export function getTradeHomeMarketName(): string {
	const marketName = useMarketStore.getState().selectedMarkets.all;
	return isSafeTradeRouteMarketName(marketName) ? marketName : DEFAULT_SELECTED_MARKETS.all;
}

export function useFavoriteMarkets() {
	return useMarketStore((state) => state.favoriteMarkets);
}

export function useMarketActions() {
	return useMarketStore((state) => state.actions);
}
