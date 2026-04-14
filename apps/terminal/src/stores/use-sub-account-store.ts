import type { Address } from "viem";
import { create } from "zustand";

interface SubAccountStore {
	selectedAddress: Address | null;
	actions: {
		setSelectedAddress: (address: Address | null) => void;
	};
}

export const useSubAccountStore = create<SubAccountStore>()((set) => ({
	selectedAddress: null,
	actions: {
		setSelectedAddress: (address) => set({ selectedAddress: address }),
	},
}));

export function useSelectedSubAddress(): Address | null {
	return useSubAccountStore((state) => state.selectedAddress);
}

export function useSubAccountActions() {
	return useSubAccountStore((state) => state.actions);
}
