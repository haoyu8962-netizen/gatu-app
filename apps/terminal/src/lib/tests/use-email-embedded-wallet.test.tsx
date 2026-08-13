// @vitest-environment jsdom

import type { User } from "@privy-io/react-auth";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEmailEmbeddedWallet } from "@/hooks/wallet/use-email-embedded-wallet";

const EMBEDDED_WALLET_ADDRESS = "0x1111111111111111111111111111111111111111" as const;

const testState = vi.hoisted(() => ({
	createWallet: vi.fn(),
	user: null as User | null,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@privy-io/react-auth", () => ({
	useCreateWallet: () => ({ createWallet: testState.createWallet }),
	usePrivy: () => ({ authenticated: true, ready: true, user: testState.user }),
}));

let hookValue: ReturnType<typeof useEmailEmbeddedWallet> | null = null;

function Probe() {
	hookValue = useEmailEmbeddedWallet();
	return null;
}

function emailUser(): User {
	return {
		email: { address: "trader@example.com" },
		id: "did:privy:test-user",
		linkedAccounts: [{ address: "trader@example.com", type: "email" }],
	} as User;
}

function hydratedEmailUser(): User {
	return {
		...emailUser(),
		linkedAccounts: [
			{ address: "trader@example.com", type: "email" },
			{
				address: EMBEDDED_WALLET_ADDRESS,
				chainType: "ethereum",
				connectorType: "embedded",
				type: "wallet",
				walletClientType: "privy",
			},
		],
	} as User;
}

describe("useEmailEmbeddedWallet", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		hookValue = null;
		testState.user = emailUser();
		testState.createWallet.mockReset();
		window.localStorage.clear();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		window.localStorage.clear();
		vi.clearAllMocks();
	});

	function renderHook() {
		act(() => {
			root.render(createElement(Probe));
		});
		if (!hookValue) throw new Error("Missing email embedded wallet hook value");
		return hookValue;
	}

	it("clears a creation error when the same user's metadata later exposes the exact wallet", async () => {
		const creationError = new Error("Wallet creation failed");
		testState.createWallet.mockRejectedValueOnce(creationError);
		let hook = renderHook();

		await act(async () => {
			await expect(hook.ensureEmailEmbeddedWallet()).rejects.toBe(creationError);
		});

		expect(hookValue?.embeddedWalletError).toBe(creationError);
		expect(hookValue?.isCreatingEmbeddedWallet).toBe(false);

		testState.user = hydratedEmailUser();
		hook = renderHook();

		expect(hook.embeddedWalletAddress).toBe(EMBEDDED_WALLET_ADDRESS);
		expect(hook.needsEmbeddedWallet).toBe(false);
		expect(hook.embeddedWalletError).toBeNull();
		expect(hook.isCreatingEmbeddedWallet).toBe(false);
		expect(testState.createWallet).toHaveBeenCalledOnce();
	});
});
