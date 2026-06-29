import { useCreateWallet, usePrivy } from "@privy-io/react-auth";
import { useCallback, useRef, useState } from "react";
import { getPrivyEmailAddress, getPrivyEmbeddedWalletAddress } from "@/lib/wallet/privy-wagmi";

const EMBEDDED_WALLET_CREATE_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => reject(new Error("Embedded wallet creation timed out")), timeoutMs);
	});

	return Promise.race([promise, timeout]).finally(() => {
		if (timeoutId) clearTimeout(timeoutId);
	});
}

export function useEmailEmbeddedWallet() {
	const { ready, authenticated, user } = usePrivy();
	const { createWallet } = useCreateWallet();
	const pendingRef = useRef<Promise<`0x${string}`> | null>(null);
	const [isCreatingEmbeddedWallet, setIsCreatingEmbeddedWallet] = useState(false);
	const [embeddedWalletError, setEmbeddedWalletError] = useState<unknown>(null);

	const emailAddress = getPrivyEmailAddress(user);
	const embeddedWalletAddress = ready && authenticated ? getPrivyEmbeddedWalletAddress(user) : undefined;
	const needsEmbeddedWallet = ready && authenticated && !!emailAddress && !embeddedWalletAddress;

	const ensureEmailEmbeddedWallet = useCallback(async (): Promise<`0x${string}`> => {
		if (embeddedWalletAddress) return embeddedWalletAddress;
		if (!ready || !authenticated || !emailAddress) {
			throw new Error("Email wallet session is not ready");
		}
		if (pendingRef.current) return pendingRef.current;

		setIsCreatingEmbeddedWallet(true);
		setEmbeddedWalletError(null);

		const pending = withTimeout(createWallet(), EMBEDDED_WALLET_CREATE_TIMEOUT_MS)
			.then((wallet) => {
				if (!wallet.address) {
					throw new Error("Embedded wallet was created without an address");
				}
				return wallet.address as `0x${string}`;
			})
			.catch((error) => {
				setEmbeddedWalletError(error);
				throw error;
			})
			.finally(() => {
				pendingRef.current = null;
				setIsCreatingEmbeddedWallet(false);
			});

		pendingRef.current = pending;
		return pending;
	}, [authenticated, createWallet, emailAddress, embeddedWalletAddress, ready]);

	return {
		emailAddress,
		embeddedWalletAddress,
		needsEmbeddedWallet,
		isCreatingEmbeddedWallet,
		embeddedWalletError,
		ensureEmailEmbeddedWallet,
	};
}
