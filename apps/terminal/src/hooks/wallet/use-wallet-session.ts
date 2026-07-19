import { useConnectWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";
import { useCallback, useState } from "react";
import { useConnection } from "wagmi";
import { clearActiveAgentOwner, useHyperliquid, useHyperliquidOptional } from "@/lib/hyperliquid";
import {
	getPrivyEmbeddedWalletAddress,
	hasSameWalletAddress,
	selectPrivyWagmiWallet,
	shouldUsePrivyEmbeddedWallet,
} from "@/lib/wallet/privy-wagmi";

export function useWalletSession() {
	const { ready, authenticated, login, logout, user } = usePrivy();
	const { address: connectedWalletAddress, isConnected: walletConnected, isConnecting } = useConnection();
	const hyperliquid = useHyperliquidOptional();

	const embeddedWalletAddress = ready && authenticated ? getPrivyEmbeddedWalletAddress(user) : undefined;
	const shouldUseEmbeddedWallet = ready && authenticated && shouldUsePrivyEmbeddedWallet(user);
	const embeddedWalletIsActive = hasSameWalletAddress(embeddedWalletAddress, connectedWalletAddress);
	const walletAddress = shouldUseEmbeddedWallet
		? embeddedWalletIsActive
			? embeddedWalletAddress
			: undefined
		: connectedWalletAddress;
	const hasWalletSession = ready && authenticated && !!walletAddress;
	const agentAddress =
		hyperliquid?.sessionMode === "agent-only" && hyperliquid.clientKey !== "disconnected"
			? (hyperliquid.clientKey as `0x${string}`)
			: undefined;
	const address = hasWalletSession ? walletAddress : agentAddress;
	const displayAddress = address;
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

export function useReconnectWallet() {
	const { authenticated, login, user } = usePrivy();
	const { ready: walletsReady, wallets } = useWallets();
	const { connectWallet } = useConnectWallet();
	const { setActiveWallet } = useSetActiveWallet();
	const [isReconnecting, setIsReconnecting] = useState(false);

	const reconnectWallet = useCallback(async () => {
		if (isReconnecting || !walletsReady) return;

		setIsReconnecting(true);
		try {
			if (!authenticated) {
				login();
				return;
			}

			const preferredWallet = selectPrivyWagmiWallet({ wallets, user });
			if (preferredWallet) {
				await setActiveWallet(preferredWallet);
				return;
			}

			connectWallet({
				walletChainType: "ethereum-only",
				suggestedAddress: user?.wallet?.address,
			});
		} finally {
			setIsReconnecting(false);
		}
	}, [authenticated, connectWallet, isReconnecting, login, setActiveWallet, user, wallets, walletsReady]);

	return { reconnectWallet, walletsReady, isReconnecting };
}

export function useDisconnectWallet() {
	const { logout, user } = usePrivy();
	const { walletAddress } = useWalletSession();
	const { sessionMode } = useHyperliquid();
	const [isDisconnecting, setIsDisconnecting] = useState(false);

	async function disconnectWallet() {
		if (isDisconnecting) return;
		clearActiveAgentOwner();

		if (sessionMode === "agent-only" && !walletAddress && !user?.wallet?.address) {
			return;
		}

		setIsDisconnecting(true);
		try {
			await logout();
		} finally {
			setIsDisconnecting(false);
		}
	}

	return {
		disconnectWallet,
		isDisconnecting,
	};
}
