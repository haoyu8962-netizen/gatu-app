import { create } from "zustand";
import type { PositionMarketCloseRef } from "@/components/trade/positions/position-dialog-types";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import type { PositionCloseSizingIntent } from "@/domain/trade/position-market-close";
import { type HyperliquidEnv, useHyperliquid } from "@/lib/hyperliquid";

export type { PositionMarketCloseRef } from "@/components/trade/positions/position-dialog-types";

type DepositTab = "deposit" | "withdraw" | "bridge";
export type TransferDirection = "toSpot" | "toPerp";
export type SwapMode = "spot" | "stablecoin";
export type SendAccountType = "perp" | "spot";

export type PositionMarketCloseSizingIntent = PositionCloseSizingIntent;

export type PositionMarketClosePhase = "idle" | "validating" | "submitting" | "reconciling";
export type PositionMarketClosePresentation = "confirmation" | "direct";

export interface PositionMarketCloseSession {
	sessionId: string;
	owner: `0x${string}`;
	env: HyperliquidEnv;
	position: PositionMarketCloseRef;
	sizingIntent: PositionMarketCloseSizingIntent;
	presentation: PositionMarketClosePresentation;
	phase: PositionMarketClosePhase;
	error: string | null;
}

type GlobalModal =
	| { type: "deposit"; tab: DepositTab }
	| { type: "establishConnection" }
	| { type: "internalTransfer"; direction: TransferDirection }
	| { type: "send"; asset: string; accountType: SendAccountType }
	| { type: "settings" }
	| { type: "swap"; fromToken: string; toToken?: string; mode: SwapMode }
	| { type: "commandMenu" }
	| { type: "positionMarketClose"; session: PositionMarketCloseSession }
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

export interface PositionMarketCloseIdentity {
	owner: `0x${string}`;
	env: HyperliquidEnv;
}

export interface PositionMarketCloseStoreActions {
	open: (
		position: PositionMarketCloseRef,
		identity: PositionMarketCloseIdentity,
		presentation?: PositionMarketClosePresentation,
	) => string | null;
	close: (sessionId: string) => void;
	setSizingIntent: (sessionId: string, sizingIntent: PositionMarketCloseSizingIntent) => void;
	updatePhase: (sessionId: string, phase: PositionMarketClosePhase) => void;
	setError: (sessionId: string, error: string | null) => void;
}

export interface PositionMarketCloseActions extends Omit<PositionMarketCloseStoreActions, "open"> {
	open: (position: PositionMarketCloseRef, presentation?: PositionMarketClosePresentation) => string | null;
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
	positionMarketCloseActions: PositionMarketCloseStoreActions;
}

let fallbackSessionSequence = 0;
const EVM_ADDRESS_PATTERN = /^0x[a-f0-9]{40}$/;

function createPositionMarketCloseSessionId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
	fallbackSessionSequence += 1;
	return `position-market-close:${Date.now()}:${fallbackSessionSequence}`;
}

function isPositionMarketCloseModal(
	modal: GlobalModal,
): modal is Extract<GlobalModal, { type: "positionMarketClose" }> {
	return modal?.type === "positionMarketClose";
}

const useGlobalModalStore = create<GlobalModalState>((set) => {
	const close = () => set((state) => (isPositionMarketCloseModal(state.modal) ? state : { modal: null }));
	const open = (modal: Exclude<GlobalModal, null | { type: "positionMarketClose" }>) =>
		set((state) => (isPositionMarketCloseModal(state.modal) ? state : { modal }));

	return {
		modal: null,
		depositActions: {
			open: (tab = "deposit") => open({ type: "deposit", tab }),
			setTab: (tab) => set((state) => (state.modal?.type === "deposit" ? { modal: { type: "deposit", tab } } : state)),
			close,
		},
		establishConnectionActions: {
			open: () => open({ type: "establishConnection" }),
			close,
		},
		transferActions: {
			open: (direction = "toPerp") => open({ type: "internalTransfer", direction }),
			close,
		},
		sendActions: {
			open: (asset = DEFAULT_QUOTE_TOKEN, accountType = "spot") => open({ type: "send", asset, accountType }),
			close,
		},
		settingsActions: {
			open: () => open({ type: "settings" }),
			close,
		},
		swapActions: {
			open: (fromToken = DEFAULT_QUOTE_TOKEN, toToken) => open({ type: "swap", fromToken, toToken, mode: "spot" }),
			openStablecoins: () => open({ type: "swap", fromToken: DEFAULT_QUOTE_TOKEN, mode: "stablecoin" }),
			close,
		},
		commandMenuActions: {
			open: () => open({ type: "commandMenu" }),
			close,
		},
		positionMarketCloseActions: {
			open: (position, identity, presentation = "confirmation") => {
				const owner = identity.owner.trim().toLowerCase();
				if (!EVM_ADDRESS_PATTERN.test(owner)) return null;
				const sessionId = createPositionMarketCloseSessionId();
				let didOpen = false;
				set((state) => {
					if (isPositionMarketCloseModal(state.modal)) return state;
					didOpen = true;
					return {
						modal: {
							type: "positionMarketClose",
							session: {
								sessionId,
								owner: owner as `0x${string}`,
								env: identity.env,
								position,
								sizingIntent: { kind: "max" },
								presentation,
								phase: "idle",
								error: null,
							},
						},
					};
				});
				return didOpen ? sessionId : null;
			},
			close: (sessionId) =>
				set((state) => {
					if (!isPositionMarketCloseModal(state.modal)) return state;
					if (
						state.modal.session.sessionId !== sessionId ||
						(state.modal.session.phase !== "idle" && state.modal.session.phase !== "reconciling")
					) {
						return state;
					}
					return { modal: null };
				}),
			setSizingIntent: (sessionId, sizingIntent) =>
				set((state) => {
					if (!isPositionMarketCloseModal(state.modal)) return state;
					if (state.modal.session.sessionId !== sessionId || state.modal.session.phase !== "idle") return state;
					return {
						modal: {
							...state.modal,
							session: { ...state.modal.session, sizingIntent, error: null },
						},
					};
				}),
			updatePhase: (sessionId, phase) =>
				set((state) => {
					if (!isPositionMarketCloseModal(state.modal) || state.modal.session.sessionId !== sessionId) return state;
					return {
						modal: {
							...state.modal,
							session: {
								...state.modal.session,
								phase,
								presentation: phase === "reconciling" ? "confirmation" : state.modal.session.presentation,
							},
						},
					};
				}),
			setError: (sessionId, error) =>
				set((state) => {
					if (!isPositionMarketCloseModal(state.modal) || state.modal.session.sessionId !== sessionId) return state;
					return {
						modal: {
							...state.modal,
							session: {
								...state.modal.session,
								error,
								presentation: error === null ? state.modal.session.presentation : "confirmation",
							},
						},
					};
				}),
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

export function usePositionMarketCloseSession(): PositionMarketCloseSession | null {
	return useGlobalModalStore((state) => (state.modal?.type === "positionMarketClose" ? state.modal.session : null));
}

export function usePositionMarketCloseActions(): PositionMarketCloseActions {
	const actions = useGlobalModalStore((state) => state.positionMarketCloseActions);
	const { clientKey, env } = useHyperliquid();

	return {
		...actions,
		open: (position, presentation) => {
			const owner = clientKey.trim().toLowerCase();
			if (!EVM_ADDRESS_PATTERN.test(owner)) return null;
			return actions.open(position, { owner: owner as `0x${string}`, env }, presentation);
		},
	};
}

export function getPositionMarketCloseModal(): PositionMarketCloseSession | null {
	const modal = useGlobalModalStore.getState().modal;
	return modal?.type === "positionMarketClose" ? modal.session : null;
}

export function getPositionMarketCloseActions(): PositionMarketCloseStoreActions {
	return useGlobalModalStore.getState().positionMarketCloseActions;
}

export function discardPositionMarketCloseModal(): void {
	const session = getPositionMarketCloseModal();
	if (!session) return;
	const actions = getPositionMarketCloseActions();
	actions.updatePhase(session.sessionId, "reconciling");
	actions.close(session.sessionId);
}
