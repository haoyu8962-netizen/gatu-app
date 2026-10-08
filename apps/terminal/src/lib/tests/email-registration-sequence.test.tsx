// @vitest-environment jsdom

import type { User } from "@privy-io/react-auth";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLegalGate } from "@/hooks/trade/use-legal-gate";
import { useDisconnectWallet, useReconnectWallet } from "@/hooks/wallet/use-wallet-session";
import { recordPrivyLoginMethod } from "@/lib/wallet/privy-login-method";
import { EmailEmbeddedWalletProvider } from "@/providers/email-embedded-wallet-provider";

const USER_ID = "did:privy:new-email-user";
const EMBEDDED_WALLET = "0x1111111111111111111111111111111111111111";

interface SessionState {
	authenticated: boolean;
	isModalOpen: boolean;
	user: User | null;
	wallets: Array<{ address: string; connectorType: string; walletClientType: string }>;
	activeAddress: string | undefined;
	acceptedTerms: boolean;
}

const session = vi.hoisted(() => {
	const listeners = new Set<() => void>();
	const state = {
		authenticated: false,
		isModalOpen: false,
		user: null,
		wallets: [],
		activeAddress: undefined,
		acceptedTerms: false,
	} as SessionState;
	let version = 0;
	return {
		state,
		createWallet: vi.fn(),
		logout: vi.fn(),
		closeRegistration: vi.fn(),
		toastError: vi.fn(),
		getVersion: () => version,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		set: (patch: Partial<SessionState>) => {
			Object.assign(state, patch);
			version += 1;
			for (const listener of listeners) listener();
		},
	};
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@privy-io/react-auth", async () => {
	const { useSyncExternalStore } = await import("react");
	function useSessionVersion() {
		return useSyncExternalStore(session.subscribe, session.getVersion);
	}
	return {
		usePrivy: () => {
			useSessionVersion();
			return {
				ready: true,
				authenticated: session.state.authenticated,
				isModalOpen: session.state.isModalOpen,
				user: session.state.user,
				login: vi.fn(),
				logout: session.logout,
			};
		},
		useCreateWallet: () => ({ createWallet: (...args: unknown[]) => session.createWallet(...args) }),
		useConnectWallet: () => ({ connectWallet: vi.fn() }),
		useWallets: () => {
			useSessionVersion();
			return { ready: true, wallets: session.state.wallets };
		},
	};
});

vi.mock("@privy-io/wagmi", () => ({
	useSetActiveWallet: () => ({ setActiveWallet: vi.fn() }),
}));

vi.mock("wagmi", async () => {
	const { useSyncExternalStore } = await import("react");
	return {
		useConnection: () => {
			useSyncExternalStore(session.subscribe, session.getVersion);
			return {
				address: session.state.activeAddress,
				isConnected: !!session.state.activeAddress,
				isConnecting: false,
				isReconnecting: false,
			};
		},
	};
});

vi.mock("@/lib/hyperliquid", async () => {
	const { useSyncExternalStore } = await import("react");
	function useActiveAddress() {
		useSyncExternalStore(session.subscribe, session.getVersion);
		return session.state.activeAddress;
	}
	function useSessionContext() {
		const address = useActiveAddress();
		return {
			clientKey: address ?? "disconnected",
			env: "Mainnet",
			sessionMode: address ? "wallet" : "disconnected",
		};
	}
	return {
		classifyLegalStatusError: () => "unknown",
		closeAgentRegistrationSessionAndRemove: session.closeRegistration,
		getActiveAgentOwner: () => null,
		useHyperliquid: useSessionContext,
		useHyperliquidOptional: useSessionContext,
		useLegalStatus: () => {
			const address = useActiveAddress();
			return {
				data: address
					? { acceptedTerms: session.state.acceptedTerms, userAllowed: true, canPerformActions: true }
					: undefined,
				error: null,
				isError: false,
				isPending: !address,
				refetch: vi.fn(),
			};
		},
	};
});

vi.mock("@/hooks/wallet/use-explicit-terms-acceptance", () => ({
	useExplicitTermsAcceptance: () => ({ error: null, isPending: false, mutateAsync: vi.fn(), reset: vi.fn() }),
}));

vi.mock("@/lib/error-reporting/client", () => ({ reportClientError: vi.fn() }));

vi.mock("sonner", () => ({ toast: { error: session.toastError } }));

function emailUser(withWallet: boolean): User {
	return {
		email: { address: "new@example.com" },
		id: USER_ID,
		linkedAccounts: [
			{ address: "new@example.com", type: "email" },
			...(withWallet
				? [
						{
							address: EMBEDDED_WALLET,
							chainType: "ethereum",
							connectorType: "embedded",
							type: "wallet",
							walletClientType: "privy",
							walletIndex: 0,
						},
					]
				: []),
		],
	} as User;
}

const observedStates: string[] = [];
let latestGate: ReturnType<typeof useLegalGate> | null = null;
let latestDisconnect: ReturnType<typeof useDisconnectWallet> | null = null;
let latestReconnect: ReturnType<typeof useReconnectWallet> | null = null;

function Probe() {
	latestGate = useLegalGate();
	latestDisconnect = useDisconnectWallet();
	latestReconnect = useReconnectWallet();
	if (observedStates.at(-1) !== latestGate.state) observedStates.push(latestGate.state);
	return null;
}

describe("email registration sequence", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		observedStates.length = 0;
		latestGate = null;
		latestDisconnect = null;
		latestReconnect = null;
		window.sessionStorage.clear();
		session.createWallet.mockReset();
		session.logout.mockReset();
		session.logout.mockResolvedValue(undefined);
		session.closeRegistration.mockReset();
		session.toastError.mockReset();
		session.set({
			authenticated: false,
			isModalOpen: false,
			user: null,
			wallets: [],
			activeAddress: undefined,
			acceptedTerms: false,
		});
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		window.sessionStorage.clear();
	});

	function renderApp() {
		act(() => {
			root.render(createElement(EmailEmbeddedWalletProvider, null, createElement(Probe)));
		});
	}

	async function update(patch: Partial<SessionState>) {
		await act(async () => {
			session.set(patch);
		});
	}

	it("creates the wallet behind Privy's window and opens the policy dialog only once the owner is active", async () => {
		let resolveCreation: ((wallet: { address: string }) => void) | undefined;
		session.createWallet.mockReturnValueOnce(
			new Promise<{ address: string }>((resolve) => {
				resolveCreation = resolve;
			}),
		);
		renderApp();
		expect(latestGate?.state).toBe("inactive");

		await update({ authenticated: true, isModalOpen: true, user: emailUser(false) });
		expect(session.createWallet).toHaveBeenCalledOnce();
		expect(latestGate?.state).toBe("checking");

		await act(async () => {
			resolveCreation?.({ address: EMBEDDED_WALLET });
		});
		await update({ user: emailUser(true) });
		expect(latestGate?.state).toBe("checking");

		await act(async () => {
			recordPrivyLoginMethod(USER_ID, "email");
		});
		await update({ isModalOpen: false });
		expect(latestGate?.state).toBe("checking");

		await update({
			wallets: [{ address: EMBEDDED_WALLET, connectorType: "embedded", walletClientType: "privy" }],
			activeAddress: EMBEDDED_WALLET,
		});

		expect(latestGate?.state).toBe("required");
		expect(latestGate?.identity).toBe(EMBEDDED_WALLET);
		expect(observedStates).toEqual(["inactive", "checking", "required"]);
		expect(session.createWallet).toHaveBeenCalledOnce();
	});

	it("never asks to reconnect while the created wallet is waiting for Privy's user and wagmi to catch up", async () => {
		session.createWallet.mockResolvedValueOnce({ address: EMBEDDED_WALLET });
		renderApp();

		await update({ authenticated: true, user: emailUser(false) });
		expect(session.createWallet).toHaveBeenCalledOnce();
		expect(latestGate?.state).toBe("checking");

		await update({ user: emailUser(true) });
		expect(latestGate?.state).toBe("checking");

		await update({
			wallets: [{ address: EMBEDDED_WALLET, connectorType: "embedded", walletClientType: "privy" }],
			activeAddress: EMBEDDED_WALLET,
		});
		expect(latestGate?.state).toBe("required");
		expect(observedStates).toEqual(["inactive", "checking", "required"]);
	});

	it("keeps the policy dialog back while Privy's window is still open over an active owner", async () => {
		session.createWallet.mockResolvedValueOnce({ address: EMBEDDED_WALLET });
		renderApp();

		await update({ authenticated: true, isModalOpen: true, user: emailUser(false) });
		await update({
			user: emailUser(true),
			wallets: [{ address: EMBEDDED_WALLET, connectorType: "embedded", walletClientType: "privy" }],
			activeAddress: EMBEDDED_WALLET,
		});
		expect(latestGate?.state).toBe("checking");

		await update({ isModalOpen: false });
		expect(latestGate?.state).toBe("required");
		expect(observedStates).toEqual(["inactive", "checking", "required"]);
	});

	it("lets a registration whose wallet creation failed retry through Reconnect or leave through Disconnect", async () => {
		session.createWallet
			.mockRejectedValueOnce(new Error("network down"))
			.mockRejectedValueOnce(new Error("network down"));
		renderApp();

		await update({ authenticated: true, user: emailUser(false) });
		expect(latestGate?.state).toBe("wallet_setup_failed");
		expect(session.createWallet).toHaveBeenCalledOnce();

		await act(async () => {
			await latestReconnect?.reconnectWallet();
		});
		expect(session.createWallet).toHaveBeenCalledTimes(2);
		expect(latestGate?.state).toBe("wallet_setup_failed");
		expect(session.toastError).toHaveBeenCalledWith(
			"Your email wallet is unavailable. Disconnect, then log in again with the same email.",
		);

		await act(async () => {
			await latestDisconnect?.disconnectWallet();
		});
		expect(session.closeRegistration).not.toHaveBeenCalled();
		expect(session.logout).toHaveBeenCalledOnce();
	});
});
