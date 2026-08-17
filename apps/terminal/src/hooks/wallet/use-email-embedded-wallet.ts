import { useCreateWallet, usePrivy } from "@privy-io/react-auth";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
	getPrivyEmailAddress,
	getPrivyEmbeddedWalletAddress,
	getPrivyRecentLoginMethod,
	shouldUsePrivyEmbeddedWallet,
} from "@/lib/wallet/privy-wagmi";

const EMBEDDED_WALLET_CREATE_TIMEOUT_MS = 20_000;
type EmbeddedWalletAddress = `0x${string}`;

interface EmbeddedWalletCreation {
	promise: Promise<EmbeddedWalletAddress>;
	requestId: number;
	session: EmailWalletSession;
}

interface EmailWalletSession {
	epoch: number;
	identity: string | null;
}

interface SessionAddress {
	address: EmbeddedWalletAddress;
	session: EmailWalletSession;
}

interface SessionCreationState {
	error: unknown;
	isCreating: boolean;
	session: EmailWalletSession;
}

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
	const pendingRef = useRef<EmbeddedWalletCreation | null>(null);
	const nextRequestIdRef = useRef(0);
	const [createdAddress, setCreatedAddress] = useState<SessionAddress | null>(null);
	const [creationState, setCreationState] = useState<SessionCreationState | null>(null);

	const userId = user?.id;
	const emailAddress = getPrivyEmailAddress(user);
	const userEmbeddedWalletAddress = ready && authenticated ? getPrivyEmbeddedWalletAddress(user) : undefined;
	const shouldUseEmbeddedWallet =
		shouldUsePrivyEmbeddedWallet(user) || (getPrivyRecentLoginMethod() === "email" && !!emailAddress);
	const sessionIdentity =
		ready && authenticated && userId && emailAddress && shouldUseEmbeddedWallet
			? `${userId}\u0000${emailAddress.toLowerCase()}`
			: null;
	const committedSessionRef = useRef<EmailWalletSession>({ epoch: 0, identity: sessionIdentity });
	const committedSession = committedSessionRef.current;
	const session =
		committedSession.identity === sessionIdentity
			? committedSession
			: { epoch: committedSession.epoch + 1, identity: sessionIdentity };

	useLayoutEffect(() => {
		committedSessionRef.current = session;
	}, [session]);

	const createdEmbeddedWalletAddress = createdAddress?.session === session ? createdAddress.address : undefined;
	const embeddedWalletAddress = userEmbeddedWalletAddress ?? createdEmbeddedWalletAddress;
	const currentCreationState = creationState?.session === session ? creationState : null;
	const isCreatingEmbeddedWallet = currentCreationState?.isCreating ?? false;
	const embeddedWalletError = currentCreationState?.error ?? null;
	const needsEmbeddedWallet = ready && authenticated && shouldUseEmbeddedWallet && !embeddedWalletAddress;

	const ensureEmailEmbeddedWallet = useCallback(async (): Promise<EmbeddedWalletAddress> => {
		if (embeddedWalletAddress) return embeddedWalletAddress;
		if (!sessionIdentity) {
			throw new Error("Email wallet session is not ready");
		}
		if (pendingRef.current?.session === session) return pendingRef.current.promise;

		const requestId = nextRequestIdRef.current + 1;
		nextRequestIdRef.current = requestId;
		setCreationState({ error: null, isCreating: true, session });

		const pending = withTimeout(
			Promise.resolve().then(() => createWallet()),
			EMBEDDED_WALLET_CREATE_TIMEOUT_MS,
		)
			.then((wallet) => {
				if (committedSessionRef.current !== session || pendingRef.current?.requestId !== requestId) {
					throw new Error("Email wallet session changed during wallet creation");
				}
				if (!wallet.address) {
					throw new Error("Embedded wallet was created without an address");
				}
				const address = wallet.address as EmbeddedWalletAddress;
				setCreatedAddress({ address, session });
				return address;
			})
			.catch((error) => {
				if (committedSessionRef.current === session && pendingRef.current?.requestId === requestId) {
					setCreationState({ error, isCreating: false, session });
				}
				throw error;
			})
			.finally(() => {
				if (pendingRef.current?.requestId === requestId) {
					pendingRef.current = null;
				}
				if (committedSessionRef.current === session) {
					setCreationState((current) => (current?.session === session ? { ...current, isCreating: false } : current));
				}
			});

		pendingRef.current = { promise: pending, requestId, session };
		return pending;
	}, [createWallet, embeddedWalletAddress, session, sessionIdentity]);

	return {
		emailAddress,
		embeddedWalletAddress,
		shouldUseEmbeddedWallet,
		needsEmbeddedWallet,
		isCreatingEmbeddedWallet: embeddedWalletAddress ? false : isCreatingEmbeddedWallet,
		embeddedWalletError: embeddedWalletAddress ? null : embeddedWalletError,
		ensureEmailEmbeddedWallet,
	};
}
