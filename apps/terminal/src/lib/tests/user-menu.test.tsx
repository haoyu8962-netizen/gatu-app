import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @vitest-environment jsdom

import { act, createElement, Fragment, type ReactNode, useEffect } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	exportVisible: false,
	exportWallet: vi.fn(async (beforeOpen?: () => void) => {
		beforeOpen?.();
	}),
	authenticated: false,
	displayAddress: undefined as `0x${string}` | undefined,
	emailAddress: undefined as string | undefined,
	ensName: undefined as string | undefined,
	hasWalletAccess: false,
	isConnected: false,
	isConnecting: false,
	isDisconnecting: false,
	isWalletReconnecting: false,
	isReconnecting: false,
	isMobile: false,
	isMobileQrSurface: false,
	login: vi.fn(),
	mobileSyncModalModuleGate: null as Promise<void> | null,
	mobileSyncModalModuleReady: null as (() => void) | null,
	mobileSyncModalModuleLoads: 0,
	mobileSyncModalMounts: 0,
	mobileSyncModalOpen: false,
	mobileSyncModalUnmounts: 0,
	ready: true,
	reconnectWallet: vi.fn(),
	disconnectWallet: vi.fn(),
	userId: "user-a",
	sessionMode: "disconnected" as "agent-only" | "disconnected" | "wallet",
	walletModalOpen: false,
	walletModalModuleGate: null as Promise<void> | null,
	walletModalModuleReady: null as (() => void) | null,
	walletModalModuleLoads: 0,
	walletModalMounts: 0,
	walletModalPreloadFailure: undefined as Error | undefined,
	walletModalPreloads: 0,
	walletModalWrapperFailures: 0,
	walletsReady: true,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type TestLazyComponent = ((props: Record<string, unknown>) => ReactNode) & {
	preload?: () => Promise<unknown>;
};

vi.mock("@/hooks/wallet/use-email-wallet-export", () => ({
	useEmailWalletExport: () => ({
		visible: testState.exportVisible,
		canExport: true,
		exportEmailWallet: testState.exportWallet,
	}),
}));

vi.mock("@gatu/ui", () => ({
	buttonVariants: () => "",
	AdaptiveModal: ({
		children,
		closeLabel,
		onOpenChange,
		open,
		presentation,
	}: {
		children: ReactNode;
		closeLabel?: string;
		onOpenChange: (open: boolean) => void;
		open: boolean;
		presentation?: "auto" | "drawer" | "modal";
	}) =>
		open
			? createElement(
					"div",
					{ "aria-modal": "true", "data-presentation": presentation, role: "dialog" },
					children,
					createElement(
						"button",
						{ "aria-label": closeLabel, onClick: () => onOpenChange(false), type: "button" },
						closeLabel,
					),
				)
			: null,
	Button: ({
		children,
		className,
		disabled,
		onFocus,
		onClick,
		onPointerEnter,
	}: {
		children: ReactNode;
		className?: string;
		disabled?: boolean;
		onFocus?: () => void;
		onClick?: () => void;
		onPointerEnter?: () => void;
	}) => createElement("button", { className, disabled, onClick, onFocus, onPointerEnter, type: "button" }, children),
	ButtonIcon: ({ "aria-label": ariaLabel }: { "aria-label"?: string }) =>
		createElement("button", { "aria-label": ariaLabel, type: "button" }),
	Dropdown: ({
		className,
		groups = [],
		trigger,
		triggerAriaLabel,
		triggerClassName,
	}: {
		className?: string;
		groups?: Array<{ items: Array<{ label: string; disabled?: boolean; onSelect?: () => void }> }>;
		trigger?: ReactNode;
		triggerAriaLabel?: string;
		triggerClassName?: string;
	}) =>
		createElement(
			"div",
			{ className, "data-testid": "user-menu-dropdown" },
			createElement("button", { "aria-label": triggerAriaLabel, className: triggerClassName, type: "button" }, trigger),
			groups.flatMap((group) =>
				group.items.map((item) =>
					createElement(
						"button",
						{ key: item.label, disabled: item.disabled, onClick: item.onSelect, type: "button" },
						item.label,
					),
				),
			),
		),
	ModalContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalFooter: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
}));

vi.mock("@lingui/react/macro", () => ({
	Trans: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children),
	useLingui: () => ({ t: (value: TemplateStringsArray) => value[0] }),
}));

vi.mock("@phosphor-icons/react", () => ({
	ArrowClockwiseIcon: () => null,
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

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => testState.isMobile,
	useIsMobileQrSurface: () => testState.isMobileQrSurface,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useDisconnectWallet: () => ({
		disconnectWallet: testState.disconnectWallet,
		isDisconnecting: testState.isDisconnecting,
	}),
	useReconnectWallet: () => ({
		reconnectWallet: testState.reconnectWallet,
		walletsReady: testState.walletsReady,
		isReconnecting: testState.isReconnecting,
	}),
	useWalletSession: () => ({
		ready: testState.ready && testState.walletsReady,
		authenticationReady: testState.ready,
		walletDirectoryReady: testState.walletsReady,
		authenticated: testState.authenticated,
		isConnected: testState.isConnected,
		isConnecting: testState.isConnecting,
		isReconnecting: testState.isWalletReconnecting,
		login: testState.login,
		displayAddress: testState.displayAddress,
		sessionMode: testState.sessionMode,
		hasWalletAccess: testState.hasWalletAccess,
		user: testState.authenticated ? { id: testState.userId } : null,
	}),
}));

vi.mock("@/lib/wallet/privy-wagmi", () => ({
	getPrivyEmailAddress: () => testState.emailAddress,
}));

vi.mock("@/lib/error-reporting/client", () => ({
	reportClientError: vi.fn(),
}));

vi.mock("@/lib/lazy", async () => {
	const actual = await vi.importActual<typeof import("@/lib/lazy")>("@/lib/lazy");
	return {
		...actual,
		createLazyComponent(importer: () => Promise<Record<string, unknown>>, exportName: string) {
			const gatedImporter = async () => {
				if (exportName === "WalletModal") {
					testState.walletModalModuleLoads += 1;
					await testState.walletModalModuleGate;
				} else if (exportName === "MobileAgentSyncModal") {
					testState.mobileSyncModalModuleLoads += 1;
					await testState.mobileSyncModalModuleGate;
				}

				const module = await importer();
				if (exportName === "WalletModal") testState.walletModalModuleReady?.();
				if (exportName === "MobileAgentSyncModal") testState.mobileSyncModalModuleReady?.();
				return module;
			};
			const LazyComponent = Reflect.apply(actual.createLazyComponent, undefined, [
				gatedImporter,
				exportName,
			]) as TestLazyComponent;
			if (exportName === "WalletModal") {
				let preloadFailure: Error | undefined;
				const TestWalletModal = (props: Record<string, unknown>) => {
					if (preloadFailure) throw preloadFailure;
					return createElement(LazyComponent, props);
				};
				return Object.assign(TestWalletModal, {
					preload: async () => {
						if (testState.walletModalWrapperFailures > 0) {
							testState.walletModalWrapperFailures -= 1;
							testState.walletModalPreloads += 1;
							preloadFailure = testState.walletModalPreloadFailure;
							return;
						}
						await LazyComponent.preload?.();
					},
				});
			}
			return LazyComponent;
		},
	};
});

vi.mock("@/components/trade/components/mobile-agent-sync-modal", () => ({
	MobileAgentSyncModal: ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
		useEffect(() => {
			testState.mobileSyncModalMounts += 1;
			return () => {
				testState.mobileSyncModalUnmounts += 1;
			};
		}, []);
		testState.mobileSyncModalOpen = open;
		return open
			? createElement("button", {
					"data-testid": "mobile-sync-modal",
					onClick: () => onOpenChange(false),
					type: "button",
				})
			: null;
	},
}));

vi.mock("@/components/trade/components/wallet-modal", () => ({
	WalletModal: ({ open }: { open: boolean }) => {
		useEffect(() => {
			testState.walletModalMounts += 1;
		}, []);
		testState.walletModalOpen = open;
		return open ? createElement("div", { "data-testid": "wallet-modal" }) : null;
	},
}));

let UserMenu: typeof import("@/components/trade/header/user-menu").UserMenu;
let UserMenuModalLoadError: typeof import("@/components/trade/header/user-menu-modal-load").UserMenuModalLoadError;

describe("UserMenu", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(async () => {
		testState.exportVisible = false;
		testState.exportWallet.mockClear();
		testState.authenticated = false;
		testState.displayAddress = undefined;
		testState.emailAddress = undefined;
		testState.ensName = undefined;
		testState.hasWalletAccess = false;
		testState.isConnected = false;
		testState.isConnecting = false;
		testState.isDisconnecting = false;
		testState.isReconnecting = false;
		testState.isWalletReconnecting = false;
		testState.userId = "user-a";
		testState.isMobile = false;
		testState.isMobileQrSurface = false;
		testState.mobileSyncModalModuleGate = null;
		testState.mobileSyncModalModuleReady = null;
		testState.mobileSyncModalModuleLoads = 0;
		testState.mobileSyncModalMounts = 0;
		testState.mobileSyncModalOpen = false;
		testState.mobileSyncModalUnmounts = 0;
		testState.ready = true;
		testState.sessionMode = "disconnected";
		window.localStorage.clear();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		testState.login.mockReset();
		testState.walletModalOpen = false;
		testState.walletModalModuleGate = null;
		testState.walletModalModuleReady = null;
		testState.walletModalModuleLoads = 0;
		testState.walletModalMounts = 0;
		testState.walletModalPreloadFailure = undefined;
		testState.walletModalPreloads = 0;
		testState.walletModalWrapperFailures = 0;
		testState.walletsReady = true;
		vi.resetModules();
		[{ UserMenu }, { UserMenuModalLoadError }] = await Promise.all([
			import("@/components/trade/header/user-menu"),
			import("@/components/trade/header/user-menu-modal-load"),
		]);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
		vi.useRealTimers();
	});

	it("offers an explicit email export action in the account menu", async () => {
		testState.authenticated = true;
		testState.emailAddress = "owner@example.test";
		testState.exportVisible = true;
		act(() => root.render(createElement(UserMenu)));
		const button = [...container.querySelectorAll("button")].find((item) => item.textContent === "Export email wallet");
		expect(button).toBeDefined();
		await act(async () => {
			button?.click();
		});
		expect(testState.exportWallet).toHaveBeenCalledOnce();
	});

	it("loads the shared wallet modal on demand without waiting for unauthenticated wallet connectors", async () => {
		testState.walletsReady = false;
		testState.isMobileQrSurface = true;
		let releaseModule: (() => void) | undefined;
		let markModuleReady: (() => void) | undefined;
		testState.walletModalModuleGate = new Promise((resolve) => {
			releaseModule = resolve;
		});
		const moduleReady = new Promise<void>((resolve) => {
			markModuleReady = resolve;
		});
		testState.walletModalModuleReady = () => markModuleReady?.();

		await act(async () => {
			root.render(createElement(UserMenu));
		});

		expect(testState.walletModalModuleLoads).toBe(0);
		expect(container.querySelector('[data-testid="wallet-modal"]')).toBeNull();

		await act(async () => container.querySelector("button")?.click());
		expect(container.querySelector('[data-testid="user-menu-modal-loading-fallback"]')?.textContent).toContain(
			"Connecting...",
		);
		expect(container.querySelector('[role="dialog"]')?.getAttribute("data-presentation")).toBe("drawer");

		await act(async () => {
			releaseModule?.();
			await moduleReady;
		});
		await vi.waitFor(() => expect(testState.walletModalMounts).toBe(1));

		expect(container.querySelector('[data-testid="user-menu-modal-loading-fallback"]')).toBeNull();
		expect(testState.walletModalMounts).toBe(1);
		expect(testState.walletModalOpen).toBe(true);
		expect(container.querySelector('[data-testid="wallet-modal"]')).not.toBeNull();
		expect(testState.login).not.toHaveBeenCalled();
	});

	it("contains a poisoned preload locally and retries the wallet modal without replacing the terminal", async () => {
		testState.walletModalWrapperFailures = 1;
		testState.walletModalPreloadFailure = new UserMenuModalLoadError(new Error("simulated wallet modal chunk failure"));
		vi.spyOn(console, "error").mockImplementation(() => {});

		await act(async () => {
			root.render(
				createElement(
					Fragment,
					null,
					createElement("button", { "data-testid": "terminal-control", type: "button" }, "Terminal control"),
					createElement(UserMenu),
				),
			);
		});

		const connectWallet = findButtonByText(container, "Connect");
		act(() => connectWallet.focus());
		expect(testState.walletModalPreloads).toBe(1);

		act(() => connectWallet.click());
		await vi.waitFor(() => expect(findButtonByText(container, "Try again")).not.toBeNull());
		expect(container.querySelector('[data-testid="terminal-control"]')).not.toBeNull();
		expect(container.textContent).not.toContain("simulated wallet modal chunk failure");

		let markModuleReady: (() => void) | undefined;
		const moduleReady = new Promise<void>((resolve) => {
			markModuleReady = resolve;
		});
		testState.walletModalModuleReady = () => markModuleReady?.();
		await act(async () => {
			findButtonByText(container, "Try again").click();
			await moduleReady;
		});
		await vi.waitFor(() => expect(container.querySelector('[data-testid="wallet-modal"]')).not.toBeNull());
		expect(container.querySelector('[data-testid="terminal-control"]')).not.toBeNull();
		expect(testState.walletModalMounts).toBe(1);
	});

	it("loads mobile sync on demand and keeps its recovery host mounted after close and remount", async () => {
		testState.authenticated = true;
		testState.displayAddress = "0x1234567890abcdef1234567890abcdef12345678";
		testState.hasWalletAccess = true;
		testState.isConnected = true;
		testState.isMobile = true;
		testState.sessionMode = "wallet";
		let releaseModule: (() => void) | undefined;
		let markModuleReady: (() => void) | undefined;
		testState.mobileSyncModalModuleGate = new Promise((resolve) => {
			releaseModule = resolve;
		});
		const moduleReady = new Promise<void>((resolve) => {
			markModuleReady = resolve;
		});
		testState.mobileSyncModalModuleReady = () => markModuleReady?.();

		await act(async () => {
			root.render(createElement(UserMenu));
		});

		expect(testState.mobileSyncModalModuleLoads).toBe(0);
		const linkMobileButton = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Link mobile device",
		);
		await act(async () => linkMobileButton?.click());
		expect(container.querySelector('[data-testid="user-menu-modal-loading-fallback"]')?.textContent).toContain(
			"Connecting...",
		);
		expect(container.querySelector('[role="dialog"]')?.getAttribute("data-presentation")).toBe("drawer");

		await act(async () => {
			releaseModule?.();
			await moduleReady;
		});
		await vi.waitFor(() => expect(testState.mobileSyncModalMounts).toBe(1));

		expect(container.querySelector('[data-testid="user-menu-modal-loading-fallback"]')).toBeNull();
		expect(testState.mobileSyncModalMounts).toBe(1);
		expect(testState.mobileSyncModalOpen).toBe(true);

		await act(async () => {
			container.querySelector<HTMLButtonElement>('[data-testid="mobile-sync-modal"]')?.click();
		});
		expect(testState.mobileSyncModalOpen).toBe(false);
		expect(testState.mobileSyncModalUnmounts).toBe(0);

		act(() => root.unmount());
		root = createI18nRoot(container);
		await act(async () => {
			root.render(createElement(UserMenu));
		});

		expect(testState.mobileSyncModalModuleLoads).toBe(1);
		expect(testState.mobileSyncModalMounts).toBe(2);
		expect(testState.mobileSyncModalOpen).toBe(false);
	});

	it("gives the anonymous desktop CTA the shared minimum width and wallet action", () => {
		act(() => root.render(createElement(UserMenu, { variant: "desktop-nav" })));
		const action = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Connect Wallet",
		);
		expect(action).toBeDefined();
		expect(action?.className).toContain("min-w-[9rem]");
		act(() => action?.click());
	});

	it("decides the first frame from the persisted session hint without a mount effect", () => {
		const source = readFileSync(resolve(__dirname, "../../components/trade/header/user-menu.tsx"), "utf8");
		expect(source).toContain("useState(() => hasPersistedPrivySession())");
		expect(source).not.toMatch(/setMounted|\[mounted,|useEffect\(/);
	});

	it("keeps the ENS name in the compact desktop-nav label for accounts without email", () => {
		testState.authenticated = false;
		testState.displayAddress = "0x1234567890abcdef1234567890abcdef12345678";
		testState.emailAddress = undefined;
		testState.ensName = "vitalik.eth";
		testState.hasWalletAccess = true;
		testState.isConnected = true;
		testState.sessionMode = "wallet";
		act(() => {
			root.render(createElement(UserMenu, { variant: "desktop-nav" }));
		});
		const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Account and wallet"]');
		expect([...(trigger?.querySelectorAll("bdi") ?? [])].map((label) => label.textContent)).toEqual([
			"vitalik.eth",
			"vitalik.eth",
		]);
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
		expect([...(trigger?.querySelectorAll("bdi") ?? [])].map((label) => label.textContent)).toEqual([
			testState.emailAddress,
			testState.emailAddress,
		]);
		expect(dropdown?.className).toContain("shrink-0");
		expect(trigger?.className).toContain("shrink-0");
		expect(
			desktopLabelClasses.some((className) => className.includes("nav-compact:hidden")),
			desktopLabelClasses.join("\n"),
		).toBe(true);
		expect(
			desktopLabelClasses.some((className) => className.includes("nav-compact:block")),
			desktopLabelClasses.join("\n"),
		).toBe(true);
	});

	it("keeps loading and connect labels inside the mobile account width", () => {
		testState.ready = false;
		window.localStorage.setItem("privy:token", "stored-session");
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

		action = findButtonByText(container, "Connect");
		expect(action.className).toContain("min-w-0");
		expect(action.className).toContain("max-w-full");
		expect(action.querySelector("span.truncate")).not.toBeNull();
	});

	it("keeps the account menu accessible when its exact wallet needs reconnection", () => {
		testState.authenticated = true;
		act(() => root.render(createElement(UserMenu)));

		const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Account and wallet"]');
		expect(trigger?.textContent).toBe("Account");
		expect(trigger?.disabled).toBe(false);
		expect(trigger?.className).toContain("min-w-0");
		expect(trigger?.className).toContain("max-w-full");
		expect(trigger?.querySelector("span.bg-fg-muted")).not.toBeNull();
		expect(container.textContent).not.toContain("Copy Address");
		expect(container.textContent).not.toContain("Link mobile device");
		act(() => findButtonByText(container, "Reconnect wallet").click());
		expect(testState.reconnectWallet).toHaveBeenCalledOnce();
		act(() => findButtonByText(container, "Disconnect").click());
		expect(testState.disconnectWallet).toHaveBeenCalledOnce();
	});

	it("prevents duplicate disconnect while secure cleanup is running", () => {
		testState.authenticated = true;
		testState.isDisconnecting = true;
		act(() => root.render(createElement(UserMenu)));
		const disconnect = findButtonByText(container, "Disconnect");
		expect(disconnect.disabled).toBe(true);
		act(() => disconnect.click());
		expect(testState.disconnectWallet).not.toHaveBeenCalled();
	});

	it("shows the connect entry before Privy is ready when this browser holds no Privy session", async () => {
		testState.ready = false;
		testState.walletsReady = false;
		await act(async () => {
			root.render(createElement(UserMenu));
		});
		expect(container.textContent).not.toContain("Connecting...");
		const connect = findButtonByText(container, "Connect");
		expect(connect.disabled).toBe(false);
		await act(async () => connect.click());
		await vi.waitFor(() => expect(testState.walletModalMounts).toBe(1));
		expect(testState.walletModalOpen).toBe(true);
		expect(testState.login).not.toHaveBeenCalled();
	});

	it("waits with the connecting state before Privy is ready when a Privy session is stored", () => {
		testState.ready = false;
		testState.walletsReady = false;
		window.localStorage.setItem("privy:refresh_token", "stored-session");
		act(() => root.render(createElement(UserMenu)));
		expect(findButtonByText(container, "Connecting...").disabled).toBe(true);
		expect(container.textContent).not.toContain("Connect Wallet");
	});

	it("offers auth initialization recovery only after the delay and removes it when auth becomes ready", () => {
		vi.useFakeTimers();
		testState.ready = false;
		testState.walletsReady = false;
		window.localStorage.setItem("privy:token", "stored-session");
		act(() => root.render(createElement(UserMenu)));
		expect(findButtonByText(container, "Connecting...").disabled).toBe(true);
		act(() => vi.advanceTimersByTime(29_999));
		expect(container.textContent).not.toContain("Reload page");
		act(() => vi.advanceTimersByTime(1));
		const reload = findButtonByText(container, "Reload page");
		expect(reload.disabled).toBe(false);
		expect(reload.className).toContain("min-w-0");
		expect(reload.querySelector("span.truncate")).not.toBeNull();
		expect(testState.login).not.toHaveBeenCalled();
		expect(testState.disconnectWallet).not.toHaveBeenCalled();
		expect(testState.reconnectWallet).not.toHaveBeenCalled();

		testState.ready = true;
		act(() => root.render(createElement(UserMenu)));
		expect(findButtonByText(container, "Connect").disabled).toBe(false);
		expect(container.textContent).not.toContain("Reload page");
	});

	it("shows authenticated identity during wallet initialization without permitting wallet actions", () => {
		vi.useFakeTimers();
		testState.authenticated = true;
		testState.emailAddress = "owner@example.test";
		testState.walletsReady = false;
		act(() => root.render(createElement(UserMenu)));

		const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Account and wallet"]');
		expect(trigger?.disabled).toBe(false);
		expect(trigger?.textContent).toBe("owner");
		expect(trigger?.querySelector("span.font-mono")?.getAttribute("title")).toBe("owner@example.test");
		expect(trigger?.querySelector("span.bg-fg-muted")).not.toBeNull();
		expect(findButtonByText(container, "Reconnect wallet").disabled).toBe(true);
		expect(findButtonByText(container, "Disconnect").disabled).toBe(true);
		act(() => findButtonByText(container, "Reconnect wallet").click());
		act(() => findButtonByText(container, "Disconnect").click());
		expect(testState.reconnectWallet).not.toHaveBeenCalled();
		expect(testState.disconnectWallet).not.toHaveBeenCalled();
		expect(container.textContent).not.toContain("Link mobile device");
		expect(container.textContent).not.toContain("Copy Address");
		act(() => vi.advanceTimersByTime(30_000));
		expect(findButtonByText(container, "Reload page").disabled).toBe(false);
		expect(testState.disconnectWallet).not.toHaveBeenCalled();

		testState.walletsReady = true;
		testState.hasWalletAccess = true;
		testState.isConnected = true;
		testState.sessionMode = "wallet";
		testState.displayAddress = "0x1234567890abcdef1234567890abcdef12345678";
		act(() => root.render(createElement(UserMenu)));
		expect(container.querySelector('button[aria-label="Account and wallet"]')).toBe(trigger);
		expect(container.textContent).not.toContain("Reload page");
		expect(container.textContent).not.toContain("Reconnect wallet");
		expect(container.textContent).toContain("Copy Address");
		expect(container.textContent).toContain("Link mobile device");
		expect(trigger?.querySelector("span.bg-success")).not.toBeNull();
	});

	it("gives each authentication phase and user a fresh recovery delay", () => {
		vi.useFakeTimers();
		testState.ready = false;
		testState.walletsReady = false;
		act(() => root.render(createElement(UserMenu)));
		act(() => vi.advanceTimersByTime(30_000));
		expect(container.textContent).toContain("Reload page");

		testState.ready = true;
		testState.authenticated = true;
		act(() => root.render(createElement(UserMenu)));
		expect(container.textContent).not.toContain("Reload page");
		act(() => vi.advanceTimersByTime(29_999));
		testState.userId = "user-b";
		act(() => root.render(createElement(UserMenu)));
		act(() => vi.advanceTimersByTime(1));
		expect(container.textContent).not.toContain("Reload page");
		act(() => vi.advanceTimersByTime(29_999));
		expect(container.textContent).toContain("Reload page");

		testState.authenticated = false;
		act(() => root.render(createElement(UserMenu)));
		expect(container.textContent).not.toContain("Reload page");
		expect(findButtonByText(container, "Connect").disabled).toBe(false);
	});

	it.each(["isConnecting", "isWalletReconnecting", "isReconnecting"] as const)(
		"retains identity access and prevents duplicate reconnection during %s",
		(field) => {
			testState.authenticated = true;
			testState[field] = true;
			act(() => root.render(createElement(UserMenu)));
			expect(container.querySelector<HTMLButtonElement>('button[aria-label="Account and wallet"]')?.disabled).toBe(
				false,
			);
			expect(findButtonByText(container, "Reconnect wallet").disabled).toBe(true);
			act(() => findButtonByText(container, "Reconnect wallet").click());
			expect(testState.reconnectWallet).not.toHaveBeenCalled();
		},
	);

	it("preserves agent-only account access without waiting for Privy initialization", () => {
		vi.useFakeTimers();
		testState.ready = false;
		testState.walletsReady = false;
		testState.isConnected = true;
		testState.sessionMode = "agent-only";
		testState.displayAddress = "0x1234567890abcdef1234567890abcdef12345678";
		act(() => root.render(createElement(UserMenu)));
		act(() => vi.advanceTimersByTime(60_000));
		expect(container.querySelector<HTMLButtonElement>('button[aria-label="Account and wallet"]')?.disabled).toBe(false);
		expect(container.textContent).toContain("Copy Address");
		expect(container.textContent).not.toContain("Reload page");
		expect(container.textContent).not.toContain("Reconnect wallet");
		expect(container.textContent).not.toContain("Link mobile device");
	});
});

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement {
	const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
		(candidate) => candidate.textContent?.trim() === text,
	);
	if (!button) throw new Error(`Expected button with text: ${text}`);
	return button;
}
