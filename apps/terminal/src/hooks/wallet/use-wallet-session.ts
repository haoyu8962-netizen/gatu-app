import { t } from "@lingui/core/macro";
import { useConnectWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { type Address, isAddress, zeroAddress } from "viem";
import { useConnection } from "wagmi";
import { closeAgentRegistrationSessionAndRemove, useHyperliquid, useHyperliquidOptional } from "@/lib/hyperliquid";
import { clearPrivyLoginMethod, usePrivyLoginIntent } from "@/lib/wallet/privy-login-method";
import {
	getPrivyEmailAddress,
	getPrivyEmbeddedWalletAddress,
	hasSameWalletAddress,
	resolvePrivyWalletIntent,
	selectPrivyWagmiWallet,
} from "@/lib/wallet/privy-wagmi";

interface VerifiedExternalWalletOwner {
	privyUserId: string;
	env: "Mainnet" | "Testnet";
	address: Address;
}

let verifiedExternalWalletOwner: VerifiedExternalWalletOwner | null = null;

function rememberVerifiedExternalWalletOwner(owner: VerifiedExternalWalletOwner): void {
	verifiedExternalWalletOwner = owner;
}

function readVerifiedExternalWalletOwner(
	privyUserId: string | undefined,
	env: "Mainnet" | "Testnet",
): Address | undefined {
	if (
		!privyUserId ||
		verifiedExternalWalletOwner?.privyUserId !== privyUserId ||
		verifiedExternalWalletOwner.env !== env
	) {
		return undefined;
	}
	return verifiedExternalWalletOwner.address;
}

function notifyWalletConnectionFailure(): void {
	toast.error(t`Wallet connection failed. Unlock your wallet, approve the connection, then retry.`);
}

function notifyEmailWalletUnavailable(): void {
	toast.error(t`Your email wallet is unavailable. Sign out and log in again with the same email, then retry.`);
}

/** @internal — exported only for deterministic session-boundary tests. */
export function clearVerifiedExternalWalletOwner(): void {
	verifiedExternalWalletOwner = null;
}

export function useWalletSession() {
	const { ready, authenticated, login, logout, user } = usePrivy();
	const { ready: walletsReady, wallets } = useWallets();
	const {
		address: connectedWalletAddress,
		isConnected: walletConnected,
		isConnecting,
		isReconnecting,
	} = useConnection();
	const hyperliquid = useHyperliquidOptional();
	const sessionReady = ready && walletsReady;
	const signerReady = sessionReady && walletConnected && !isConnecting && !isReconnecting;
	const loginIntent = usePrivyLoginIntent(sessionReady && authenticated ? user?.id : undefined);
	const walletIntent = sessionReady && authenticated ? resolvePrivyWalletIntent(user, loginIntent) : "unavailable";

	const embeddedWalletAddress = sessionReady && authenticated ? getPrivyEmbeddedWalletAddress(user) : undefined;
	const selectedPrivyWallet =
		sessionReady && (walletIntent === "embedded" || walletIntent === "external")
			? selectPrivyWagmiWallet({ loginIntent, wallets, user })
			: undefined;
	const selectedWalletIsActive =
		signerReady && !!selectedPrivyWallet && hasSameWalletAddress(selectedPrivyWallet.address, connectedWalletAddress);
	const embeddedWalletIsActive =
		selectedWalletIsActive && hasSameWalletAddress(selectedPrivyWallet?.address, embeddedWalletAddress);
	const externalWalletIsActive = walletIntent === "external" && selectedWalletIsActive;
	const walletAddress = resolveSessionWalletAddress({
		walletIntent,
		embeddedWalletIsActive,
		externalWalletIsActive,
		embeddedWalletAddress,
		connectedWalletAddress,
	});
	const hasWalletSession = signerReady && authenticated && !!walletAddress;
	const agentAddress =
		hyperliquid?.sessionMode === "agent-only" && hyperliquid.clientKey !== "disconnected"
			? (hyperliquid.clientKey as `0x${string}`)
			: undefined;
	const address = hasWalletSession ? walletAddress : agentAddress;
	const displayAddress = address;
	const sessionMode = hyperliquid?.sessionMode ?? (hasWalletSession ? "wallet" : "disconnected");

	return {
		ready: sessionReady,
		authenticationReady: ready,
		walletDirectoryReady: walletsReady,
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
		walletIntent,
		isConnected: !!address,
		isConnecting,
		isReconnecting,
		sessionMode,
		hasWalletAccess: sessionMode === "wallet" && hasWalletSession,
	};
}

function resolveSessionWalletAddress({
	walletIntent,
	embeddedWalletIsActive,
	externalWalletIsActive,
	embeddedWalletAddress,
	connectedWalletAddress,
}: {
	walletIntent: ReturnType<typeof resolvePrivyWalletIntent>;
	embeddedWalletIsActive: boolean;
	externalWalletIsActive: boolean;
	embeddedWalletAddress: `0x${string}` | undefined;
	connectedWalletAddress: `0x${string}` | undefined;
}): `0x${string}` | undefined {
	if (walletIntent === "embedded") return embeddedWalletIsActive ? embeddedWalletAddress : undefined;
	return walletIntent === "external" && externalWalletIsActive ? connectedWalletAddress : undefined;
}

export function useReconnectWallet() {
	const { authenticated, login, user } = usePrivy();
	const { ready: walletsReady, wallets } = useWallets();
	const { connectWallet } = useConnectWallet();
	const { setActiveWallet } = useSetActiveWallet();
	const [isReconnecting, setIsReconnecting] = useState(false);
	const loginIntent = usePrivyLoginIntent(authenticated ? user?.id : undefined);
	const walletIntent = authenticated ? resolvePrivyWalletIntent(user, loginIntent) : "unavailable";

	const reconnectWallet = useCallback(async () => {
		if (isReconnecting || !walletsReady) return;

		setIsReconnecting(true);
		try {
			if (!authenticated) {
				login();
				return;
			}

			if (walletIntent === "ambiguous" || walletIntent === "unavailable") {
				if (getPrivyEmailAddress(user)) notifyEmailWalletUnavailable();
				else notifyWalletConnectionFailure();
				return;
			}

			const preferredWallet = selectPrivyWagmiWallet({ loginIntent, wallets, user });
			if (preferredWallet) {
				await setActiveWallet(preferredWallet);
				return;
			}
			if (walletIntent === "embedded") {
				// An email session must never fall back to an arbitrary
				// external wallet while its exact embedded signer is absent
				// or ambiguous.
				notifyEmailWalletUnavailable();
				return;
			}

			connectWallet({
				walletChainType: "ethereum-only",
				suggestedAddress:
					loginIntent?.method === "wallet" && loginIntent.walletAddress
						? loginIntent.walletAddress
						: user?.wallet?.address,
			});
		} catch {
			if (walletIntent === "embedded" || (walletIntent === "ambiguous" && !!getPrivyEmailAddress(user))) {
				notifyEmailWalletUnavailable();
			} else {
				notifyWalletConnectionFailure();
			}
		} finally {
			setIsReconnecting(false);
		}
	}, [
		authenticated,
		connectWallet,
		isReconnecting,
		login,
		loginIntent,
		setActiveWallet,
		user,
		walletIntent,
		wallets,
		walletsReady,
	]);

	return { reconnectWallet, walletsReady, isReconnecting };
}

export function useDisconnectWallet() {
	const { authenticated, logout, user } = usePrivy();
	const { embeddedWalletAddress, walletAddress, walletIntent } = useWalletSession();
	const { clientKey, env, sessionMode } = useHyperliquid();
	const [isDisconnecting, setIsDisconnecting] = useState(false);
	const embeddedSession = walletIntent === "embedded";
	const privyUserId = authenticated ? user?.id : undefined;

	useEffect(() => {
		if (!authenticated || !privyUserId) {
			clearVerifiedExternalWalletOwner();
			return;
		}
		if (
			verifiedExternalWalletOwner &&
			(verifiedExternalWalletOwner.privyUserId !== privyUserId || verifiedExternalWalletOwner.env !== env)
		) {
			clearVerifiedExternalWalletOwner();
		}
		if (walletIntent === "ambiguous") {
			clearVerifiedExternalWalletOwner();
			return;
		}
		if (embeddedSession || sessionMode !== "wallet") return;

		const exactWallet = normalizeEvmAddress(walletAddress);
		const activeClient = normalizeEvmAddress(clientKey === "disconnected" ? undefined : clientKey);
		if (exactWallet && activeClient && hasSameWalletAddress(exactWallet, activeClient)) {
			rememberVerifiedExternalWalletOwner({ privyUserId, env, address: exactWallet });
		}
	}, [authenticated, clientKey, embeddedSession, env, privyUserId, sessionMode, walletAddress, walletIntent]);

	async function disconnectWallet() {
		if (isDisconnecting) return;
		setIsDisconnecting(true);
		try {
			const ownerAddress = resolveDisconnectOwner({
				authenticated,
				clientKey,
				embeddedWalletAddress,
				embeddedSession,
				env,
				privyUserId,
				sessionMode,
				walletAddress,
				walletIntent,
			});
			if (!ownerAddress) {
				toast.error(
					t`Secure disconnect failed because the active trading account could not be verified. Please retry.`,
				);
				return;
			}

			let shutdown: Awaited<ReturnType<typeof closeAgentRegistrationSessionAndRemove>>;
			try {
				shutdown = await closeAgentRegistrationSessionAndRemove(env, ownerAddress);
			} catch {
				toast.error(t`Secure disconnect failed because the local trading key could not be removed. Please retry.`);
				return;
			}
			if (shutdown.status === "failed") {
				toast.error(
					shutdown.reason === "lock_unavailable"
						? t`Secure disconnect requires Web Locks support. Update your browser and try again.`
						: shutdown.reason === "owner_cleanup_failed"
							? t`Secure disconnect failed because the local trading session could not be cleared. Please retry.`
							: t`Secure disconnect failed because the local trading key could not be removed. Please retry.`,
				);
				return;
			}

			clearVerifiedExternalWalletOwner();
			if (sessionMode === "agent-only" && !authenticated) {
				return;
			}
			try {
				await logout();
				clearPrivyLoginMethod(privyUserId);
			} catch {
				toast.error(
					t`The wallet session could not be closed, but the local trading key was removed. Retry disconnecting the wallet.`,
				);
			}
		} finally {
			setIsDisconnecting(false);
		}
	}

	return {
		disconnectWallet,
		isDisconnecting,
	};
}

function normalizeEvmAddress(value: string | null | undefined): Address | undefined {
	if (!value) return undefined;
	const candidate = value.startsWith("0X") ? `0x${value.slice(2)}` : value;
	if (!isAddress(candidate, { strict: false }) || candidate.toLowerCase() === zeroAddress) return undefined;
	return candidate.toLowerCase() as Address;
}

function resolveDisconnectOwner({
	authenticated,
	clientKey,
	embeddedWalletAddress,
	embeddedSession,
	env,
	privyUserId,
	sessionMode,
	walletAddress,
	walletIntent,
}: {
	authenticated: boolean;
	clientKey: string;
	embeddedWalletAddress: Address | undefined;
	embeddedSession: boolean;
	env: "Mainnet" | "Testnet";
	privyUserId: string | undefined;
	sessionMode: "wallet" | "agent-only" | "disconnected";
	walletAddress: Address | undefined;
	walletIntent: ReturnType<typeof resolvePrivyWalletIntent>;
}): Address | undefined {
	const activeClient = normalizeEvmAddress(clientKey === "disconnected" ? undefined : clientKey);

	if (sessionMode === "agent-only") {
		return activeClient;
	}
	if (walletIntent === "ambiguous" || walletIntent === "unavailable") return undefined;

	const exactWallet = normalizeEvmAddress(walletAddress);
	if (sessionMode === "wallet") {
		if (!exactWallet || !activeClient || !hasSameWalletAddress(activeClient, exactWallet)) return undefined;
		return exactWallet;
	}

	if (!authenticated) return undefined;
	if (embeddedSession) return normalizeEvmAddress(embeddedWalletAddress);
	return readVerifiedExternalWalletOwner(privyUserId, env);
}
