// @vitest-environment jsdom

import { act, createElement, Fragment, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	authenticated: false,
	displayAddress: undefined as `0x${string}` | undefined,
	emailAddress: undefined as string | undefined,
	ensName: undefined as string | undefined,
	hasWalletAccess: false,
	isConnected: false,
	login: vi.fn(),
	ready: true,
	sessionMode: "disconnected" as "agent-only" | "disconnected" | "wallet",
	walletModalOpen: false,
	walletsReady: true,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@gatu/ui", () => ({
	Button: ({
		children,
		className,
		disabled,
		onClick,
	}: {
		children: ReactNode;
		className?: string;
		disabled?: boolean;
		onClick?: () => void;
	}) => createElement("button", { className, disabled, onClick, type: "button" }, children),
	ButtonIcon: ({ "aria-label": ariaLabel }: { "aria-label"?: string }) =>
		createElement("button", { "aria-label": ariaLabel, type: "button" }),
	Dropdown: ({
		className,
		trigger,
		triggerAriaLabel,
		triggerClassName,
	}: {
		className?: string;
		trigger?: ReactNode;
		triggerAriaLabel?: string;
		triggerClassName?: string;
	}) =>
		createElement(
			"div",
			{ className, "data-testid": "user-menu-dropdown" },
			createElement("button", { "aria-label": triggerAriaLabel, className: triggerClassName, type: "button" }, trigger),
		),
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
	useEnsName: () => ({ data: testState.ensName }),
}));

vi.mock("@/hooks/ui/use-copy-to-clipboard", () => ({
	useCopyToClipboard: () => ({ copied: false, copy: vi.fn() }),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useDisconnectWallet: () => ({ disconnectWallet: vi.fn() }),
	useReconnectWallet: () => ({
		reconnectWallet: vi.fn(),
		walletsReady: testState.walletsReady,
		isReconnecting: false,
	}),
	useWalletSession: () => ({
		ready: testState.ready,
		authenticated: testState.authenticated,
		isConnected: testState.isConnected,
		isConnecting: false,
		login: testState.login,
		displayAddress: testState.displayAddress,
		sessionMode: testState.sessionMode,
		hasWalletAccess: testState.hasWalletAccess,
		user: null,
	}),
}));

vi.mock("@/lib/wallet/privy-wagmi", () => ({
	getPrivyEmailAddress: () => testState.emailAddress,
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

import { UserMenu } from "@/components/trade/header/user-menu";

describe("UserMenu", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		testState.authenticated = false;
		testState.displayAddress = undefined;
		testState.emailAddress = undefined;
		testState.ensName = undefined;
		testState.hasWalletAccess = false;
		testState.isConnected = false;
		testState.ready = true;
		testState.sessionMode = "disconnected";
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		testState.login.mockReset();
		testState.walletModalOpen = false;
		testState.walletsReady = true;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("opens the shared wallet modal without waiting for unauthenticated wallet connectors", () => {
		testState.walletsReady = false;

		act(() => {
			root.render(createElement(UserMenu));
		});
		act(() => {
			container.querySelector("button")?.click();
		});

		expect(testState.walletModalOpen).toBe(true);
		expect(container.querySelector('[data-testid="wallet-modal"]')).not.toBeNull();
		expect(testState.login).not.toHaveBeenCalled();
	});

	it("lets the mobile account trigger shrink and truncate without changing the desktop-nav contract", () => {
		testState.authenticated = true;
		testState.displayAddress = "0x1234567890abcdef1234567890abcdef12345678";
		testState.emailAddress = "a-very-long-mobile-account-address@example.test";
		testState.hasWalletAccess = true;
		testState.isConnected = true;
		testState.sessionMode = "wallet";
		act(() => {
			root.render(createElement(UserMenu));
		});

		let dropdown = container.querySelector<HTMLElement>('[data-testid="user-menu-dropdown"]');
		let trigger = dropdown?.querySelector<HTMLButtonElement>('button[aria-label="Account and wallet"]');
		const label = trigger?.querySelector<HTMLElement>("span.font-mono");
		expect(dropdown?.className).toContain("min-w-0");
		expect(dropdown?.className).toContain("max-w-full");
		expect(dropdown?.className).not.toContain("shrink-0");
		expect(trigger?.className).toContain("min-w-0");
		expect(trigger?.className).toContain("max-w-full");
		expect(trigger?.className).not.toContain("shrink-0");
		expect(label?.className).toContain("truncate");

		act(() => {
			root.render(createElement(UserMenu, { variant: "desktop-nav" }));
		});

		dropdown = container.querySelector<HTMLElement>('[data-testid="user-menu-dropdown"]');
		trigger = dropdown?.querySelector<HTMLButtonElement>('button[aria-label="Account and wallet"]');
		const desktopLabels = [...(trigger?.querySelectorAll<HTMLElement>("span.truncate") ?? [])];
		const desktopLabelClasses = desktopLabels.map((item) => item.className);
		expect(dropdown?.className).toContain("shrink-0");
		expect(trigger?.className).toContain("shrink-0");
		expect(
			desktopLabelClasses.some((className) => className.includes("max-[1181px]:hidden")),
			desktopLabelClasses.join("\n"),
		).toBe(true);
		expect(
			desktopLabelClasses.some((className) => className.includes("max-[1181px]:block")),
			desktopLabelClasses.join("\n"),
		).toBe(true);
	});

	it("keeps loading and connect labels inside the mobile account width", () => {
		testState.ready = false;
		act(() => {
			root.render(createElement(UserMenu));
		});

		let action = findButtonByText(container, "Connecting...");
		expect(action.className).toContain("min-w-0");
		expect(action.className).toContain("max-w-full");
		expect(action.querySelector("span.truncate")).not.toBeNull();

		testState.ready = true;
		act(() => {
			root.render(createElement(UserMenu));
		});

		action = findButtonByText(container, "Connect Wallet");
		expect(action.className).toContain("min-w-0");
		expect(action.className).toContain("max-w-full");
		expect(action.querySelector("span.truncate")).not.toBeNull();
	});

	it("keeps reconnect controls shrinkable without collapsing disconnect", () => {
		testState.authenticated = true;
		testState.displayAddress = "0x1234567890abcdef1234567890abcdef12345678";
		testState.isConnected = true;
		testState.sessionMode = "wallet";
		act(() => {
			root.render(createElement(UserMenu));
		});

		const reconnect = findButtonByText(container, "Reconnect wallet");
		const controls = reconnect.parentElement;
		expect(controls?.className).toContain("min-w-0");
		expect(controls?.className).toContain("max-w-full");
		expect(controls?.className).toContain("gap-2");
		expect(reconnect.className).toContain("min-w-0");
		expect(reconnect.className).toContain("flex-1");
		expect(reconnect.querySelector("span.truncate")).not.toBeNull();
		expect(controls?.querySelector('button[aria-label="Disconnect"]')).not.toBeNull();
	});
});

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement {
	const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
		(candidate) => candidate.textContent?.trim() === text,
	);
	if (!button) throw new Error(`Expected button with text: ${text}`);
	return button;
}
