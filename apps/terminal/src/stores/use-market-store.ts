import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
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

interface MarketStore {
	selectedMarkets: Record<ExchangeScope, string>;
	favoriteMarkets: string[];
	actions: {
		setSelectedMarket: (scope: ExchangeScope, marketName: string) => void;
		toggleFavoriteMarket: (marketName: string) => void;
	};
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
			version: 3,
			storage: createJSONStorage(() => validatedStorage),
			partialize: (state) => ({
				selectedMarkets: state.selectedMarkets,
				favoriteMarkets: state.favoriteMarkets,
			}),
			merge: (persisted, current) => {
				const p = persisted as Partial<MarketStore> & { selectedMarket?: string };

				let selectedMarkets = { ...DEFAULT_SELECTED_MARKETS };
				if (p?.selectedMarkets) {
					selectedMarkets = { ...selectedMarkets, ...p.selectedMarkets };
				} else if (p?.selectedMarket) {
					selectedMarkets = { ...selectedMarkets, all: p.selectedMarket, perp: p.selectedMarket };
				}

				return {
					...current,
					selectedMarkets,
					favoriteMarkets: Array.isArray(p?.favoriteMarkets) ? p.favoriteMarkets : current.favoriteMarkets,
				};
			},
		},
	),
);

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
