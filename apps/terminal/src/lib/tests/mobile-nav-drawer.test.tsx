// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act, createElement, Fragment, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileNavDrawer } from "@/components/trade/mobile/mobile-nav-drawer";
import { HYPERSCREENER_URL } from "@/config/nav";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	router: {
		navigate: vi.fn(async () => {}),
		preloadRoute: vi.fn(async () => {}),
		subscribe: vi.fn(() => () => {}),
	},
	depositOpen: vi.fn(),
	depositAvailable: true,
	depositPath: "external" as "external" | "sponsored",
	depositUnavailableReason: null as string | null,
	hasWalletAccess: false,
	pathname: "/api-wallet",
	preloadGlobalModal: vi.fn(async (): Promise<void> => undefined),
	warmDepositModal: vi.fn(),
	sessionMode: "disconnected" as "wallet" | "agent-only" | "disconnected",
	settingsOpen: vi.fn(),
}));

vi.mock("@sairn/ui", () => ({
	Badge: ({ children }: { children: ReactNode }) => createElement("span", null, children),
	Button: ({
		"aria-label": ariaLabel,
		"aria-busy": ariaBusy,
		children,
		disabled,
		iconLeft,
		onClick,
		onPointerDown,
	}: {
		"aria-label"?: string;
		"aria-busy"?: boolean;
		children: ReactNode;
		disabled?: boolean;
		iconLeft?: ReactNode;
		onClick?: () => void;
		onPointerDown?: () => void;
	}) =>
		createElement(
			"button",
			{ "aria-busy": ariaBusy, "aria-label": ariaLabel, disabled, onClick, onPointerDown, type: "button" },
			iconLeft,
			children,
		),
	ButtonIcon: ({
		"aria-busy": ariaBusy,
		"aria-label": ariaLabel,
		children,
		disabled,
		onClick,
	}: {
		"aria-busy"?: boolean;
		"aria-label"?: string;
		children: ReactNode;
		disabled?: boolean;
		onClick?: () => void;
	}) =>
		createElement(
			"button",
			{ "aria-busy": ariaBusy, "aria-label": ariaLabel, disabled, onClick, type: "button" },
			children,
		),
	Drawer: ({
		children,
		onOpenChangeComplete,
		open,
	}: {
		children: ReactNode;
		onOpenChangeComplete?: (open: boolean) => void;
		open: boolean;
	}) =>
		open
			? createElement(Fragment, null, children)
			: createElement("button", {
					"data-testid": "drawer-close-complete",
					onClick: () => onOpenChangeComplete?.(false),
					type: "button",
				}),
	DrawerContent: ({ children, className }: { children: ReactNode; className?: string }) =>
		createElement("div", { className, "data-testid": "mobile-nav-drawer", role: "dialog" }, children),
	DrawerTitle: ({ children, className }: { children: ReactNode; className?: string }) =>
		createElement("h2", { className }, children),
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		"aria-current": ariaCurrent,
		"aria-label": ariaLabel,
		children,
		className,
		onClick,
		search,
		to,
	}: {
		"aria-current"?: string;
		"aria-label"?: string;
		children: ReactNode;
		className?: string;
		onClick?: () => void;
		search?: unknown;
		to: string;
	}) =>
		createElement(
			"a",
			{
				"aria-current": ariaCurrent,
				"aria-label": ariaLabel,
				className,
				"data-search": search === undefined ? undefined : JSON.stringify(search),
				"data-to": to,
				href: to,
				onClick,
			},
			children,
		),
	useLocation: () => ({ pathname: testState.pathname }),
	useRouter: () => testState.router,
}));

vi.mock("@/components/trade/header/theme-toggle", () => ({
	ThemeToggle: () => createElement("div", { "data-testid": "theme-toggle" }),
}));

vi.mock("@/hooks/trade/use-trade-home-path", () => ({
	useTradeHomePath: () => "/trade/HYPE",
}));

vi.mock("@/hooks/trade/use-deposit-availability", () => ({
	useDepositAvailability: () => ({
		available: testState.depositAvailable,
		path: testState.depositPath,
		unavailableLabel: "Deposit unavailable",
		unavailableReason: testState.depositUnavailableReason,
	}),
}));

vi.mock("@/hooks/use-geo-restriction", () => ({
	useGeoRestriction: () => ({ actionsBlocked: false, tradeRestricted: false }),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ hasWalletAccess: testState.hasWalletAccess, sessionMode: testState.sessionMode }),
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalActions: () => ({ open: testState.depositOpen }),
	useSettingsDialogActions: () => ({ open: testState.settingsOpen }),
}));

vi.mock("@/components/trade/components/lazy-global-modals", () => ({
	depositModalIntentProps: {
		onPointerEnter: testState.warmDepositModal,
		onPointerDown: testState.warmDepositModal,
		onFocus: testState.warmDepositModal,
	},
	preloadGlobalModal: testState.preloadGlobalModal,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("MobileNavDrawer", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		testState.depositOpen.mockReset();
		testState.depositAvailable = true;
		testState.depositPath = "external";
		testState.depositUnavailableReason = null;
		testState.hasWalletAccess = false;
		testState.pathname = "/api-wallet";
		testState.preloadGlobalModal.mockReset();
		testState.warmDepositModal.mockReset();
		testState.preloadGlobalModal.mockResolvedValue(undefined);
		testState.sessionMode = "disconnected";
		testState.settingsOpen.mockReset();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("matches the desktop menu order and keeps available destinations functional", () => {
		act(() => root.render(<MobileNavDrawer />));
		const openButton = container.querySelector<HTMLButtonElement>('button[aria-label="Open navigation"]');
		act(() => openButton?.click());

		const primaryNavigation = container.querySelector<HTMLElement>('nav[aria-label="Primary navigation"]');
		const moreNavigation = container.querySelector<HTMLElement>('nav[aria-label="More"]');
		const primaryItems = [...(primaryNavigation?.querySelectorAll<HTMLElement>(":scope > a, :scope > button") ?? [])];
		const moreItems = [...(moreNavigation?.querySelectorAll<HTMLElement>(":scope > a, :scope > button") ?? [])];
		const itemLabel = (item: HTMLElement) =>
			item instanceof HTMLButtonElement && item.disabled
				? item.querySelector("span")?.textContent?.trim()
				: item.textContent?.trim();

		expect(primaryItems.map(itemLabel)).toEqual([
			"Trade",
			"Portfolio",
			"Earn",
			"Vaults",
			"Staking",
			"Referrals",
			"Leaderboard",
		]);
		expect(moreItems.map(itemLabel)).toEqual(["Funding Comparison", "Statistics", "API Wallet", "Docs", "Support"]);

		const links = [...container.querySelectorAll<HTMLAnchorElement>('[data-testid="mobile-nav-drawer"] nav a')];
		expect(links.map((link) => link.textContent?.trim())).toEqual([
			"Trade",
			"Portfolio",
			"Earn",
			"Vaults",
			"Staking",
			"Referrals",
			"Leaderboard",
			"Funding Comparison",
			"Statistics",
			"API Wallet",
			"Docs",
			"Support",
		]);
		expect(links.map((link) => link.dataset.to)).toEqual([
			"/trade/HYPE",
			"/portfolio",
			"/earn",
			"/vaults",
			"/staking",
			"/referrals",
			"/leaderboard",
			"/fundingComparison",
			undefined,
			"/api-wallet",
			"/docs",
			"/support",
		]);
		const statisticsLink = links.find((link) => link.textContent?.trim() === "Statistics");
		expect(statisticsLink?.href).toBe(HYPERSCREENER_URL);
		expect(statisticsLink?.target).toBe("_blank");
		expect(statisticsLink?.rel).toBe("noopener noreferrer");

		expect(container.querySelectorAll('[data-testid="mobile-nav-drawer"] nav button:disabled')).toHaveLength(0);
		expect(container.querySelector('[data-testid="mobile-nav-drawer"]')?.textContent).not.toContain("Soon");

		const drawerText = container.querySelector('[data-testid="mobile-nav-drawer"]')?.textContent;
		for (const removedLabel of ["Terms", "Privacy Policy", "Risk Disclosure", "Cookie Policy"])
			expect(drawerText).not.toContain(removedLabel);

		const apiWalletLink = links.find((link) => link.textContent?.trim() === "API Wallet");
		expect(apiWalletLink?.dataset.to).toBe("/api-wallet");
		expect(apiWalletLink?.getAttribute("aria-current")).toBe("page");
		expect(apiWalletLink?.className).toContain("bg-fill-hover");
		expect(container.querySelector("h2")?.textContent).toBe("Navigation");
		expect(container.querySelector("h2")?.className).toContain("sr-only");
		expect(container.querySelector('[data-testid="mobile-nav-drawer"]')?.className).toContain(
			"pl-[env(safe-area-inset-left)]",
		);

		act(() => apiWalletLink?.click());
		expect(container.querySelector('[data-testid="mobile-nav-drawer"]')).toBeNull();
	});

	it("separates the More group with a divider instead of visible group headings", () => {
		act(() => root.render(<MobileNavDrawer />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Open navigation"]')?.click());

		const navigations = [...container.querySelectorAll<HTMLElement>('[data-testid="mobile-nav-drawer"] nav')];
		expect(navigations.map((navigation) => navigation.getAttribute("aria-label"))).toEqual([
			"Primary navigation",
			"More",
		]);
		for (const navigation of navigations)
			expect([...navigation.children].every((child) => child instanceof HTMLAnchorElement)).toBe(true);

		const [primaryNavigation, moreNavigation] = navigations;
		expect(primaryNavigation?.classList.contains("border-t")).toBe(false);
		expect(moreNavigation?.classList.contains("border-t")).toBe(true);
		expect(moreNavigation?.classList.contains("border-stroke-weak/60")).toBe(true);
	});

	it("marks Funding Comparison as the current More destination on its route", () => {
		testState.pathname = "/fundingComparison";
		act(() => root.render(<MobileNavDrawer />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Open navigation"]')?.click());

		const moreNavigation = container.querySelector<HTMLElement>('nav[aria-label="More"]');
		const current = [...(moreNavigation?.querySelectorAll<HTMLAnchorElement>('a[aria-current="page"]') ?? [])];
		expect(current.map((link) => link.textContent?.trim())).toEqual(["Funding Comparison"]);
		expect(current[0]?.dataset.to).toBe("/fundingComparison");
		expect(current[0]?.className).toContain("bg-fill-hover");

		act(() => current[0]?.click());
		expect(container.querySelector('[data-testid="mobile-nav-drawer"]')).toBeNull();
	});

	it("gives every destination touch press feedback", () => {
		act(() => root.render(<MobileNavDrawer />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Open navigation"]')?.click());
		const links = [...container.querySelectorAll<HTMLAnchorElement>('[data-testid="mobile-nav-drawer"] nav a')];
		expect(links.length).toBeGreaterThan(0);
		for (const link of links) {
			const pressFeedback = link.getAttribute("aria-current") === "page" ? "active:opacity-60" : "active:bg-fill-weak";
			expect(link.className, link.textContent ?? "").toContain(pressFeedback);
		}
		const current = links.find((link) => link.getAttribute("aria-current") === "page");
		expect(current?.className).toContain("bg-fill-hover");
		expect(current?.className).not.toContain("active:bg-fill-weak");
	});

	it.each([
		["/DOCS/", "Docs"],
		["/Support", "Support"],
		["/Portfolio", "Portfolio"],
		["/fundingcomparison/", "Funding Comparison"],
	])("highlights the destination for the case-insensitive path %s", (pathname, label) => {
		testState.pathname = pathname;
		act(() => root.render(<MobileNavDrawer />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Open navigation"]')?.click());
		const link = [...container.querySelectorAll<HTMLAnchorElement>('[data-testid="mobile-nav-drawer"] nav a')].find(
			(item) => item.textContent?.trim() === label,
		);
		expect(link?.getAttribute("aria-current")).toBe("page");
		expect(link?.className).toContain("text-action");
	});

	it("keeps the drawer visible while Settings loads and opens it only after the drawer closes", async () => {
		let resolvePreload: (() => void) | undefined;
		testState.preloadGlobalModal.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					resolvePreload = resolve;
				}),
		);
		act(() => root.render(<MobileNavDrawer />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Open navigation"]')?.click());

		const settingsButton = container.querySelector<HTMLButtonElement>('button[aria-label="Settings"]');
		act(() => settingsButton?.click());

		expect(testState.preloadGlobalModal).toHaveBeenCalledWith("settings");
		expect(container.querySelector('[data-testid="mobile-nav-drawer"]')).not.toBeNull();
		expect(settingsButton?.disabled).toBe(true);
		expect(settingsButton?.getAttribute("aria-busy")).toBe("true");
		expect(testState.settingsOpen).not.toHaveBeenCalled();

		await act(async () => {
			resolvePreload?.();
			await Promise.resolve();
		});

		expect(container.querySelector('[data-testid="mobile-nav-drawer"]')).toBeNull();
		expect(testState.settingsOpen).not.toHaveBeenCalled();
		act(() => container.querySelector<HTMLButtonElement>('[data-testid="drawer-close-complete"]')?.click());
		expect(testState.settingsOpen).toHaveBeenCalledOnce();
		expect(testState.depositOpen).not.toHaveBeenCalled();
	});

	it("cancels a pending modal when the user closes the drawer", async () => {
		let resolvePreload: (() => void) | undefined;
		testState.preloadGlobalModal.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					resolvePreload = resolve;
				}),
		);
		act(() => root.render(<MobileNavDrawer />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Open navigation"]')?.click());
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Settings"]')?.click());
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Close navigation"]')?.click());

		await act(async () => {
			resolvePreload?.();
			await Promise.resolve();
		});
		act(() => container.querySelector<HTMLButtonElement>('[data-testid="drawer-close-complete"]')?.click());

		expect(testState.settingsOpen).not.toHaveBeenCalled();
		expect(testState.depositOpen).not.toHaveBeenCalled();
	});

	it("preloads Deposit through the shared modal registry", async () => {
		testState.hasWalletAccess = true;
		act(() => root.render(<MobileNavDrawer />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Open navigation"]')?.click());
		const depositButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Deposit",
		);
		expect(testState.warmDepositModal).not.toHaveBeenCalled();
		act(() => {
			depositButton?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
		});
		expect(testState.warmDepositModal).toHaveBeenCalledOnce();
		await act(async () => depositButton?.click());

		expect(testState.preloadGlobalModal).toHaveBeenCalledWith("deposit");
		expect(testState.depositOpen).not.toHaveBeenCalled();
		act(() => container.querySelector<HTMLButtonElement>('[data-testid="drawer-close-complete"]')?.click());
		expect(testState.depositOpen).toHaveBeenCalledWith("deposit");
		expect(testState.settingsOpen).not.toHaveBeenCalled();
	});

	it("shows a disabled Deposit entry with the desktop reason in an agent-only session", async () => {
		const reason =
			"This phone uses a desktop-approved trading key. Deposits, withdrawals and transfers need the master wallet on desktop.";
		testState.hasWalletAccess = false;
		testState.sessionMode = "agent-only";
		testState.depositAvailable = false;
		testState.depositUnavailableReason = reason;
		act(() => root.render(<MobileNavDrawer />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Open navigation"]')?.click());

		const depositButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(button) => button.textContent === "Deposit",
		);
		expect(depositButton).toBeDefined();
		expect(depositButton?.disabled).toBe(true);
		expect(container.querySelector("output")?.textContent).toBe(reason);
		await act(async () => depositButton?.click());
		expect(testState.preloadGlobalModal).not.toHaveBeenCalled();
		expect(testState.depositOpen).not.toHaveBeenCalled();
	});

	it("hides the Deposit entry for a disconnected external session", () => {
		testState.hasWalletAccess = false;
		testState.sessionMode = "disconnected";
		act(() => root.render(<MobileNavDrawer />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Open navigation"]')?.click());

		expect(
			Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
				(button) => button.textContent === "Deposit",
			),
		).toBeUndefined();
	});

	it("does not preload an unavailable Deposit path and shows its reason", async () => {
		testState.hasWalletAccess = true;
		testState.depositAvailable = false;
		testState.depositUnavailableReason = "Deposits from external wallets are not enabled on Mainnet.";
		act(() => root.render(<MobileNavDrawer />));
		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Open navigation"]')?.click());

		const depositButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(button) => button.textContent === "Deposit",
		);
		expect(depositButton?.disabled).toBe(true);
		expect(container.textContent).toContain("Deposits from external wallets are not enabled on Mainnet.");
		await act(async () => depositButton?.click());
		expect(testState.preloadGlobalModal).not.toHaveBeenCalled();
		expect(testState.depositOpen).not.toHaveBeenCalled();
	});
});
