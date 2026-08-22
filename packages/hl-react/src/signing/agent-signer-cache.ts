import type { Hex } from "viem";
import { type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import { LRU } from "../lru";

export const signerCache = new LRU<Hex, PrivateKeyAccount>(4);

export function getCachedAgentSigner(privateKey: Hex): PrivateKeyAccount | null {
	const cached = signerCache.get(privateKey);
	if (cached) return cached;
	try {
		const account = privateKeyToAccount(privateKey);
		signerCache.set(privateKey, account);
		return account;
	} catch {
		return null;
	}
}

export function evictAgentSigner(privateKey: Hex): void {
	signerCache.delete(privateKey);
}

export function evictAllAgentSigners(): void {
	signerCache.clear();
}
