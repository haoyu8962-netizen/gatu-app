import type { Address, Hex } from "viem";
import { type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import { useConnection } from "wagmi";
import { LRU } from "../lru";
import { useHyperliquid } from "../provider";
import { useAgentWalletStorage } from "./agent-storage";
import type { AgentWallet } from "./types";
import { useAgentStatus } from "./use-agent-status";

/** @internal — exported only for tests; do not consume from outside this package. */
export const signerCache = new LRU<Hex, PrivateKeyAccount>(4);

function getCachedSigner(privateKey: Hex): PrivateKeyAccount | null {
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

export interface UseAgentWalletResult {
	data: AgentWallet | null;
	signer: PrivateKeyAccount | null;
	address: Address | null;
	isReady: boolean;
}

export function useAgentWallet(): UseAgentWalletResult {
	const { env } = useHyperliquid();
	const { address: userAddress } = useConnection();
	const { isReady } = useAgentStatus();

	const agentWallet = useAgentWalletStorage(env, userAddress);

	const signer = isReady && agentWallet?.privateKey ? getCachedSigner(agentWallet.privateKey) : null;

	return {
		data: isReady ? agentWallet : null,
		signer,
		address: agentWallet?.publicKey ?? null,
		isReady: isReady && signer !== null,
	};
}
