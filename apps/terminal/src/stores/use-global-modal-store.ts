import { create } from "zustand";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";

type DepositTab = "deposit" | "withdraw" | "bridge";
export type TransferDirection = "toSpot" | "toPerp";
export type SwapMode = "spot" | "stablecoin";
export type SendAccountType = "perp" | "spot";

type GlobalModal =
	| { type: "deposit"; tab: DepositTab }
	| { type: "establishConnection" }
	| { type: "internalTransfer"; direction: TransferDirection }
	| { type: "send"; asset: string; accountType: SendAccountType }
	| { type: "settings" }
	| { type: "swap"; fromToken: string; toToken?: string; mode: SwapMode }
	| { type: "commandMenu" }
	| null;

interface DepositActions {
	open: (tab?: DepositTab) => void;
	setTab: (tab: DepositTab) => void;
	close: () => void;
}

interface EstablishConnectionActions {
	open: () => void;
	close: () => void;
}

interface TransferActions {
	open: (direction?: TransferDirection) => void;
	close: () => void;
}

interface SendActions {
	open: (asset?: string, accountType?: SendAccountType) => void;
	close: () => void;
}

interface SettingsActions {
	open: () => void;
	close: () => void;
}

interface SwapActions {
	open: (fromToken?: string, toToken?: string) => void;
	openStablecoins: () => void;
	close: () => void;
}

interface CommandMenuActions {
	open: () => void;
	close: () => void;
}

interface GlobalModalState {
	modal: GlobalModal;
	depositActions: DepositActions;
	establishConnectionActions: EstablishConnectionActions;
	transferActions: TransferActions;
	sendActions: SendActions;
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
		establishConnectionActions: {
			open: () => set({ modal: { type: "establishConnection" } }),
			close,
		},
		transferActions: {
			open: (direction = "toPerp") => set({ modal: { type: "internalTransfer", direction } }),
			close,
		},
		sendActions: {
			open: (asset = DEFAULT_QUOTE_TOKEN, accountType = "spot") => set({ modal: { type: "send", asset, accountType } }),
			close,
		},
		settingsActions: {
			open: () => set({ modal: { type: "settings" } }),
			close,
		},
		swapActions: {
			open: (fromToken = DEFAULT_QUOTE_TOKEN, toToken) =>
				set({ modal: { type: "swap", fromToken, toToken, mode: "spot" } }),
			openStablecoins: () => set({ modal: { type: "swap", fromToken: DEFAULT_QUOTE_TOKEN, mode: "stablecoin" } }),
			close,
		},
		commandMenuActions: {
			open: () => set({ modal: { type: "commandMenu" } }),
			close,
		},
	};
});

export function useGlobalModalType() {
	return useGlobalModalStore((s) => s.modal?.type ?? null);
}

export function useDepositModalOpen() {
	return useGlobalModalStore((s) => s.modal?.type === "deposit");
}
export function useDepositModalTab() {
	return useGlobalModalStore((s) => (s.modal?.type === "deposit" ? s.modal.tab : "deposit"));
}
export function useDepositModalActions() {
	return useGlobalModalStore((s) => s.depositActions);
}

export function useEstablishConnectionModalOpen() {
	return useGlobalModalStore((s) => s.modal?.type === "establishConnection");
}

export function useEstablishConnectionModalActions() {
	return useGlobalModalStore((s) => s.establishConnectionActions);
}

export function useTransferModalOpen() {
	return useGlobalModalStore((s) => s.modal?.type === "internalTransfer");
}
export function useTransferModalDirection() {
	return useGlobalModalStore((s) => (s.modal?.type === "internalTransfer" ? s.modal.direction : "toPerp"));
}
export function useTransferModalActions() {
	return useGlobalModalStore((s) => s.transferActions);
}

export function useSendModalAsset() {
	return useGlobalModalStore((s) => (s.modal?.type === "send" ? s.modal.asset : DEFAULT_QUOTE_TOKEN));
}
export function useSendModalAccountType() {
	return useGlobalModalStore((s) => (s.modal?.type === "send" ? s.modal.accountType : "spot"));
}
export function useSendModalActions() {
	return useGlobalModalStore((s) => s.sendActions);
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
export function useSwapModalMode() {
	return useGlobalModalStore((s) => (s.modal?.type === "swap" ? s.modal.mode : "spot"));
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
