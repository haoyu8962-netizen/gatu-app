import { create } from "zustand";

export interface SelectedOrderbookPrice {
	marketName: string;
	price: string;
}

interface OrderbookActionsState {
	selectedPrice: SelectedOrderbookPrice | null;
}

interface OrderbookActions {
	setSelectedPrice: (marketName: string, price: string) => void;
	clearSelectedPrice: () => void;
}

interface OrderbookActionsStore extends OrderbookActionsState {
	actions: OrderbookActions;
}

const useOrderbookActionsStore = create<OrderbookActionsStore>((set) => ({
	selectedPrice: null,
	actions: {
		setSelectedPrice: (marketName, price) => set({ selectedPrice: { marketName, price } }),
		clearSelectedPrice: () => set({ selectedPrice: null }),
	},
}));

export function useSelectedPrice() {
	return useOrderbookActionsStore((s) => s.selectedPrice);
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
