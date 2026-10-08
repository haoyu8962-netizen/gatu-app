import type { Address, WalletClient } from "viem";
import { useConnection } from "wagmi";
import { useConnectionWalletClient } from "./hooks/useConnectionWalletClient";
import { useHyperliquid } from "./provider";

export interface UseUserWalletResult {
	address: Address | undefined;
	walletClient: WalletClient | undefined;
	isConnected: boolean;
	isConnecting: boolean;
}

export function useUserWallet(): UseUserWalletResult {
	const { clientKey } = useHyperliquid();
	const { isConnected, isConnecting } = useConnection();
	const { data: walletClient } = useConnectionWalletClient();
	const hasUserSession = clientKey !== "disconnected";
	const address = hasUserSession ? (clientKey as Address) : undefined;

	return {
		address,
		walletClient: hasUserSession ? walletClient : undefined,
		isConnected: hasUserSession && isConnected,
		isConnecting,
	};
}
