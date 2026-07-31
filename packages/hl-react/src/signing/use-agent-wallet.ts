import type { Address } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { useHyperliquid } from "../provider";
import { getCachedAgentSigner, signerCache } from "./agent-signer-cache";
import { useAgentWalletStorage } from "./agent-storage";
import type { AgentWallet } from "./types";
import { useAgentStatus } from "./use-agent-status";

export { signerCache };

export interface UseAgentWalletResult {
	data: AgentWallet | null;
	signer: PrivateKeyAccount | null;
	address: Address | null;
	isReady: boolean;
}

export function useAgentWallet(): UseAgentWalletResult {
	const { env, clientKey } = useHyperliquid();
	const userAddress = clientKey === "disconnected" ? undefined : (clientKey as Address);
	const { isReady } = useAgentStatus();

	const agentWallet = useAgentWalletStorage(env, userAddress);

	const signer = isReady && agentWallet?.privateKey ? getCachedAgentSigner(agentWallet.privateKey) : null;

	return {
		data: isReady ? agentWallet : null,
		signer,
		address: agentWallet?.publicKey ?? null,
		isReady: isReady && signer !== null,
	};
}
