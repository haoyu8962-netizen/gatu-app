// @vitest-environment jsdom

import type { ConnectedWallet, User } from "@privy-io/react-auth";
import { beforeEach, describe, expect, it } from "vitest";
import {
	clearPrivyLoginMethod,
	getPrivyLoginIntent,
	getPrivyLoginMethod,
	recordPrivyLoginMethod,
} from "@/lib/wallet/privy-login-method";
import {
	getPrivyEmailAddress,
	getPrivyEmbeddedWalletAddress,
	hasPrivyEmbeddedWallet,
	hasSameWalletAddress,
	resolvePrivyWalletIntent,
	selectPrivyWagmiWallet,
	shouldUsePrivyEmbeddedWallet,
} from "@/lib/wallet/privy-wagmi";

const PRIVY_USER_ID = "did:privy:test-user";

function wallet(address: string, walletClientType = "metamask", connectorType = "injected"): ConnectedWallet {
	return { address, connectorType, walletClientType } as ConnectedWallet;
}

function user(address: string | undefined, walletClientType = "metamask"): User {
	return { wallet: address ? { address, walletClientType } : undefined } as User;
}

function emailUser({
	email = "trader@example.com",
	embeddedAddress,
	id = PRIVY_USER_ID,
}: {
	email?: string;
	embeddedAddress: string;
	id?: string;
}): User {
	return {
		email: { address: email },
		id,
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
	id = PRIVY_USER_ID,
}: {
	email?: string;
	walletAddress: string;
	embeddedAddress: string;
	id?: string;
}): User {
	return {
		email: { address: email },
		id,
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
		window.sessionStorage.clear();
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

	it("fails closed when a linked-email user's login method is unavailable", () => {
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
		).toBeUndefined();
	});

	it("prefers the exact embedded wallet when the latest login used email", () => {
		recordPrivyLoginMethod(PRIVY_USER_ID, "email");
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
		recordPrivyLoginMethod(PRIVY_USER_ID, "email");
		const emailOnlyUser = {
			email: { address: "trader@example.com" },
			id: PRIVY_USER_ID,
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
		recordPrivyLoginMethod(PRIVY_USER_ID, "email");
		const ambiguousUser = {
			email: { address: "trader@example.com" },
			id: PRIVY_USER_ID,
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
		recordPrivyLoginMethod(PRIVY_USER_ID, "email");
		const primaryAddress = "0x3333333333333333333333333333333333333333";
		const hdUser = {
			email: { address: "trader@example.com" },
			id: PRIVY_USER_ID,
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

	it("ignores Privy's private recent-login-method localStorage entry", () => {
		window.localStorage.setItem("privy:test-app:recent-login-method", "email");
		const externalUser = externalWalletUserWithLinkedEmail({
			walletAddress: "0x1111111111111111111111111111111111111111",
			embeddedAddress: "0x2222222222222222222222222222222222222222",
		});

		expect(getPrivyLoginMethod(PRIVY_USER_ID)).toBeUndefined();
		expect(resolvePrivyWalletIntent(externalUser)).toBe("ambiguous");
		expect(shouldUsePrivyEmbeddedWallet(externalUser)).toBe(false);
		expect(
			selectPrivyWagmiWallet({
				wallets: [wallet("0x1111111111111111111111111111111111111111")],
				user: externalUser,
			}),
		).toBeUndefined();
	});

	it("does not reuse another Privy user's recorded login method", () => {
		recordPrivyLoginMethod("did:privy:other-user", "email");
		const externalUser = externalWalletUserWithLinkedEmail({
			walletAddress: "0x1111111111111111111111111111111111111111",
			embeddedAddress: "0x2222222222222222222222222222222222222222",
		});

		expect(getPrivyLoginMethod(PRIVY_USER_ID)).toBeUndefined();
		expect(resolvePrivyWalletIntent(externalUser)).toBe("ambiguous");
		expect(shouldUsePrivyEmbeddedWallet(externalUser)).toBe(false);
	});

	it("rejects an explicitly supplied login intent that belongs to another Privy user", () => {
		const externalUser = externalWalletUserWithLinkedEmail({
			walletAddress: "0x1111111111111111111111111111111111111111",
			embeddedAddress: "0x2222222222222222222222222222222222222222",
		});

		expect(
			resolvePrivyWalletIntent(externalUser, {
				method: "email",
				userId: "did:privy:other-user",
			}),
		).toBe("ambiguous");
	});

	it("records an Ethereum wallet login as wallet intent", () => {
		const externalAddress = "0x1111111111111111111111111111111111111111";
		recordPrivyLoginMethod(PRIVY_USER_ID, "siwe", externalAddress);
		const externalUser = externalWalletUserWithLinkedEmail({
			walletAddress: externalAddress,
			embeddedAddress: "0x2222222222222222222222222222222222222222",
		});

		expect(getPrivyLoginMethod(PRIVY_USER_ID)).toBe("wallet");
		expect(getPrivyLoginIntent(PRIVY_USER_ID)?.walletAddress).toBe(externalAddress);
		expect(resolvePrivyWalletIntent(externalUser)).toBe("external");
		expect(shouldUsePrivyEmbeddedWallet(externalUser)).toBe(false);
		const exactWallet = wallet(externalAddress);
		expect(
			selectPrivyWagmiWallet({
				wallets: [wallet("0x4444444444444444444444444444444444444444"), exactWallet],
				user: externalUser,
			}),
		).toBe(exactWallet);
	});

	it("keeps login intents isolated across Privy users in the current tab session", () => {
		const otherUserId = "did:privy:other-user";
		recordPrivyLoginMethod(PRIVY_USER_ID, "email");
		recordPrivyLoginMethod(otherUserId, "siwe", "0x1111111111111111111111111111111111111111");

		expect(getPrivyLoginMethod(PRIVY_USER_ID)).toBe("email");
		expect(getPrivyLoginMethod(otherUserId)).toBe("wallet");

		clearPrivyLoginMethod(otherUserId);
		expect(getPrivyLoginMethod(PRIVY_USER_ID)).toBe("email");
	});

	it("clears only the matching user's login intent on logout", () => {
		recordPrivyLoginMethod(PRIVY_USER_ID, "email");
		clearPrivyLoginMethod("did:privy:other-user");
		expect(getPrivyLoginMethod(PRIVY_USER_ID)).toBe("email");

		clearPrivyLoginMethod(PRIVY_USER_ID);
		expect(getPrivyLoginMethod(PRIVY_USER_ID)).toBeUndefined();
	});

	it("reports any embedded Ethereum wallet, including ones that cannot be selected unambiguously", () => {
		const embeddedAccount = (address: string, walletIndex: number) => ({
			address,
			chainType: "ethereum",
			connectorType: "embedded",
			type: "wallet",
			walletClientType: "privy",
			walletIndex,
		});
		const ambiguousUser = {
			linkedAccounts: [
				embeddedAccount("0x1111111111111111111111111111111111111111", 1),
				embeddedAccount("0x2222222222222222222222222222222222222222", 2),
			],
		} as unknown as User;

		expect(getPrivyEmbeddedWalletAddress(ambiguousUser)).toBeUndefined();
		expect(hasPrivyEmbeddedWallet(ambiguousUser)).toBe(true);
		expect(hasPrivyEmbeddedWallet(user("0x1111111111111111111111111111111111111111", "privy"))).toBe(true);
	});

	it("reports no embedded wallet for email-only, external-wallet and Solana-only users", () => {
		expect(hasPrivyEmbeddedWallet(null)).toBe(false);
		expect(hasPrivyEmbeddedWallet({ linkedAccounts: [{ address: "a@example.com", type: "email" }] } as User)).toBe(
			false,
		);
		expect(hasPrivyEmbeddedWallet(user("0x1111111111111111111111111111111111111111"))).toBe(false);
		expect(
			hasPrivyEmbeddedWallet({
				linkedAccounts: [
					{
						address: "So11111111111111111111111111111111111111112",
						chainType: "solana",
						type: "wallet",
						walletClientType: "privy",
					},
				],
			} as unknown as User),
		).toBe(false);
	});
});
