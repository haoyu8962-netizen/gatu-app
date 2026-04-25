import { create } from "zustand";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";

type DepositTab = "deposit" | "withdraw" | "bridge";

type GlobalModal =
	| { type: "deposit"; tab: DepositTab }
	| { type: "settings" }
	| { type: "swap"; fromToken: string; toToken?: string }
	| { type: "commandMenu" }
	| null;

interface DepositActions {
	open: (tab?: DepositTab) => void;
	setTab: (tab: DepositTab) => void;
	close: () => void;
}

interface SettingsActions {
	open: () => void;
	close: () => void;
}

interface SwapActions {
	open: (fromToken?: string, toToken?: string) => void;
	close: () => void;
}

interface CommandMenuActions {
	open: () => void;
	close: () => void;
}

interface GlobalModalState {
	modal: GlobalModal;
	depositActions: DepositActions;
	settingsActions: SettingsActions;
	swapActions: SwapActions;
	commandMenuActions: CommandMenuActions;
}

const useGlobalModalStore = create<GlobalModalState>((set) => {
	const close = () => set({ modal: null });

	return {
		modal: null,
		depositActions: {
			open: (tab = "deposit") => set({ modal: { type: "deposit", tab } }),
			setTab: (tab) => set((state) => (state.modal?.type === "deposit" ? { modal: { type: "deposit", tab } } : state)),
			close,
		},
		settingsActions: {
			open: () => set({ modal: { type: "settings" } }),
			close,
		},
		swapActions: {
			open: (fromToken = DEFAULT_QUOTE_TOKEN, toToken) => set({ modal: { type: "swap", fromToken, toToken } }),
			close,
		},
		commandMenuActions: {
			open: () => set({ modal: { type: "commandMenu" } }),
			close,
		},
	};
});

export function useDepositModalOpen() {
	return useGlobalModalStore((s) => s.modal?.type === "deposit");
}
export function useDepositModalTab() {
	return useGlobalModalStore((s) => (s.modal?.type === "deposit" ? s.modal.tab : "deposit"));
}
export function useDepositModalActions() {
	return useGlobalModalStore((s) => s.depositActions);
}

export function useSettingsDialogOpen() {
	return useGlobalModalStore((s) => s.modal?.type === "settings");
}
export function useSettingsDialogActions() {
	return useGlobalModalStore((s) => s.settingsActions);
}

export function useSwapModalOpen() {
	return useGlobalModalStore((s) => s.modal?.type === "swap");
}
export function useSwapModalFromToken() {
	return useGlobalModalStore((s) => (s.modal?.type === "swap" ? s.modal.fromToken : undefined));
}
export function useSwapModalToToken() {
	return useGlobalModalStore((s) => (s.modal?.type === "swap" ? s.modal.toToken : undefined));
}
export function useSwapModalActions() {
	return useGlobalModalStore((s) => s.swapActions);
}

export function useCommandMenuOpen() {
	return useGlobalModalStore((s) => s.modal?.type === "commandMenu");
}
export function useCommandMenuActions() {
	return useGlobalModalStore((s) => s.commandMenuActions);
}
