import { resolveMobilePairingFeatureFlags } from "@/config/mobile-pairing-flags";

export type { MobilePairingFeatureEnv, MobilePairingFeatureFlags } from "@/config/mobile-pairing-flags";
export { resolveMobilePairingFeatureFlags } from "@/config/mobile-pairing-flags";

export type TopNavConnectedSessionKind = "address" | "ens" | "email" | "disconnected";

const FIXTURE_ADDRESS = "0x8a3f6e2b9c41d07e5a1f3b6c8d92e4a7b05c1d3e" as const;
const FIXTURE_ENS_NAME = "liquidity-provider-01.eth";
const FIXTURE_EMAIL = "alexandra.konstantinopoulou@example.com";

const params = new URLSearchParams(window.location.search);

function readSessionKind(): TopNavConnectedSessionKind {
	const value = params.get("session");
	return value === "ens" || value === "email" || value === "disconnected" ? value : "address";
}

const sessionKind = readSessionKind();

export const MOBILE_PAIRING_FEATURES = resolveMobilePairingFeatureFlags({
	VITE_MOBILE_PAIRING_ENABLED: params.get("pairing") === "on" ? "true" : "false",
});

interface FixtureUser {
	id: string;
	email?: { address: string };
}

const fixtureUser: FixtureUser =
	sessionKind === "email"
		? { id: "fixture-email-user", email: { address: FIXTURE_EMAIL } }
		: { id: "fixture-wallet-user" };

const connectedSession = {
	ready: true,
	authenticationReady: true,
	walletDirectoryReady: true,
	authenticated: true,
	user: fixtureUser,
	address: FIXTURE_ADDRESS,
	displayAddress: FIXTURE_ADDRESS,
	walletAddress: FIXTURE_ADDRESS,
	connectedWalletAddress: FIXTURE_ADDRESS,
	embeddedWalletAddress: sessionKind === "email" ? FIXTURE_ADDRESS : undefined,
	walletConnected: true,
	walletIntent: sessionKind === "email" ? ("embedded" as const) : ("external" as const),
	isConnected: true,
	isConnecting: false,
	isReconnecting: false,
	sessionMode: "wallet" as const,
	hasWalletAccess: true,
	login: () => undefined,
	logout: async () => undefined,
};

const disconnectedSession = {
	...connectedSession,
	authenticated: false,
	user: null,
	address: undefined,
	displayAddress: undefined,
	walletAddress: undefined,
	connectedWalletAddress: undefined,
	embeddedWalletAddress: undefined,
	walletConnected: false,
	walletIntent: "unavailable" as const,
	isConnected: false,
	sessionMode: "disconnected" as const,
	hasWalletAccess: false,
};

const session = sessionKind === "disconnected" ? disconnectedSession : connectedSession;

export function useWalletSession() {
	return session;
}

export function useReconnectWallet() {
	return { walletsReady: true, isReconnecting: false, reconnectWallet: async () => undefined };
}

export function useDisconnectWallet() {
	return { isDisconnecting: false, disconnectWallet: async () => undefined };
}

export function useEmailWalletExport() {
	return { visible: sessionKind === "email", canExport: false, exportEmailWallet: async () => undefined };
}

export function useEnsName({ address }: { address?: `0x${string}` }) {
	return { data: sessionKind === "ens" && address ? FIXTURE_ENS_NAME : undefined };
}

export function getPrivyEmailAddress(user: FixtureUser | null | undefined): string | undefined {
	return user?.email?.address;
}

export function reportClientError() {
	return false;
}

export function useGeoRestriction() {
	const unresolved = params.get("deposit") === "unavailable";
	return {
		actionsBlocked: unresolved,
		tradeRestricted: false,
		country: unresolved ? null : "SG",
		proxy: false,
		isResolving: unresolved,
		isError: false,
		isResolved: !unresolved,
		retry: async () => undefined,
	};
}

export function useTradeHomePath() {
	return "/trade/HYPE";
}

const noop = () => undefined;

export function useDepositModalActions() {
	return { open: noop, close: noop };
}

export function useSettingsDialogActions() {
	return { open: noop, close: noop };
}

export function useMobileSyncModalActions() {
	return { open: noop, close: noop };
}

export function useMobileSyncModalOpen() {
	return false;
}

interface ModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function WalletModal({ open }: ModalProps) {
	return open ? <div role="dialog" aria-label="Fixture wallet connector" /> : null;
}

export function MobileAgentSyncModal({ open }: ModalProps) {
	return open ? <div role="dialog" aria-label="Fixture mobile link" /> : null;
}
