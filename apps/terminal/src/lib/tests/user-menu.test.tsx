// @vitest-environment jsdom

import { act, createElement, Fragment, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	login: vi.fn(),
	walletModalOpen: false,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@gatu/ui", () => ({
	Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) =>
		createElement("button", { onClick, type: "button" }, children),
	ButtonIcon: () => null,
	Dropdown: () => null,
}));

vi.mock("@lingui/react/macro", () => ({
	Trans: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children),
	useLingui: () => ({ t: (value: TemplateStringsArray) => value[0] }),
}));

vi.mock("@phosphor-icons/react", () => ({
	CheckIcon: () => null,
	CopyIcon: () => null,
	DeviceMobileIcon: () => null,
	SignOutIcon: () => null,
	SpinnerGapIcon: () => null,
	WalletIcon: () => null,
}));

vi.mock("wagmi", () => ({
	useEnsName: () => ({ data: undefined }),
}));

vi.mock("@/hooks/ui/use-copy-to-clipboard", () => ({
	useCopyToClipboard: () => ({ copied: false, copy: vi.fn() }),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useDisconnectWallet: () => ({ disconnectWallet: vi.fn() }),
	useReconnectWallet: () => ({ reconnectWallet: vi.fn(), walletsReady: true, isReconnecting: false }),
	useWalletSession: () => ({
		ready: true,
		authenticated: false,
		isConnected: false,
		isConnecting: false,
		login: testState.login,
		displayAddress: undefined,
		sessionMode: "disconnected",
		hasWalletAccess: false,
		user: null,
	}),
}));

vi.mock("@/lib/wallet/privy-wagmi", () => ({
	getPrivyEmailAddress: () => undefined,
}));

vi.mock("@/components/trade/components/mobile-agent-sync-modal", () => ({
	MobileAgentSyncModal: () => null,
}));

vi.mock("@/components/trade/components/wallet-modal", () => ({
	WalletModal: ({ open }: { open: boolean }) => {
		testState.walletModalOpen = open;
		return open ? createElement("div", { "data-testid": "wallet-modal" }) : null;
	},
}));

describe("UserMenu", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		testState.login.mockReset();
		testState.walletModalOpen = false;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("opens the shared wallet modal before starting a connection", async () => {
		const { UserMenu } = await import("@/components/trade/header/user-menu");

		await act(async () => {
			root.render(createElement(UserMenu));
		});
		act(() => {
			container.querySelector("button")?.click();
		});

		expect(testState.walletModalOpen).toBe(true);
		expect(container.querySelector('[data-testid="wallet-modal"]')).not.toBeNull();
		expect(testState.login).not.toHaveBeenCalled();
	});
});
