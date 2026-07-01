import type { ConnectedWallet, User } from "@privy-io/react-auth";

interface WalletIdentity {
	address?: string;
	chainType?: string;
	connectorType?: string;
	walletClientType?: string;
	type?: string;
}

function normalizeAddress(address: string | null | undefined): string | null {
	return address ? address.toLowerCase() : null;
}

export function hasSameWalletAddress(a: string | null | undefined, b: string | null | undefined): boolean {
	const normalizedA = normalizeAddress(a);
	const normalizedB = normalizeAddress(b);
	return !!normalizedA && !!normalizedB && normalizedA === normalizedB;
}

export function isPrivyEmbeddedWallet(wallet: WalletIdentity | null | undefined): boolean {
	if (!wallet || wallet.chainType === "solana") return false;
	return (
		wallet.walletClientType === "privy" || wallet.walletClientType === "privy-v2" || wallet.connectorType === "embedded"
	);
}

export function getPrivyEmailAddress(user: User | null | undefined): string | undefined {
	return (
		user?.email?.address ??
		user?.linkedAccounts?.find((account) => account.type === "email" && "address" in account)?.address
	);
}

export function getPrivyEmbeddedWalletAddress(user: User | null | undefined): `0x${string}` | undefined {
	if (isPrivyEmbeddedWallet(user?.wallet)) return user?.wallet?.address as `0x${string}`;

	const embeddedWallet = user?.linkedAccounts?.find(
		(account) => account.type === "wallet" && isPrivyEmbeddedWallet(account),
	);
	if (!embeddedWallet || !("address" in embeddedWallet)) return undefined;
	return embeddedWallet.address as `0x${string}`;
}

export function getPrivyRecentLoginMethod(): string | undefined {
	if (typeof window === "undefined") return undefined;

	try {
		const configuredAppId = import.meta.env.VITE_PRIVY_APP_ID as string | undefined;
		if (configuredAppId) {
			const value = window.localStorage.getItem(`privy:${configuredAppId}:recent-login-method`);
			if (value) return value;
		}

		for (let i = 0; i < window.localStorage.length; i += 1) {
			const key = window.localStorage.key(i);
			if (!key?.startsWith("privy:") || !key.endsWith(":recent-login-method")) continue;
			const value = window.localStorage.getItem(key);
			if (value) return value;
		}
	} catch {}

	return undefined;
}

export function shouldUsePrivyEmbeddedWallet(user: User | null | undefined): boolean {
	const embeddedWalletAddress = getPrivyEmbeddedWalletAddress(user);
	if (!embeddedWalletAddress) return false;
	if (isPrivyEmbeddedWallet(user?.wallet)) return true;

	const recentLoginMethod = getPrivyRecentLoginMethod();
	if (recentLoginMethod === "email") return !!getPrivyEmailAddress(user);
	if (recentLoginMethod === "wallet") return false;

	return !user?.wallet?.address && !!getPrivyEmailAddress(user);
}

export function selectPrivyWagmiWallet({
	wallets,
	user,
}: {
	wallets: ConnectedWallet[];
	user: User | null;
}): ConnectedWallet | undefined {
	if (wallets.length === 0) return undefined;

	const embeddedWalletAddress = getPrivyEmbeddedWalletAddress(user);
	if (shouldUsePrivyEmbeddedWallet(user)) {
		return (
			wallets.find(
				(wallet) => isPrivyEmbeddedWallet(wallet) && hasSameWalletAddress(wallet.address, embeddedWalletAddress),
			) ??
			wallets.find((wallet) => hasSameWalletAddress(wallet.address, embeddedWalletAddress)) ??
			wallets.find(isPrivyEmbeddedWallet)
		);
	}

	const userWalletAddress = user?.wallet?.address;
	if (userWalletAddress) {
		return wallets.find((wallet) => hasSameWalletAddress(wallet.address, userWalletAddress)) ?? wallets[0];
	}

	return wallets[0];
}
