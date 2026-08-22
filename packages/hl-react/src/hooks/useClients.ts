import type { ExchangeClient, InfoClient, SubscriptionClient } from "@nktkas/hyperliquid";
import { useMemo } from "react";
import { useWalletClient } from "wagmi";
import { createExchangeClient, getTradingClient } from "../clients";
import { useHyperliquid } from "../provider";
import { useAgentWallet } from "../signing/use-agent-wallet";
import { toHyperliquidWallet, walletClientMatchesAddress } from "../wallet";

export interface HyperliquidClients {
	info: InfoClient;
	subscription: SubscriptionClient;
	/** Exchange client using agent wallet - for L1 trading actions (order, cancel, etc.) */
	trading: ExchangeClient | null;
	/** Exchange client using user wallet - for EIP-712/user-signed actions such as approvals, transfers, and withdrawals. */
	user: ExchangeClient | null;
	userWalletMismatch: boolean;
	agentPublicKey: `0x${string}` | null;
}

export function useHyperliquidClients(): HyperliquidClients {
	const { info, subscription, isTestnet, clientKey, sessionMode } = useHyperliquid();
	const { signer, address: agentPublicKey, isReady: agentReady } = useAgentWallet();
	const { data: walletClient } = useWalletClient();
	const hasUserSession = clientKey !== "disconnected";
	const address = hasUserSession ? (clientKey as `0x${string}`) : undefined;

	const trading = (() => {
		if (!hasUserSession || !signer || !agentReady) return null;
		return getTradingClient(signer, isTestnet);
	})();

	const userWalletMismatch =
		sessionMode === "wallet" && !!walletClient && !!address && !walletClientMatchesAddress(walletClient, address);
	const user = useMemo(() => {
		if (sessionMode !== "wallet" || !walletClient || !address) return null;
		if (!walletClientMatchesAddress(walletClient, address)) return null;
		const wallet = toHyperliquidWallet(walletClient, address);
		if (!wallet) return null;
		return createExchangeClient(wallet, isTestnet);
	}, [address, isTestnet, sessionMode, walletClient]);

	return {
		info,
		subscription,
		trading,
		user,
		userWalletMismatch,
		agentPublicKey,
	};
}
