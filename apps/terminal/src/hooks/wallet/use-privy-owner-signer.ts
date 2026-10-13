import type { AbstractViemJsonRpcAccount } from "@nktkas/hyperliquid/signing";
import { usePrivy, useSignTypedData, useWallets } from "@privy-io/react-auth";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import { useHyperliquid } from "@/lib/hyperliquid";
import { usePrivyLoginIntent } from "@/lib/wallet/privy-login-method";
import { createPrivyOwnerSigner } from "@/lib/wallet/privy-owner-signer";
import {
	getPrivyEmailAddress,
	getPrivyEmbeddedWalletAddress,
	hasSameWalletAddress,
	isPrivyEmbeddedWallet,
	resolvePrivyWalletIntent,
} from "@/lib/wallet/privy-wagmi";
import { useWalletSession } from "./use-wallet-session";

interface PrivyOwnerSignerValue {
	ownerAddress: `0x${string}` | undefined;
	wallet: AbstractViemJsonRpcAccount | null;
	assertCurrent: () => void;
}

export function usePrivyOwnerSigner(): PrivyOwnerSignerValue | null {
	const { authenticated, ready: authenticationReady, user } = usePrivy();
	const { ready: walletsReady, wallets } = useWallets();
	const { signTypedData } = useSignTypedData();
	const { clientKey, env, sessionMode } = useHyperliquid();
	const { connectedWalletAddress, embeddedWalletAddress, hasWalletAccess } = useWalletSession();
	const loginIntent = usePrivyLoginIntent(user?.id);
	const walletIntent = resolvePrivyWalletIntent(user, loginIntent);
	const usesOwnerSigner = authenticated && walletIntent !== "external" && sessionMode !== "agent-only";
	const ownerAddress = getPrivyEmbeddedWalletAddress(user);
	const userId = user?.id;
	const hasEmail = !!getPrivyEmailAddress(user);
	const embeddedWallet = wallets.find(
		(wallet) => isPrivyEmbeddedWallet(wallet) && hasSameWalletAddress(wallet.address, ownerAddress),
	);
	const signerReady =
		usesOwnerSigner &&
		walletIntent === "embedded" &&
		authenticationReady &&
		walletsReady &&
		hasWalletAccess &&
		hasEmail &&
		!!userId &&
		!!embeddedWallet &&
		hasSameWalletAddress(clientKey, ownerAddress) &&
		hasSameWalletAddress(connectedWalletAddress, ownerAddress) &&
		hasSameWalletAddress(embeddedWalletAddress, ownerAddress);
	const signTypedDataRef = useRef(signTypedData);
	useLayoutEffect(() => {
		signTypedDataRef.current = signTypedData;
	});
	const embeddedWalletAddress_ = embeddedWallet?.address;
	const session = useMemo(
		() => ({ signerReady, ownerAddress, env, userId, embeddedWalletAddress: embeddedWalletAddress_ }),
		[signerReady, ownerAddress, env, userId, embeddedWalletAddress_],
	);
	const activeSessionRef = useRef<typeof session | null>(null);

	useLayoutEffect(() => {
		activeSessionRef.current = session;
		return () => {
			activeSessionRef.current = null;
		};
	}, [session]);

	const assertCurrent = useCallback(() => {
		if (!session.signerReady || activeSessionRef.current !== session) {
			throw new Error("The embedded owner signing session is no longer available.");
		}
	}, [session]);

	return useMemo(() => {
		if (!usesOwnerSigner) return null;
		return {
			ownerAddress,
			wallet:
				signerReady && ownerAddress
					? createPrivyOwnerSigner({
							ownerAddress,
							chainId: env === "Testnet" ? arbitrumSepolia.id : arbitrum.id,
							signTypedData: (...args) => signTypedDataRef.current(...args),
							assertCurrent,
						})
					: null,
			assertCurrent,
		};
	}, [usesOwnerSigner, ownerAddress, signerReady, env, assertCurrent]);
}
