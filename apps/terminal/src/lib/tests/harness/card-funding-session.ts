import { useSyncExternalStore } from "react";

interface CardFundingSession {
	clientKey: string;
	isTestnet: boolean;
}

let session: CardFundingSession = { clientKey: "", isTestnet: false };
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** The identity the card funding surfaces read, switchable while they are mounted. */
export function setCardFundingSession(next: Partial<CardFundingSession>): void {
	session = { ...session, ...next };
	for (const listener of listeners) listener();
}

export function useCardFundingSessionClientKey(): string {
	return useSyncExternalStore(subscribe, () => session.clientKey);
}

export function useCardFundingSessionIsTestnet(): boolean {
	return useSyncExternalStore(subscribe, () => session.isTestnet);
}
