// @vitest-environment jsdom

import type { User } from "@privy-io/react-auth";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
	onComplete: undefined as ((params: LoginCompleteParams) => void) | undefined,
}));

const PRIVY_USER_ID = "did:privy:test-user";

vi.mock("@privy-io/react-auth", () => ({
	useLogin: (callbacks: { onComplete?: (params: LoginCompleteParams) => void }) => {
		testState.onComplete = callbacks.onComplete;
		return { login: vi.fn() };
	},
}));

function LoginIntentProbe() {
	const intent = usePrivyLoginIntent(PRIVY_USER_ID);
	return createElement("output", null, intent?.method ?? "missing");
}

function TestHarness() {
	return createElement("div", null, createElement(PrivyLoginMethodObserver), createElement(LoginIntentProbe));
}

describe("PrivyLoginMethodObserver", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		window.localStorage.clear();
		window.sessionStorage.clear();
		testState.onComplete = undefined;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
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
