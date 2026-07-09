import { usePrivy } from "@privy-io/react-auth";
import { useConnection, useDisconnect } from "wagmi";
import { clearActiveAgentOwner, useHyperliquid, useHyperliquidOptional } from "@/lib/hyperliquid";
import { getPrivyEmbeddedWalletAddress, shouldUsePrivyEmbeddedWallet } from "@/lib/wallet/privy-wagmi";

export function useWalletSession() {
	const { ready, authenticated, login, logout, user } = usePrivy();
	const { address: connectedWalletAddress, isConnected: walletConnected, isConnecting } = useConnection();
	const hyperliquid = useHyperliquidOptional();

	const embeddedWalletAddress = ready && authenticated ? getPrivyEmbeddedWalletAddress(user) : undefined;
	const shouldUseEmbeddedWallet = ready && authenticated && shouldUsePrivyEmbeddedWallet(user);
	const walletAddress = shouldUseEmbeddedWallet ? embeddedWalletAddress : connectedWalletAddress;
	const hasWalletSession = ready && authenticated && !!walletAddress;
	const agentAddress =
		hyperliquid?.sessionMode === "agent-only" && hyperliquid.clientKey !== "disconnected"
			? (hyperliquid.clientKey as `0x${string}`)
			: undefined;
	const address = hasWalletSession ? walletAddress : agentAddress;
	const displayAddress =
		address ?? (ready && authenticated ? (user?.wallet?.address as `0x${string}` | undefined) : undefined);
	const sessionMode = hyperliquid?.sessionMode ?? (hasWalletSession ? "wallet" : "disconnected");

	return {
		ready,
		authenticated,
		login,
		logout,
		user,
		address,
		displayAddress,
		walletAddress,
		connectedWalletAddress,
		embeddedWalletAddress,
		walletConnected,
		isConnected: !!address,
		isConnecting,
		sessionMode,
		hasWalletAccess: sessionMode === "wallet" && !!walletAddress,
	};
}

export function useDisconnectWallet() {
	const { logout, user } = usePrivy();
	const { walletAddress } = useWalletSession();
	const disconnect = useDisconnect();
	const { sessionMode } = useHyperliquid();

	async function disconnectWallet() {
		clearActiveAgentOwner();

		if (sessionMode === "agent-only" && !walletAddress && !user?.wallet?.address) {
			return;
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
