import { usePrivy } from "@privy-io/react-auth";
import { useConnection, useDisconnect } from "wagmi";
import { useAgentWalletActions, useHyperliquid } from "@/lib/hyperliquid";

export function useWalletSession() {
	const { ready, authenticated, login, logout, user } = usePrivy();
	const { address: walletAddress, isConnected: walletConnected, isConnecting } = useConnection();

	const address = ready && authenticated && walletConnected ? walletAddress : undefined;
	const displayAddress =
		ready && authenticated ? (address ?? (user?.wallet?.address as `0x${string}` | undefined)) : undefined;

	return {
		ready,
		authenticated,
		login,
		logout,
		user,
		address,
		displayAddress,
		walletAddress,
		walletConnected,
		isConnected: !!address,
		isConnecting,
	};
}

export function useDisconnectWallet() {
	const { logout, user } = usePrivy();
	const { address: walletAddress } = useConnection();
	const disconnect = useDisconnect();
	const { env } = useHyperliquid();
	const { clearAgent } = useAgentWalletActions();

	async function disconnectWallet() {
		const addressToClear = walletAddress ?? (user?.wallet?.address as `0x${string}` | undefined);
		if (addressToClear) {
			clearAgent(env, addressToClear);
		}

		try {
			await disconnect.mutateAsync();
		} finally {
			await logout();
		}
	}

	return {
		disconnectWallet,
		isDisconnecting: disconnect.isPending,
	};
}
