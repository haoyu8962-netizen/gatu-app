import type { ConnectedWallet, User } from "@privy-io/react-auth";
import { describe, expect, it } from "vitest";
import {
	getPrivyEmailAddress,
	getPrivyEmbeddedWalletAddress,
	hasSameWalletAddress,
	selectPrivyWagmiWallet,
} from "@/lib/wallet/privy-wagmi";

function wallet(address: string, walletClientType = "metamask", connectorType = "injected"): ConnectedWallet {
	return { address, connectorType, walletClientType } as ConnectedWallet;
}

function user(address: string | undefined, walletClientType = "metamask"): User {
	return { wallet: address ? { address, walletClientType } : undefined } as User;
}

function emailUser({
	email = "trader@example.com",
	embeddedAddress,
}: {
	email?: string;
	embeddedAddress: string;
}): User {
	return {
		email: { address: email },
		linkedAccounts: [
			{ address: email, type: "email" },
			{
				address: embeddedAddress,
				chainType: "ethereum",
				connectorType: "embedded",
				type: "wallet",
				walletClientType: "privy",
			},
		],
		wallet: {
			address: embeddedAddress,
			chainType: "ethereum",
			connectorType: "embedded",
			walletClientType: "privy",
		},
	} as User;
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

	it("reads the Privy email identity from linked accounts", () => {
		expect(getPrivyEmailAddress(emailUser({ embeddedAddress: "0x2222222222222222222222222222222222222222" }))).toBe(
			"trader@example.com",
		);
	});

	it("reads the Privy embedded wallet address", () => {
		expect(
			getPrivyEmbeddedWalletAddress(emailUser({ embeddedAddress: "0x2222222222222222222222222222222222222222" })),
		).toBe("0x2222222222222222222222222222222222222222");
	});

	it("prefers the embedded wallet for email users even when an injected wallet is connected", () => {
		const wallets = [
			wallet("0x1111111111111111111111111111111111111111", "metamask", "injected"),
			wallet("0x2222222222222222222222222222222222222222", "privy", "embedded"),
		];

		expect(
			selectPrivyWagmiWallet({
				wallets,
				user: emailUser({ embeddedAddress: "0x2222222222222222222222222222222222222222" }),
			}),
		).toBe(wallets[1]);
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
