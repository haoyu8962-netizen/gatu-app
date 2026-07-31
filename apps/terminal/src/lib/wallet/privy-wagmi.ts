import type { ConnectedWallet, User } from "@privy-io/react-auth";
import { isAddress, zeroAddress } from "viem";

interface WalletIdentity {
	address?: string;
	chainType?: string;
	connectorType?: string;
	walletIndex?: number | null;
	walletClientType?: string;
	type?: string;
}

function normalizeAddress(address: string | null | undefined): string | null {
	if (!address) return null;
	const candidate = address.startsWith("0X") ? `0x${address.slice(2)}` : address;
	if (!isAddress(candidate, { strict: false }) || candidate.toLowerCase() === zeroAddress) return null;
	return candidate.toLowerCase();
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
	const primaryWalletAddress = normalizeAddress(user?.wallet?.address);
	if (isPrivyEmbeddedWallet(user?.wallet) && primaryWalletAddress) {
		return primaryWalletAddress as `0x${string}`;
	}

	const embeddedWallets = ((user?.linkedAccounts ?? []) as WalletIdentity[])
		.filter((account) => account.type === "wallet" && isPrivyEmbeddedWallet(account))
		.flatMap((wallet) => {
			const address = normalizeAddress(wallet.address);
			return address ? [{ address, walletIndex: wallet.walletIndex ?? null }] : [];
		});

	const uniqueByAddress = new Map(embeddedWallets.map((wallet) => [wallet.address, wallet]));
	const uniqueWallets = [...uniqueByAddress.values()];
	if (uniqueWallets.length === 1) return uniqueWallets[0]?.address as `0x${string}`;

	// Privy designates walletIndex 0 as the primary HD embedded wallet. If
	// multiple embedded wallets exist without one unambiguous primary, fail
	// closed instead of selecting whichever linked account happens to be first.
	const primaryHdWallets = uniqueWallets.filter((wallet) => wallet.walletIndex === 0);
	return primaryHdWallets.length === 1 ? (primaryHdWallets[0]?.address as `0x${string}`) : undefined;
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
		return wallets.find(
			(wallet) => isPrivyEmbeddedWallet(wallet) && hasSameWalletAddress(wallet.address, embeddedWalletAddress),
		);
	}

	const userWalletAddress = user?.wallet?.address;
	if (userWalletAddress) {
		return wallets.find((wallet) => hasSameWalletAddress(wallet.address, userWalletAddress));
	}

	return undefined;
}
