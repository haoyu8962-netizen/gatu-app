// @vitest-environment jsdom

import type { User } from "@privy-io/react-auth";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEmailEmbeddedWalletSession } from "@/hooks/wallet/use-email-embedded-wallet";
import { recordPrivyLoginMethod } from "@/lib/wallet/privy-login-method";

const EMBEDDED_WALLET_ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const SECOND_EMBEDDED_WALLET_ADDRESS = "0x2222222222222222222222222222222222222222" as const;

const testState = vi.hoisted(() => ({
	createWallet: vi.fn(),
	user: null as User | null,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@privy-io/react-auth", () => ({
	useCreateWallet: () => ({ createWallet: (...args: unknown[]) => testState.createWallet(...args) }),
	usePrivy: () => ({ authenticated: true, ready: true, user: testState.user }),
}));

let hookValue: ReturnType<typeof useEmailEmbeddedWalletSession> | null = null;

function Probe() {
	hookValue = useEmailEmbeddedWalletSession();
	return null;
}

function emailUser({
	email = "trader@example.com",
	id = "did:privy:test-user",
}: {
	email?: string;
	id?: string;
} = {}): User {
	return {
		email: { address: email },
		id,
		linkedAccounts: [{ address: email, type: "email" }],
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

describe("useEmailEmbeddedWalletSession", () => {
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
		window.sessionStorage.clear();
	});

	afterEach(() => {
		vi.useRealTimers();
		act(() => root.unmount());
		container.remove();
		window.localStorage.clear();
		window.sessionStorage.clear();
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

	it("creates an embedded wallet for the same user after an observed email login", async () => {
		testState.user = {
			...emailUser(),
			wallet: {
				address: "0x3333333333333333333333333333333333333333",
				chainType: "ethereum",
				connectorType: "injected",
				walletClientType: "metamask",
			},
		} as User;
		testState.createWallet.mockResolvedValueOnce({ address: EMBEDDED_WALLET_ADDRESS });
		let hook = renderHook();

		expect(hook.walletIntent).toBe("ambiguous");
		expect(hook.shouldUseEmbeddedWallet).toBe(false);
		expect(hook.needsEmbeddedWallet).toBe(false);
		act(() => {
			recordPrivyLoginMethod("did:privy:test-user", "email");
		});
		hook = hookValue ?? hook;

		expect(hook.walletIntent).toBe("embedded");
		expect(hook.shouldUseEmbeddedWallet).toBe(true);
		expect(hook.needsEmbeddedWallet).toBe(true);
		await act(async () => {
			await expect(hook.ensureEmailEmbeddedWallet()).resolves.toBe(EMBEDDED_WALLET_ADDRESS);
		});
		expect(hookValue?.embeddedWalletAddress).toBe(EMBEDDED_WALLET_ADDRESS);
	});

	it("recovers from a synchronous Privy wallet-creation failure", async () => {
		const creationError = new Error("Wallet creation is unavailable");
		testState.createWallet.mockImplementationOnce(() => {
			throw creationError;
		});
		const hook = renderHook();

		await act(async () => {
			await expect(hook.ensureEmailEmbeddedWallet()).rejects.toBe(creationError);
		});

		expect(hookValue?.embeddedWalletError).toBe(creationError);
		expect(hookValue?.isCreatingEmbeddedWallet).toBe(false);
	});

	it("does not expose a locally created address after the Privy user changes", async () => {
		testState.createWallet.mockResolvedValueOnce({ address: EMBEDDED_WALLET_ADDRESS });
		let hook = renderHook();

		await act(async () => {
			await expect(hook.ensureEmailEmbeddedWallet()).resolves.toBe(EMBEDDED_WALLET_ADDRESS);
		});
		expect(hookValue?.embeddedWalletAddress).toBe(EMBEDDED_WALLET_ADDRESS);

		testState.user = emailUser({ email: "second@example.com", id: "did:privy:second-user" });
		hook = renderHook();

		expect(hook.embeddedWalletAddress).toBeUndefined();
		expect(hook.needsEmbeddedWallet).toBe(true);
		expect(hook.embeddedWalletError).toBeNull();
		expect(hook.isCreatingEmbeddedWallet).toBe(false);
	});

	it("rejects a late creation result from the previous user without poisoning the new session", async () => {
		let resolveFirstCreation: ((wallet: { address: string }) => void) | undefined;
		const firstCreation = new Promise<{ address: string }>((resolve) => {
			resolveFirstCreation = resolve;
		});
		testState.createWallet
			.mockReturnValueOnce(firstCreation)
			.mockResolvedValueOnce({ address: SECOND_EMBEDDED_WALLET_ADDRESS });
		const firstHook = renderHook();
		let staleRequest: Promise<`0x${string}`> | undefined;

		await act(async () => {
			staleRequest = firstHook.ensureEmailEmbeddedWallet();
			staleRequest.catch(() => undefined);
		});
		expect(hookValue?.isCreatingEmbeddedWallet).toBe(true);
		expect(testState.createWallet).toHaveBeenCalledOnce();

		testState.user = emailUser({ email: "second@example.com", id: "did:privy:second-user" });
		let secondHook = renderHook();
		expect(secondHook.embeddedWalletAddress).toBeUndefined();
		expect(secondHook.isCreatingEmbeddedWallet).toBe(false);

		await act(async () => {
			resolveFirstCreation?.({ address: EMBEDDED_WALLET_ADDRESS });
			await expect(staleRequest).rejects.toThrow("Email wallet session changed");
		});
		expect(hookValue?.embeddedWalletAddress).toBeUndefined();
		expect(hookValue?.embeddedWalletError).toBeNull();

		secondHook = hookValue ?? secondHook;
		await act(async () => {
			await expect(secondHook.ensureEmailEmbeddedWallet()).resolves.toBe(SECOND_EMBEDDED_WALLET_ADDRESS);
		});
		expect(hookValue?.embeddedWalletAddress).toBe(SECOND_EMBEDDED_WALLET_ADDRESS);
		expect(testState.createWallet).toHaveBeenCalledTimes(2);
	});

	it("invalidates an in-flight creation across logout and login of the same Privy user", async () => {
		let resolveCreation: ((wallet: { address: string }) => void) | undefined;
		testState.createWallet.mockReturnValueOnce(
			new Promise<{ address: string }>((resolve) => {
				resolveCreation = resolve;
			}),
		);
		const firstHook = renderHook();
		let staleRequest: Promise<`0x${string}`> | undefined;
		await act(async () => {
			staleRequest = firstHook.ensureEmailEmbeddedWallet();
			staleRequest.catch(() => undefined);
		});
		expect(testState.createWallet).toHaveBeenCalledOnce();

		testState.user = null;
		renderHook();
		testState.user = emailUser();
		const restoredHook = renderHook();
		expect(restoredHook.embeddedWalletAddress).toBeUndefined();

		await act(async () => {
			resolveCreation?.({ address: EMBEDDED_WALLET_ADDRESS });
			await expect(staleRequest).rejects.toThrow("Email wallet session changed");
		});
		expect(hookValue?.embeddedWalletAddress).toBeUndefined();
		expect(hookValue?.embeddedWalletError).toBeNull();
	});

	it("keeps one SDK request across the timeout so a retry re-attaches instead of creating again", async () => {
		vi.useFakeTimers();
		let resolveCreation: ((wallet: { address: string }) => void) | undefined;
		testState.createWallet.mockReturnValueOnce(
			new Promise<{ address: string }>((resolve) => {
				resolveCreation = resolve;
			}),
		);
		const hook = renderHook();
		let firstAttempt: Promise<unknown> | undefined;

		act(() => {
			firstAttempt = hook.ensureEmailEmbeddedWallet().catch((error: unknown) => error);
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(20_000);
		});

		expect(await firstAttempt).toEqual(new Error("Embedded wallet creation timed out"));
		expect(hookValue?.embeddedWalletError).toEqual(new Error("Embedded wallet creation timed out"));
		expect(hookValue?.isCreatingEmbeddedWallet).toBe(false);

		let retry: Promise<`0x${string}`> | undefined;
		act(() => {
			retry = hookValue?.ensureEmailEmbeddedWallet();
		});
		expect(hookValue?.isCreatingEmbeddedWallet).toBe(true);
		expect(testState.createWallet).toHaveBeenCalledOnce();

		await act(async () => {
			resolveCreation?.({ address: EMBEDDED_WALLET_ADDRESS });
			await expect(retry).resolves.toBe(EMBEDDED_WALLET_ADDRESS);
		});

		expect(hookValue?.embeddedWalletAddress).toBe(EMBEDDED_WALLET_ADDRESS);
		expect(hookValue?.embeddedWalletError).toBeNull();
		expect(testState.createWallet).toHaveBeenCalledOnce();
	});

	it("adopts a wallet that the SDK returns after the waiter timed out", async () => {
		vi.useFakeTimers();
		let resolveCreation: ((wallet: { address: string }) => void) | undefined;
		testState.createWallet.mockReturnValueOnce(
			new Promise<{ address: string }>((resolve) => {
				resolveCreation = resolve;
			}),
		);
		const hook = renderHook();

		act(() => {
			void hook.ensureEmailEmbeddedWallet().catch(() => undefined);
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(20_000);
		});
		expect(hookValue?.embeddedWalletError).not.toBeNull();

		await act(async () => {
			resolveCreation?.({ address: EMBEDDED_WALLET_ADDRESS });
		});

		expect(hookValue?.embeddedWalletAddress).toBe(EMBEDDED_WALLET_ADDRESS);
		expect(hookValue?.needsEmbeddedWallet).toBe(false);
		expect(hookValue?.embeddedWalletError).toBeNull();
	});

	it("starts a new SDK request once the previous one has settled with a failure", async () => {
		testState.createWallet
			.mockRejectedValueOnce(new Error("Wallet creation failed"))
			.mockResolvedValueOnce({ address: EMBEDDED_WALLET_ADDRESS });
		const hook = renderHook();

		await act(async () => {
			await expect(hook.ensureEmailEmbeddedWallet()).rejects.toThrow("Wallet creation failed");
		});
		await act(async () => {
			await expect(hookValue?.ensureEmailEmbeddedWallet()).resolves.toBe(EMBEDDED_WALLET_ADDRESS);
		});

		expect(testState.createWallet).toHaveBeenCalledTimes(2);
	});

	it("never creates a wallet when existing embedded wallets cannot be selected unambiguously", async () => {
		testState.user = {
			...emailUser(),
			linkedAccounts: [
				{ address: "trader@example.com", type: "email" },
				{
					address: EMBEDDED_WALLET_ADDRESS,
					chainType: "ethereum",
					connectorType: "embedded",
					type: "wallet",
					walletClientType: "privy",
					walletIndex: 1,
				},
				{
					address: SECOND_EMBEDDED_WALLET_ADDRESS,
					chainType: "ethereum",
					connectorType: "embedded",
					type: "wallet",
					walletClientType: "privy",
					walletIndex: 2,
				},
			],
		} as User;

		const hook = renderHook();

		expect(hook.shouldUseEmbeddedWallet).toBe(true);
		expect(hook.embeddedWalletAddress).toBeUndefined();
		expect(hook.needsEmbeddedWallet).toBe(false);
		await expect(hook.ensureEmailEmbeddedWallet()).rejects.toThrow("cannot be selected unambiguously");
		expect(testState.createWallet).not.toHaveBeenCalled();
	});

	it("waits for the previous session's SDK request to settle before starting one for a new login", async () => {
		let resolveFirstCreation: ((wallet: { address: string }) => void) | undefined;
		testState.createWallet
			.mockReturnValueOnce(
				new Promise<{ address: string }>((resolve) => {
					resolveFirstCreation = resolve;
				}),
			)
			.mockResolvedValueOnce({ address: SECOND_EMBEDDED_WALLET_ADDRESS });
		const firstHook = renderHook();
		await act(async () => {
			void firstHook.ensureEmailEmbeddedWallet().catch(() => undefined);
		});
		expect(testState.createWallet).toHaveBeenCalledOnce();

		testState.user = null;
		renderHook();
		testState.user = emailUser();
		const secondHook = renderHook();
		let secondCreation: Promise<`0x${string}`> | undefined;
		await act(async () => {
			secondCreation = secondHook.ensureEmailEmbeddedWallet();
		});
		expect(testState.createWallet).toHaveBeenCalledOnce();

		await act(async () => {
			resolveFirstCreation?.({ address: EMBEDDED_WALLET_ADDRESS });
			await expect(secondCreation).resolves.toBe(SECOND_EMBEDDED_WALLET_ADDRESS);
		});

		expect(testState.createWallet).toHaveBeenCalledTimes(2);
		expect(hookValue?.embeddedWalletAddress).toBe(SECOND_EMBEDDED_WALLET_ADDRESS);
	});

	it("drops a queued creation whose login ended before the previous SDK request settled", async () => {
		let resolveFirstCreation: ((wallet: { address: string }) => void) | undefined;
		testState.createWallet.mockReturnValueOnce(
			new Promise<{ address: string }>((resolve) => {
				resolveFirstCreation = resolve;
			}),
		);
		const firstHook = renderHook();
		await act(async () => {
			void firstHook.ensureEmailEmbeddedWallet().catch(() => undefined);
		});
		expect(testState.createWallet).toHaveBeenCalledOnce();

		testState.user = emailUser({ email: "second@example.com", id: "did:privy:second-user" });
		const secondHook = renderHook();
		let queuedCreation: Promise<unknown> | undefined;
		await act(async () => {
			queuedCreation = secondHook.ensureEmailEmbeddedWallet().catch((error: unknown) => error);
		});

		testState.user = null;
		renderHook();
		await act(async () => {
			resolveFirstCreation?.({ address: EMBEDDED_WALLET_ADDRESS });
		});

		expect(await queuedCreation).toEqual(new Error("Email wallet session changed before wallet creation"));
		expect(testState.createWallet).toHaveBeenCalledOnce();
	});
});
