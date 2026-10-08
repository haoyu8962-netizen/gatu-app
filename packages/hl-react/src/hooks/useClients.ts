import type { ExchangeClient, InfoClient } from "@nktkas/hyperliquid";
import { useMemo } from "react";
import { createExchangeClient, getTradingClient } from "../clients";
import { useHyperliquid } from "../provider";
import { getOwnerSignerClient } from "../signing/owner-signer-client";
import { useHyperliquidOwnerSigner } from "../signing/owner-signer-provider";
import { useAgentWallet } from "../signing/use-agent-wallet";
import type { CompactSubscriptionClient } from "../subscriptions/compact-subscription-client";
import { toHyperliquidWallet, walletClientMatchesAddress } from "../wallet";
import { useConnectionWalletClient } from "./useConnectionWalletClient";

export interface HyperliquidClients {
	info: InfoClient;
	subscription: CompactSubscriptionClient;
	trading: ExchangeClient | null;
	/** Exchange client using user wallet - for EIP-712/user-signed actions such as approvals, transfers, and withdrawals. */
	user: ExchangeClient | null;
	userWalletMismatch: boolean;
	agentPublicKey: `0x${string}` | null;
}

export function useHyperliquidClients(): HyperliquidClients {
	const { info, subscription, isTestnet, clientKey, sessionMode } = useHyperliquid();
	const ownerSigner = useHyperliquidOwnerSigner();
	const { signer, address: agentPublicKey, isReady: agentReady } = useAgentWallet();
	const { data: walletClient } = useConnectionWalletClient();
	const hasUserSession = clientKey !== "disconnected";
	const address = hasUserSession ? (clientKey as `0x${string}`) : undefined;

	const ownerClient = useMemo(() => {
		if (
			!ownerSigner ||
			!address ||
			sessionMode !== "wallet" ||
			ownerSigner.ownerAddress?.toLowerCase() !== address.toLowerCase()
		)
			return null;
		return getOwnerSignerClient(ownerSigner, isTestnet);
	}, [address, isTestnet, ownerSigner, sessionMode]);
	const trading = (() => {
		if (ownerSigner) return ownerClient;
		if (!hasUserSession || !signer || !agentReady) return null;
		return getTradingClient(signer, isTestnet);
	})();

	const userWalletMismatch = ownerSigner
		? !!address && ownerSigner.ownerAddress?.toLowerCase() !== address.toLowerCase()
		: sessionMode === "wallet" && !!walletClient && !!address && !walletClientMatchesAddress(walletClient, address);
	const user = useMemo(() => {
		if (ownerSigner) return null;
		if (sessionMode !== "wallet" || !walletClient || !address) return null;
		if (!walletClientMatchesAddress(walletClient, address)) return null;
		const wallet = toHyperliquidWallet(walletClient, address);
		if (!wallet) return null;
		return createExchangeClient(wallet, isTestnet);
	}, [address, isTestnet, ownerSigner, sessionMode, walletClient]);

	return {
		info,
		subscription,
		trading,
		user: ownerSigner ? ownerClient : user,
		userWalletMismatch,
		agentPublicKey: ownerSigner ? null : agentPublicKey,
	};
}
