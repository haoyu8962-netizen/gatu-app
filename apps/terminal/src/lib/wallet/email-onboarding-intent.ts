import { useSyncExternalStore } from "react";
import type { PrivyWalletIntent } from "./privy-wagmi";
import { hasSameWalletAddress } from "./privy-wagmi";

type Environment = "Mainnet" | "Testnet";

export interface EmailOnboardingIntent {
	userId: string;
	env: Environment;
	ownerAddress: `0x${string}` | undefined;
}

interface EmailOnboardingSession {
	authenticated: boolean;
	embeddedWalletAddress: `0x${string}` | undefined;
	env: Environment;
	ready: boolean;
	userId: string | undefined;
	walletIntent: PrivyWalletIntent;
}

let pendingIntent: EmailOnboardingIntent | null = null;
const listeners = new Set<() => void>();

function publish(intent: EmailOnboardingIntent | null): void {
	pendingIntent = intent;
	for (const listener of listeners) listener();
}

export function recordEmailOnboardingIntent(intent: EmailOnboardingIntent): void {
	publish({ ...intent });
}

export function clearEmailOnboardingIntent(): void {
	if (pendingIntent) publish(null);
}

export function reconcileEmailOnboardingIntent(session: EmailOnboardingSession): void {
	const intent = pendingIntent;
	if (!intent) return;
	if (intent.env !== session.env) {
		clearEmailOnboardingIntent();
		return;
	}
	if (!session.ready) return;
	if (!session.authenticated || session.userId !== intent.userId || session.walletIntent === "external") {
		clearEmailOnboardingIntent();
		return;
	}
	if (!session.embeddedWalletAddress) return;
	if (!intent.ownerAddress) {
		publish({ ...intent, ownerAddress: session.embeddedWalletAddress });
		return;
	}
	if (!hasSameWalletAddress(intent.ownerAddress, session.embeddedWalletAddress)) clearEmailOnboardingIntent();
}

export function consumeEmailOnboardingIntent(intent: EmailOnboardingIntent): boolean {
	if (pendingIntent !== intent) return false;
	clearEmailOnboardingIntent();
	return true;
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function useEmailOnboardingIntent(): EmailOnboardingIntent | null {
	return useSyncExternalStore(
		subscribe,
		() => pendingIntent,
		() => null,
	);
}
