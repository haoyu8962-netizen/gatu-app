// @vitest-environment jsdom

import type { User } from "@privy-io/react-auth";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type EmailEmbeddedWallet, useEmailEmbeddedWallet } from "@/hooks/wallet/use-email-embedded-wallet";
import { EmailEmbeddedWalletProvider } from "@/providers/email-embedded-wallet-provider";

const CREATED_WALLET_ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const EXISTING_WALLET_ADDRESS = "0x2222222222222222222222222222222222222222" as const;
const EXTERNAL_WALLET_ADDRESS = "0x3333333333333333333333333333333333333333" as const;

const testState = vi.hoisted(() => ({
	createWallet: vi.fn(),
	user: null as User | null,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@privy-io/react-auth", () => ({
	useCreateWallet: () => ({ createWallet: testState.createWallet }),
	usePrivy: () => ({ authenticated: true, ready: true, user: testState.user }),
}));

const consumers = new Map<string, EmailEmbeddedWallet>();

function Consumer({ name }: { name: string }) {
	consumers.set(name, useEmailEmbeddedWallet());
	return null;
}

function emailUser(): User {
	return {
		email: { address: "trader@example.com" },
		id: "did:privy:test-user",
		linkedAccounts: [{ address: "trader@example.com", type: "email" }],
	} as User;
}

function emailUserWithWallet(): User {
	return {
		...emailUser(),
		linkedAccounts: [
			{ address: "trader@example.com", type: "email" },
			{
				address: EXISTING_WALLET_ADDRESS,
				chainType: "ethereum",
				connectorType: "embedded",
				type: "wallet",
				walletClientType: "privy",
			},
		],
	} as User;
}

function externalWalletUser(): User {
	return {
		id: "did:privy:external-user",
		linkedAccounts: [
			{
				address: EXTERNAL_WALLET_ADDRESS,
				chainType: "ethereum",
				connectorType: "injected",
				type: "wallet",
				walletClientType: "metamask",
			},
		],
		wallet: {
			address: EXTERNAL_WALLET_ADDRESS,
			chainType: "ethereum",
			connectorType: "injected",
			walletClientType: "metamask",
		},
	} as User;
}

function consumer(name: string): EmailEmbeddedWallet {
	const value = consumers.get(name);
	if (!value) throw new Error(`Missing consumer ${name}`);
	return value;
}

describe("EmailEmbeddedWalletProvider", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		consumers.clear();
		testState.user = emailUser();
		testState.createWallet.mockReset();
		window.sessionStorage.clear();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		window.sessionStorage.clear();
	});

	function renderProvider() {
		act(() => {
			root.render(
				createElement(
					EmailEmbeddedWalletProvider,
					null,
					createElement(Consumer, { name: "legal" }),
					createElement(Consumer, { name: "deposit" }),
				),
			);
		});
	}

	it("creates the email owner wallet once without wallet UI and shares it with every consumer", async () => {
		let resolveCreation: ((wallet: { address: string }) => void) | undefined;
		testState.createWallet.mockReturnValueOnce(
			new Promise<{ address: string }>((resolve) => {
				resolveCreation = resolve;
			}),
		);

		renderProvider();
		await act(async () => {});

		expect(testState.createWallet).toHaveBeenCalledOnce();
		expect(testState.createWallet).toHaveBeenCalledWith();
		expect(consumer("legal").isCreatingEmbeddedWallet).toBe(true);
		expect(consumer("deposit").isCreatingEmbeddedWallet).toBe(true);

		let depositRequest: Promise<`0x${string}`> | undefined;
		act(() => {
			depositRequest = consumer("deposit").ensureEmailEmbeddedWallet();
		});
		expect(testState.createWallet).toHaveBeenCalledOnce();

		await act(async () => {
			resolveCreation?.({ address: CREATED_WALLET_ADDRESS });
			await expect(depositRequest).resolves.toBe(CREATED_WALLET_ADDRESS);
		});

		for (const name of ["legal", "deposit"]) {
			expect(consumer(name).embeddedWalletAddress).toBe(CREATED_WALLET_ADDRESS);
			expect(consumer(name).needsEmbeddedWallet).toBe(false);
			expect(consumer(name).isCreatingEmbeddedWallet).toBe(false);
		}
		expect(testState.createWallet).toHaveBeenCalledOnce();
	});

	it("does not retry a failed creation by itself and creates again only on an explicit retry", async () => {
		const creationError = new Error("Embedded wallet creation timed out");
		testState.createWallet.mockRejectedValueOnce(creationError).mockResolvedValueOnce({
			address: CREATED_WALLET_ADDRESS,
		});

		renderProvider();
		await act(async () => {});

		expect(consumer("legal").embeddedWalletError).toBe(creationError);
		expect(consumer("legal").isCreatingEmbeddedWallet).toBe(false);

		renderProvider();
		await act(async () => {});
		expect(testState.createWallet).toHaveBeenCalledOnce();

		await act(async () => {
			await expect(consumer("legal").ensureEmailEmbeddedWallet()).resolves.toBe(CREATED_WALLET_ADDRESS);
		});

		expect(testState.createWallet).toHaveBeenCalledTimes(2);
		expect(consumer("deposit").embeddedWalletAddress).toBe(CREATED_WALLET_ADDRESS);
		expect(consumer("deposit").embeddedWalletError).toBeNull();
	});

	it("never creates a wallet for an external-wallet session or an email user who already has one", async () => {
		testState.user = externalWalletUser();
		renderProvider();
		await act(async () => {});
		expect(consumer("legal").needsEmbeddedWallet).toBe(false);

		testState.user = emailUserWithWallet();
		renderProvider();
		await act(async () => {});
		expect(consumer("legal").embeddedWalletAddress).toBe(EXISTING_WALLET_ADDRESS);

		expect(testState.createWallet).not.toHaveBeenCalled();
	});
});
