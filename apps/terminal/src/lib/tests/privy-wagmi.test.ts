// @vitest-environment jsdom

import type { ConnectedWallet, User } from "@privy-io/react-auth";
import { beforeEach, describe, expect, it } from "vitest";
import {
	getPrivyEmailAddress,
	getPrivyEmbeddedWalletAddress,
	hasSameWalletAddress,
	selectPrivyWagmiWallet,
	shouldUsePrivyEmbeddedWallet,
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

function externalWalletUserWithLinkedEmail({
	email = "trader@example.com",
	walletAddress,
	embeddedAddress,
}: {
	email?: string;
	walletAddress: string;
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
			{
				address: walletAddress,
				chainType: "ethereum",
				connectorType: "injected",
				type: "wallet",
				walletClientType: "metamask",
			},
		],
		wallet: {
			address: walletAddress,
			chainType: "ethereum",
			connectorType: "injected",
			walletClientType: "metamask",
		},
	} as User;
}

describe("selectPrivyWagmiWallet", () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

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

	it("does not treat a linked smart wallet as the Privy embedded EOA", () => {
		const smartWalletUser = {
			email: { address: "trader@example.com" },
			linkedAccounts: [
				{
					address: "0x2222222222222222222222222222222222222222",
					chainType: "ethereum",
					type: "smart_wallet",
					walletClientType: "privy",
				},
			],
		} as unknown as User;

		expect(getPrivyEmbeddedWalletAddress(smartWalletUser)).toBeUndefined();
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

	it("does not prefer embedded wallets for external wallet users with a linked email", () => {
		const wallets = [
			wallet("0x1111111111111111111111111111111111111111", "metamask", "injected"),
			wallet("0x2222222222222222222222222222222222222222", "privy", "embedded"),
		];

		expect(
			selectPrivyWagmiWallet({
				wallets,
				user: externalWalletUserWithLinkedEmail({
					walletAddress: "0x1111111111111111111111111111111111111111",
					embeddedAddress: "0x2222222222222222222222222222222222222222",
				}),
			}),
		).toBe(wallets[0]);
	});

	it("prefers the exact embedded wallet when the latest login used email", () => {
		window.localStorage.setItem("privy:test-app:recent-login-method", "email");
		const wallets = [
			wallet("0x1111111111111111111111111111111111111111", "metamask", "injected"),
			wallet("0x2222222222222222222222222222222222222222", "privy", "embedded"),
		];

		expect(
			selectPrivyWagmiWallet({
				wallets,
				user: externalWalletUserWithLinkedEmail({
					walletAddress: "0x1111111111111111111111111111111111111111",
					embeddedAddress: "0x2222222222222222222222222222222222222222",
				}),
			}),
		).toBe(wallets[1]);
	});

	it("keeps email wallet intent fail-closed while the embedded wallet is unavailable", () => {
		window.localStorage.setItem("privy:test-app:recent-login-method", "email");
		const emailOnlyUser = {
			email: { address: "trader@example.com" },
			linkedAccounts: [{ address: "trader@example.com", type: "email" }],
			wallet: {
				address: "0x1111111111111111111111111111111111111111",
				chainType: "ethereum",
				connectorType: "injected",
				walletClientType: "metamask",
			},
		} as User;
		const externalWallet = wallet("0x1111111111111111111111111111111111111111");

		expect(shouldUsePrivyEmbeddedWallet(emailOnlyUser)).toBe(true);
		expect(getPrivyEmbeddedWalletAddress(emailOnlyUser)).toBeUndefined();
		expect(selectPrivyWagmiWallet({ wallets: [externalWallet], user: emailOnlyUser })).toBeUndefined();
	});

	it("does not select the first embedded wallet when multiple HD wallets are ambiguous", () => {
		window.localStorage.setItem("privy:test-app:recent-login-method", "email");
		const ambiguousUser = {
			email: { address: "trader@example.com" },
			linkedAccounts: [
				{ address: "trader@example.com", type: "email" },
				{
					address: "0x2222222222222222222222222222222222222222",
					chainType: "ethereum",
					type: "wallet",
					walletClientType: "privy",
					walletIndex: 1,
				},
				{
					address: "0x3333333333333333333333333333333333333333",
					chainType: "ethereum",
					type: "wallet",
					walletClientType: "privy",
					walletIndex: 2,
				},
			],
			wallet: {
				address: "0x1111111111111111111111111111111111111111",
				chainType: "ethereum",
				connectorType: "injected",
				walletClientType: "metamask",
			},
		} as User;

		expect(getPrivyEmbeddedWalletAddress(ambiguousUser)).toBeUndefined();
		expect(
			selectPrivyWagmiWallet({
				wallets: [
					wallet("0x2222222222222222222222222222222222222222", "privy", "embedded"),
					wallet("0x3333333333333333333333333333333333333333", "privy", "embedded"),
				],
				user: ambiguousUser,
			}),
		).toBeUndefined();
	});

	it("selects the explicit primary HD embedded wallet by walletIndex", () => {
		window.localStorage.setItem("privy:test-app:recent-login-method", "email");
		const primaryAddress = "0x3333333333333333333333333333333333333333";
		const hdUser = {
			email: { address: "trader@example.com" },
			linkedAccounts: [
				{ address: "trader@example.com", type: "email" },
				{
					address: "0x2222222222222222222222222222222222222222",
					chainType: "ethereum",
					type: "wallet",
					walletClientType: "privy",
					walletIndex: 1,
				},
				{
					address: primaryAddress,
					chainType: "ethereum",
					type: "wallet",
					walletClientType: "privy",
					walletIndex: 0,
				},
			],
			wallet: {
				address: "0x1111111111111111111111111111111111111111",
				chainType: "ethereum",
				connectorType: "injected",
				walletClientType: "metamask",
			},
		} as User;
		const primaryWallet = wallet(primaryAddress, "privy", "embedded");

		expect(getPrivyEmbeddedWalletAddress(hdUser)).toBe(primaryAddress);
		expect(
			selectPrivyWagmiWallet({
				wallets: [wallet("0x2222222222222222222222222222222222222222", "privy", "embedded"), primaryWallet],
				user: hdUser,
			}),
		).toBe(primaryWallet);
	});

	it("does not substitute another embedded wallet for the expected address", () => {
		const wallets = [wallet("0x3333333333333333333333333333333333333333", "privy", "embedded")];

		expect(
			selectPrivyWagmiWallet({
				wallets,
				user: emailUser({ embeddedAddress: "0x2222222222222222222222222222222222222222" }),
			}),
		).toBeUndefined();
	});

	it("does not fall back to another wallet when the user wallet is not connected", () => {
		const wallets = [
			wallet("0x1111111111111111111111111111111111111111"),
			wallet("0x2222222222222222222222222222222222222222"),
		];

		expect(
			selectPrivyWagmiWallet({
				wallets,
				user: user("0x3333333333333333333333333333333333333333"),
			}),
		).toBeUndefined();
	});
});
