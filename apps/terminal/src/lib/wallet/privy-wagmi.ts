import type { ConnectedWallet, User } from "@privy-io/react-auth";
import { isAddress, zeroAddress } from "viem";
import { getPrivyLoginIntent, type PrivyLoginIntent } from "./privy-login-method";

export type PrivyWalletIntent = "ambiguous" | "embedded" | "external" | "unavailable";

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

/** True when the user has any embedded Ethereum wallet, even one that cannot be selected unambiguously. */
export function hasPrivyEmbeddedWallet(user: User | null | undefined): boolean {
	if (isPrivyEmbeddedWallet(user?.wallet)) return true;
	return ((user?.linkedAccounts ?? []) as WalletIdentity[]).some(
		(account) => account.type === "wallet" && isPrivyEmbeddedWallet(account),
	);
}

function getPrivyExternalWalletAddresses(user: User | null | undefined): string[] {
	const walletAccounts: Array<WalletIdentity | null | undefined> = [
		user?.wallet as WalletIdentity | undefined,
		...((user?.linkedAccounts ?? []) as WalletIdentity[]),
	];
	const wallets = walletAccounts
		.filter((wallet): wallet is WalletIdentity => !!wallet && wallet.type !== "smart_wallet")
		.filter((wallet) => !isPrivyEmbeddedWallet(wallet))
		.flatMap((wallet) => {
			const address = normalizeAddress(wallet.address);
			return address ? [address] : [];
		});
	return [...new Set(wallets)];
}

function getExternalWalletIntentAddress(
	user: User | null | undefined,
	loginIntent: PrivyLoginIntent | undefined,
): string | undefined {
	const externalAddresses = getPrivyExternalWalletAddresses(user);
	const recordedAddress = normalizeAddress(loginIntent?.walletAddress);
	if (recordedAddress) {
		return externalAddresses.includes(recordedAddress) ? recordedAddress : undefined;
	}
	return externalAddresses.length === 1 ? externalAddresses[0] : undefined;
}

export function resolvePrivyWalletIntent(
	user: User | null | undefined,
	loginIntent: PrivyLoginIntent | undefined = getPrivyLoginIntent(user?.id),
): PrivyWalletIntent {
	if (!user) return "unavailable";
	if (loginIntent && loginIntent.userId !== user.id) return "ambiguous";

	const hasEmail = !!getPrivyEmailAddress(user);
	const embeddedWalletAddress = getPrivyEmbeddedWalletAddress(user);
	const externalWalletAddresses = getPrivyExternalWalletAddresses(user);
	if (loginIntent?.method === "email") return hasEmail ? "embedded" : "ambiguous";
	if (loginIntent?.method === "wallet") {
		return getExternalWalletIntentAddress(user, loginIntent) ? "external" : "ambiguous";
	}

	const couldUseEmbeddedWallet = hasEmail || !!embeddedWalletAddress;
	if (couldUseEmbeddedWallet && externalWalletAddresses.length > 0) return "ambiguous";
	if (couldUseEmbeddedWallet) return "embedded";
	if (externalWalletAddresses.length === 1) return "external";
	return "ambiguous";
}

/** A false result is not proof of an external wallet; it also includes ambiguous and unavailable identities. */
export function shouldUsePrivyEmbeddedWallet(user: User | null | undefined, loginIntent?: PrivyLoginIntent): boolean {
	return resolvePrivyWalletIntent(user, loginIntent) === "embedded";
}

export function selectPrivyWagmiWallet({
	loginIntent,
	wallets,
	user,
}: {
	loginIntent?: PrivyLoginIntent;
	wallets: ConnectedWallet[];
	user: User | null;
}): ConnectedWallet | undefined {
	if (wallets.length === 0) return undefined;

	const resolvedLoginIntent = loginIntent ?? getPrivyLoginIntent(user?.id);
	const walletIntent = resolvePrivyWalletIntent(user, resolvedLoginIntent);
	if (walletIntent === "embedded") {
		const embeddedWalletAddress = getPrivyEmbeddedWalletAddress(user);
		return wallets.find(
			(wallet) => isPrivyEmbeddedWallet(wallet) && hasSameWalletAddress(wallet.address, embeddedWalletAddress),
		);
	}
	if (walletIntent !== "external") return undefined;

	const externalWalletAddress = getExternalWalletIntentAddress(user, resolvedLoginIntent);
	return wallets.find(
		(wallet) => !isPrivyEmbeddedWallet(wallet) && hasSameWalletAddress(wallet.address, externalWalletAddress),
	);
}
