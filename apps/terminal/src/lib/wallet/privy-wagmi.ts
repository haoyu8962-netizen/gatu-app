import type { ConnectedWallet, User } from "@privy-io/react-auth";

function normalizeAddress(address: string | null | undefined): string | null {
	return address ? address.toLowerCase() : null;
}

export function hasSameWalletAddress(a: string | null | undefined, b: string | null | undefined): boolean {
	const normalizedA = normalizeAddress(a);
	const normalizedB = normalizeAddress(b);
	return !!normalizedA && !!normalizedB && normalizedA === normalizedB;
}

export function selectPrivyWagmiWallet({
	wallets,
	user,
}: {
	wallets: ConnectedWallet[];
	user: User | null;
}): ConnectedWallet | undefined {
	if (wallets.length === 0) return undefined;

	const userWalletAddress = user?.wallet?.address;
	if (userWalletAddress) {
		return wallets.find((wallet) => hasSameWalletAddress(wallet.address, userWalletAddress)) ?? wallets[0];
	}

	return wallets[0];
}
