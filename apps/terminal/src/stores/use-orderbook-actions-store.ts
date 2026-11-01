import { create } from "zustand";
import type { SizeMode } from "@/lib/trade/types";

export interface SelectedOrderbookPrice {
	marketName: string;
	price: string;
}

export interface RequestedOrderbookSizeMode {
	marketName: string;
	mode: SizeMode;
}

interface OrderbookActionsState {
	selectedPrice: SelectedOrderbookPrice | null;
	sizeModeRequest: RequestedOrderbookSizeMode | null;
}

interface OrderbookActions {
	setSelectedPrice: (marketName: string, price: string) => void;
	clearSelectedPrice: () => void;
	requestSizeMode: (marketName: string, mode: SizeMode) => void;
	clearSizeModeRequest: () => void;
}

interface OrderbookActionsStore extends OrderbookActionsState {
	actions: OrderbookActions;
}

const useOrderbookActionsStore = create<OrderbookActionsStore>((set) => ({
	selectedPrice: null,
	sizeModeRequest: null,
	actions: {
		setSelectedPrice: (marketName, price) => set({ selectedPrice: { marketName, price } }),
		clearSelectedPrice: () => set({ selectedPrice: null }),
		requestSizeMode: (marketName, mode) => set({ sizeModeRequest: { marketName, mode } }),
		clearSizeModeRequest: () => set({ sizeModeRequest: null }),
	},
}));

export function useSelectedPrice() {
	return useOrderbookActionsStore((s) => s.selectedPrice);
}
export function useSizeModeRequest() {
	return useOrderbookActionsStore((s) => s.sizeModeRequest);
}
export function useOrderbookActions() {
	return useOrderbookActionsStore((s) => s.actions);
}

export function getSelectedPriceForMarket(
	selection: SelectedOrderbookPrice | null,
	marketName: string | undefined,
): string | null {
	return selection && marketName === selection.marketName ? selection.price : null;
}
export function getOrderbookActionsStore() {
	return useOrderbookActionsStore.getState();
}
