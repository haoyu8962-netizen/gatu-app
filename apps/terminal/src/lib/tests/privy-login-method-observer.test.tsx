// @vitest-environment jsdom

import type { User } from "@privy-io/react-auth";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearEmailOnboardingIntent, useEmailOnboardingIntent } from "@/lib/wallet/email-onboarding-intent";
import {
	getPrivyLoginIntent,
	getPrivyLoginIntentStorageKey,
	getPrivyLoginMethod,
	recordPrivyLoginMethod,
	usePrivyLoginIntent,
} from "@/lib/wallet/privy-login-method";
import { PrivyLoginMethodObserver } from "@/providers/privy-login-method-observer";

interface LoginCompleteParams {
	isNewUser: boolean;
	loginAccount: { address?: string; type: string } | null;
	loginMethod: string | null;
	user: User;
	wasAlreadyAuthenticated: boolean;
}

const testState = vi.hoisted(() => ({
	network: "mainnet" as "mainnet" | "testnet",
	onComplete: undefined as ((params: LoginCompleteParams) => void) | undefined,
	privy: { ready: true, authenticated: false, user: null as User | null },
}));

const PRIVY_USER_ID = "did:privy:test-user";
const OWNER = "0x1111111111111111111111111111111111111111";

vi.mock("@/lib/network", () => ({ getNetwork: () => testState.network }));

vi.mock("@privy-io/react-auth", () => ({
	usePrivy: () => testState.privy,
	useLogin: (callbacks: { onComplete?: (params: LoginCompleteParams) => void }) => {
		testState.onComplete = callbacks.onComplete;
		return { login: vi.fn() };
	},
}));

function LoginIntentProbe() {
	const intent = usePrivyLoginIntent(PRIVY_USER_ID);
	return createElement("output", null, intent?.method ?? "missing");
}

function DepositIntentProbe() {
	const intent = useEmailOnboardingIntent();
	return createElement("output", { "data-testid": "deposit-intent" }, JSON.stringify(intent));
}

function TestHarness() {
	return createElement(
		"div",
		null,
		createElement(PrivyLoginMethodObserver),
		createElement(LoginIntentProbe),
		createElement(DepositIntentProbe),
	);
}

describe("PrivyLoginMethodObserver", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		window.localStorage.clear();
		window.sessionStorage.clear();
		clearEmailOnboardingIntent();
		testState.onComplete = undefined;
		testState.network = "mainnet";
		testState.privy = { ready: true, authenticated: false, user: null };
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	it.each([true, false])("records one deposit intent for a fresh email login (new user: %s)", (isNewUser) => {
		act(() => root.render(createElement(TestHarness)));
		act(() => {
			testState.onComplete?.({
				isNewUser,
				loginAccount: null,
				loginMethod: "email",
				user: { id: PRIVY_USER_ID, email: {} } as User,
				wasAlreadyAuthenticated: false,
			});
		});
		expect(container.querySelector('[data-testid="deposit-intent"]')?.textContent).toBe(
			JSON.stringify({ userId: PRIVY_USER_ID, env: "Mainnet" }),
		);
	});

	it("binds delayed wallet creation to the same authenticated user and clears on logout", () => {
		act(() => root.render(createElement(TestHarness)));
		act(() => {
			testState.onComplete?.({
				isNewUser: true,
				loginAccount: null,
				loginMethod: "email",
				user: { id: PRIVY_USER_ID } as User,
				wasAlreadyAuthenticated: false,
			});
		});
		testState.privy = {
			ready: true,
			authenticated: true,
			user: {
				id: PRIVY_USER_ID,
				wallet: { address: OWNER, walletClientType: "privy" },
			} as User,
		};
		act(() => root.render(createElement(TestHarness)));
		expect(container.querySelector('[data-testid="deposit-intent"]')?.textContent).toContain(OWNER);
		testState.privy = { ready: true, authenticated: false, user: null };
		act(() => root.render(createElement(TestHarness)));
		expect(container.querySelector('[data-testid="deposit-intent"]')?.textContent).toBe("null");
	});

	it("does not create a deposit intent for a restored authenticated email session", () => {
		act(() => root.render(createElement(TestHarness)));
		act(() => {
			testState.onComplete?.({
				isNewUser: false,
				loginAccount: null,
				loginMethod: "email",
				user: { id: PRIVY_USER_ID } as User,
				wasAlreadyAuthenticated: true,
			});
		});
		expect(container.querySelector('[data-testid="deposit-intent"]')?.textContent).toBe("null");
	});

	it("discards a pending signup intent when another account becomes authenticated", () => {
		act(() => root.render(createElement(TestHarness)));
		act(() => {
			testState.onComplete?.({
				isNewUser: true,
				loginAccount: null,
				loginMethod: "email",
				user: { id: PRIVY_USER_ID } as User,
				wasAlreadyAuthenticated: false,
			});
		});
		testState.privy = {
			ready: true,
			authenticated: true,
			user: { id: "did:privy:other-user" } as User,
		};
		act(() => root.render(createElement(TestHarness)));
		expect(container.querySelector('[data-testid="deposit-intent"]')?.textContent).toBe("null");
	});

	it("discards an unconsumed signup intent when a network change restarts the runtime before legal completion", () => {
		act(() => root.render(createElement(TestHarness)));
		act(() => {
			testState.onComplete?.({
				isNewUser: true,
				loginAccount: null,
				loginMethod: "email",
				user: { id: PRIVY_USER_ID } as User,
				wasAlreadyAuthenticated: false,
			});
		});
		testState.network = "testnet";
		act(() => root.unmount());
		root = createRoot(container);
		act(() => root.render(createElement(TestHarness)));
		expect(container.querySelector('[data-testid="deposit-intent"]')?.textContent).toBe("null");
		testState.network = "mainnet";
		act(() => root.render(createElement(TestHarness)));
		expect(container.querySelector('[data-testid="deposit-intent"]')?.textContent).toBe("null");
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		window.localStorage.clear();
		window.sessionStorage.clear();
		vi.clearAllMocks();
	});

	it("records the official login callback for the exact Privy user", () => {
		act(() => {
			root.render(createElement(TestHarness));
		});

		act(() => {
			testState.onComplete?.({
				isNewUser: false,
				loginAccount: null,
				loginMethod: "email",
				user: { id: PRIVY_USER_ID } as User,
				wasAlreadyAuthenticated: false,
			});
		});

		expect(getPrivyLoginMethod(PRIVY_USER_ID)).toBe("email");
		expect(getPrivyLoginMethod("did:privy:other-user")).toBeUndefined();
		expect(container.querySelector("output")?.textContent).toBe("email");
	});

	it("preserves a valid persisted intent when Privy restores a session without a login method", () => {
		recordPrivyLoginMethod(PRIVY_USER_ID, "email");
		act(() => {
			root.render(createElement(TestHarness));
		});

		act(() => {
			testState.onComplete?.({
				isNewUser: false,
				loginAccount: null,
				loginMethod: null,
				user: { id: PRIVY_USER_ID } as User,
				wasAlreadyAuthenticated: true,
			});
		});

		expect(getPrivyLoginMethod(PRIVY_USER_ID)).toBe("email");
		expect(container.querySelector("output")?.textContent).toBe("email");
	});

	it("records the exact external wallet used by an SIWE login", () => {
		const walletAddress = "0x1111111111111111111111111111111111111111";
		act(() => {
			root.render(createElement(TestHarness));
		});

		act(() => {
			testState.onComplete?.({
				isNewUser: false,
				loginAccount: { address: walletAddress, type: "wallet" },
				loginMethod: "siwe",
				user: { id: PRIVY_USER_ID } as User,
				wasAlreadyAuthenticated: false,
			});
		});

		expect(getPrivyLoginIntent(PRIVY_USER_ID)).toMatchObject({
			method: "wallet",
			userId: PRIVY_USER_ID,
			walletAddress,
		});
	});

	it("keeps the same Privy user's login intent isolated to each tab session", () => {
		const key = getPrivyLoginIntentStorageKey(PRIVY_USER_ID);
		recordPrivyLoginMethod(PRIVY_USER_ID, "email");
		const firstTabValue = window.sessionStorage.getItem(key);

		expect(firstTabValue).not.toBeNull();
		expect(window.localStorage.getItem(key)).toBeNull();

		window.sessionStorage.clear();
		recordPrivyLoginMethod(PRIVY_USER_ID, "siwe", "0x1111111111111111111111111111111111111111");
		expect(getPrivyLoginMethod(PRIVY_USER_ID)).toBe("wallet");

		window.sessionStorage.clear();
		if (firstTabValue) window.sessionStorage.setItem(key, firstTabValue);
		expect(getPrivyLoginMethod(PRIVY_USER_ID)).toBe("email");
	});
});
