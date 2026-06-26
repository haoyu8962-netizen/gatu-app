import type { ConnectedWallet, User } from "@privy-io/react-auth";
import { describe, expect, it } from "vitest";
import { hasSameWalletAddress, selectPrivyWagmiWallet } from "@/lib/wallet/privy-wagmi";

function wallet(address: string): ConnectedWallet {
	return { address } as ConnectedWallet;
}

function user(address: string | undefined): User {
	return { wallet: address ? { address } : undefined } as User;
}

describe("selectPrivyWagmiWallet", () => {
	it("selects the wallet matching the Privy user wallet address", () => {
		const wallets = [
			wallet("0x1111111111111111111111111111111111111111"),
			wallet("0x2222222222222222222222222222222222222222"),
		];

		expect(
			selectPrivyWagmiWallet({
				wallets,
				user: user("0x2222222222222222222222222222222222222222"),
			}),
		).toBe(wallets[1]);
	});

	it("matches addresses case-insensitively", () => {
		expect(
			hasSameWalletAddress("0xABCDEF0000000000000000000000000000000000", "0xabcdef0000000000000000000000000000000000"),
		).toBe(true);
	});

	it("falls back to the first wallet when the user wallet is not connected", () => {
		const wallets = [
			wallet("0x1111111111111111111111111111111111111111"),
			wallet("0x2222222222222222222222222222222222222222"),
		];

		expect(
			selectPrivyWagmiWallet({
				wallets,
				user: user("0x3333333333333333333333333333333333333333"),
			}),
		).toBe(wallets[0]);
	});
});
