import { useSyncExternalStore } from "react";

export interface CardFundingSession {
	clientKey: string;
	isTestnet: boolean;
	sessionMode: "agent-only" | "disconnected" | "wallet";
	walletAddress: string | undefined;
	walletIntent: "ambiguous" | "embedded" | "external" | "unavailable";
	embeddedWalletAddress: string | undefined;
	privyWallets: readonly { address: string }[];
	privyWindowOpen: boolean;
}

let session: CardFundingSession = {
	clientKey: "",
	isTestnet: false,
	sessionMode: "disconnected",
	walletAddress: undefined,
	walletIntent: "unavailable",
	embeddedWalletAddress: undefined,
	privyWallets: [],
	privyWindowOpen: false,
};
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** The identity and wallet session the card funding surfaces read, switchable while they are mounted. */
export function setCardFundingSession(next: Partial<CardFundingSession>): void {
	session = { ...session, ...next };
	for (const listener of listeners) listener();
}

/** A wallet session whose exact owner is `address`, on Mainnet. */
export function signInCardFundingOwner(address: string, walletKind: "embedded" | "external" = "embedded"): void {
	setCardFundingSession({
		clientKey: address.toLowerCase(),
		isTestnet: false,
		sessionMode: "wallet",
		walletAddress: address,
		walletIntent: walletKind,
		embeddedWalletAddress: walletKind === "embedded" ? address : undefined,
		privyWallets: [{ address }],
		privyWindowOpen: false,
	});
}

export function useCardFundingSession(): CardFundingSession {
	return useSyncExternalStore(subscribe, () => session);
}
