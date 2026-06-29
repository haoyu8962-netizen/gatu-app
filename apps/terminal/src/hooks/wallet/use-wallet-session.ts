import { usePrivy } from "@privy-io/react-auth";
import { useConnection, useDisconnect } from "wagmi";
import {
	clearActiveAgentOwner,
	useAgentWalletActions,
	useHyperliquid,
	useHyperliquidOptional,
} from "@/lib/hyperliquid";
import { getPrivyEmailAddress, getPrivyEmbeddedWalletAddress, isPrivyEmbeddedWallet } from "@/lib/wallet/privy-wagmi";

export function useWalletSession() {
	const { ready, authenticated, login, logout, user } = usePrivy();
	const { address: connectedWalletAddress, isConnected: walletConnected, isConnecting } = useConnection();
	const hyperliquid = useHyperliquidOptional();

	const embeddedWalletAddress = ready && authenticated ? getPrivyEmbeddedWalletAddress(user) : undefined;
	const shouldUseEmbeddedWallet =
		!!embeddedWalletAddress && (!!getPrivyEmailAddress(user) || isPrivyEmbeddedWallet(user?.wallet));
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
	};
}

export function useDisconnectWallet() {
	const { logout, user } = usePrivy();
	const { walletAddress } = useWalletSession();
	const disconnect = useDisconnect();
	const { clientKey, env, sessionMode } = useHyperliquid();
	const { clearAgent } = useAgentWalletActions();

	async function disconnectWallet() {
		const sessionAddress = clientKey !== "disconnected" ? (clientKey as `0x${string}`) : undefined;
		const addressToClear =
			walletAddress ??
			(user?.wallet?.address as `0x${string}` | undefined) ??
			(sessionMode === "agent-only" ? sessionAddress : undefined);
		if (addressToClear) {
			clearAgent(env, addressToClear);
		}
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
