import type { Address, Hex } from "viem";
import { type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import { useConnection } from "wagmi";
import { useHyperliquid } from "../provider";
import { useAgentWalletStorage } from "./agent-storage";
import type { AgentWallet } from "./types";
import { useAgentStatus } from "./use-agent-status";

const signerCache = new Map<Hex, PrivateKeyAccount>();

function getCachedSigner(privateKey: Hex): PrivateKeyAccount {
	let signer = signerCache.get(privateKey);
	if (!signer) {
		signer = privateKeyToAccount(privateKey);
		signerCache.set(privateKey, signer);
	}
	return signer;
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

	const signer = (() => {
		if (!isReady || !agentWallet?.privateKey) return null;
		try {
			return getCachedSigner(agentWallet.privateKey);
		} catch {
			return null;
		}
	})();

	return {
		data: isReady ? agentWallet : null,
		signer,
		address: agentWallet?.publicKey ?? null,
		isReady: isReady && signer !== null,
	};
}
