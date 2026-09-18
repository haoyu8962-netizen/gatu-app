import { useSyncExternalStore } from "react";

export interface UserMenuRecoverySession {
	authenticationReady: boolean;
	walletDirectoryReady: boolean;
	authenticated: boolean;
	isConnected: boolean;
	isConnecting: boolean;
	isReconnecting: boolean;
	displayAddress: `0x${string}` | undefined;
	sessionMode: "agent-only" | "disconnected" | "wallet";
	hasWalletAccess: boolean;
	user: { id: string; email?: { address: string } } | null;
}

const listeners = new Set<() => void>();
let session: UserMenuRecoverySession = {
	authenticationReady: false,
	walletDirectoryReady: false,
	authenticated: false,
	isConnected: false,
	isConnecting: false,
	isReconnecting: false,
	displayAddress: undefined,
	sessionMode: "disconnected",
	hasWalletAccess: false,
	user: null,
};

export const recoveryCalls = { reconnect: 0, disconnect: 0, errors: 0 };

export function setRecoverySession(patch: Partial<UserMenuRecoverySession>) {
	session = { ...session, ...patch };
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function useWalletSession() {
	const state = useSyncExternalStore(subscribe, () => session);
	return { ...state, ready: state.authenticationReady && state.walletDirectoryReady };
}

export function useReconnectWallet() {
	const state = useWalletSession();
	return {
		walletsReady: state.walletDirectoryReady,
		isReconnecting: state.isReconnecting,
		reconnectWallet: async () => {
			recoveryCalls.reconnect += 1;
		},
	};
}

export function useDisconnectWallet() {
	return {
		isDisconnecting: false,
		disconnectWallet: async () => {
			recoveryCalls.disconnect += 1;
		},
	};
}

let mobileSyncOpen = false;

function setMobileSyncOpen(next: boolean) {
	if (mobileSyncOpen === next) return;
	mobileSyncOpen = next;
	for (const listener of listeners) listener();
}

export function useMobileSyncModalOpen() {
	return useSyncExternalStore(subscribe, () => mobileSyncOpen);
}

export function useMobileSyncModalActions() {
	return { open: () => setMobileSyncOpen(true), close: () => setMobileSyncOpen(false) };
}

export function useEnsName() {
	return { data: undefined };
}

export function getPrivyEmailAddress(user: UserMenuRecoverySession["user"]) {
	return user?.email?.address;
}

export function reportClientError() {
	recoveryCalls.errors += 1;
}

interface ModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function WalletModal({ open, onOpenChange }: ModalProps) {
	return open ? (
		<div role="dialog" aria-label="Fixture wallet connector">
			<button type="button" onClick={() => onOpenChange(false)}>
				Close fixture connector
			</button>
		</div>
	) : null;
}

export function MobileAgentSyncModal({ open, onOpenChange }: ModalProps) {
	return open ? (
		<div role="dialog" aria-label="Fixture mobile link">
			<button type="button" onClick={() => onOpenChange(false)}>
				Close fixture mobile link
			</button>
		</div>
	) : null;
}
