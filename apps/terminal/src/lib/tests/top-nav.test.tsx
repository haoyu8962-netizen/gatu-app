// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { act, cloneElement, createElement, isValidElement, type ReactNode, useEffect, useState } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TopNav, type TopNavMode } from "@/components/trade/header/top-nav";
import { DESKTOP_NAV_ITEMS, DESKTOP_NAV_LABELS } from "@/config/desktop-nav";
import { DESKTOP_NAV_COMPACT_MAX_PX, DESKTOP_NAV_NARROW_MAX_PX } from "@/config/layout";
import { HYPERSCREENER_URL } from "@/config/nav";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	hasWalletAccess: true,
	authenticated: true,
	isConnected: true,
	depositAvailable: true,
	depositPath: "external" as "external" | "sponsored",
	depositUnavailableReason: null as string | null,
	isTestnet: false,
	mobilePairingCreateAndReveal: true,
	navigate: vi.fn(),
	openDepositModal: vi.fn(),
	openMobileSyncModal: vi.fn(),
	preloadMobileSyncModal: vi.fn(),
	openSettingsDialog: vi.fn(),
	pathname: "/trade/HYPE",
	privyPopupOpen: false,
	tradeHomePath: "/trade/HYPE",
	tradeRestricted: false,
	userMenuMounts: 0,
	userMenuUnmounts: 0,
}));

vi.mock("@sairn/ui", () => ({
	Button: ({
		"aria-label": ariaLabel,
		children,
		className,
		disabled,
		iconLeft,
		onClick,
		title,
	}: {
		"aria-label"?: string;
		children: ReactNode;
		className?: string;
		disabled?: boolean;
		iconLeft?: ReactNode;
		onClick?: () => void;
		title?: string;
	}) =>
		createElement(
			"button",
			{ "aria-label": ariaLabel, className, disabled, onClick, title, type: "button" },
			iconLeft,
			children,
		),
	ButtonIcon: ({
		"aria-label": ariaLabel,
		children,
		className,
		disabled,
		onClick,
	}: {
		"aria-label"?: string;
		children: ReactNode;
		className?: string;
		disabled?: boolean;
		onClick?: () => void;
	}) => createElement("button", { "aria-label": ariaLabel, className, disabled, onClick, type: "button" }, children),
	Divider: () => createElement("hr"),
	Dropdown: ({
		className,
		items = [],
		trigger,
		renderTrigger,
		triggerAriaLabel,
	}: {
		className?: string;
		items?: Array<{
			active?: boolean;
			disabled?: boolean;
			href?: string;
			label: string;
			onSelect?: () => void;
			rel?: string;
			target?: string;
		}>;
		trigger?: ReactNode;
		renderTrigger?: ReactNode;
		triggerAriaLabel?: string;
	}) =>
		createElement(
			"div",
			{
				className,
				"data-testid": "more-dropdown",
			},
			(isValidElement<Record<string, unknown>>(renderTrigger)
				? cloneElement(renderTrigger, { "aria-label": triggerAriaLabel })
				: null) ?? createElement("button", { "aria-label": triggerAriaLabel, type: "button" }, trigger),
			createElement(
				"div",
				{ role: "menu" },
				items.map((item) =>
					item.href
						? createElement(
								"a",
								{
									"aria-current": item.active ? "true" : undefined,
									href: item.href,
									key: item.label,
									onClick: item.onSelect,
									rel: item.rel,
									role: "menuitem",
									target: item.target,
								},
								item.label,
							)
						: createElement(
								"button",
								{
									"aria-current": item.active ? "true" : undefined,
									disabled: item.disabled,
									key: item.label,
									onClick: item.onSelect,
									role: "menuitem",
									type: "button",
								},
								item.label,
							),
				),
			),
		),
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		"aria-current": ariaCurrent,
		"aria-label": ariaLabel,
		"data-brand-home-link": brandHomeLink,
		children,
		className,
		search,
		to,
	}: {
		"aria-current"?: string;
		"aria-label"?: string;
		"data-brand-home-link"?: string;
		children: ReactNode;
		className?: string;
		search?: unknown;
		to: string;
	}) =>
		createElement(
			"a",
			{
				"aria-current": ariaCurrent,
				"aria-label": ariaLabel,
				className,
				"data-brand-home-link": brandHomeLink,
				"data-search": search === undefined ? undefined : JSON.stringify(search),
				"data-to": to,
				href: to,
			},
			children,
		),
	useLocation: () => ({ pathname: testState.pathname }),
	useNavigate: () => testState.navigate,
}));

vi.mock("@/components/trade/header/language-switcher", () => ({
	LanguageSwitcher: () => createElement("div", { "data-testid": "language-switcher" }),
}));

vi.mock("@/components/trade/header/theme-toggle", () => ({
	ThemeToggle: () => createElement("div", { "data-testid": "theme-toggle" }),
}));

vi.mock("@/config/mobile-pairing", () => ({
	MOBILE_PAIRING_FEATURES: {
		get enabled() {
			return testState.mobilePairingCreateAndReveal;
		},
	},
}));

vi.mock("@/components/trade/header/mobile-agent-sync-modal-loader", () => ({
	getMobileAgentSyncModalComponent: () => () => null,
	preloadMobileAgentSyncModal: () => testState.preloadMobileSyncModal(),
	resetMobileAgentSyncModalComponent: () => () => null,
}));

vi.mock("@/hooks/trade/use-trade-home-path", () => ({
	useTradeHomePath: () => testState.tradeHomePath,
}));

vi.mock("@/hooks/trade/use-deposit-availability", () => ({
	useDepositAvailability: () => ({
		available: testState.depositAvailable && !testState.tradeRestricted,
		path: testState.depositPath,
		unavailableLabel: "Deposit unavailable",
		unavailableReason: testState.tradeRestricted
			? "Deposits are not available in your region."
			: testState.depositUnavailableReason,
	}),
}));

vi.mock("@/hooks/use-geo-restriction", () => ({
	useGeoRestriction: () => ({ actionsBlocked: testState.tradeRestricted, tradeRestricted: testState.tradeRestricted }),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		hasWalletAccess: testState.hasWalletAccess,
		authenticated: testState.authenticated,
		isConnected: testState.isConnected,
	}),
}));

vi.mock("@/lib/lazy", () => ({
	createLazyComponent: (_loader: unknown, exportName: string) => {
		if (exportName !== "UserMenu") {
			return () => createElement("div", { "data-testid": exportName });
		}

		return function StatefulUserMenuProbe() {
			const [privyPopupOpen, setPrivyPopupOpen] = useState(false);

			useEffect(() => {
				testState.userMenuMounts += 1;
				return () => {
					testState.userMenuUnmounts += 1;
				};
			}, []);

			testState.privyPopupOpen = privyPopupOpen;
			return createElement(
				"div",
				{ "data-testid": "UserMenu" },
				createElement(
					"button",
					{ "aria-label": "Open Privy", onClick: () => setPrivyPopupOpen(true), type: "button" },
					"Connect Wallet",
				),
				privyPopupOpen ? createElement("div", { "data-testid": "privy-popup" }, "Privy") : null,
			);
		};
	},
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalActions: () => ({ open: testState.openDepositModal }),
	useMobileSyncModalActions: () => ({ open: testState.openMobileSyncModal }),
	useSettingsDialogActions: () => ({ open: testState.openSettingsDialog }),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	useIsTestnet: () => testState.isTestnet,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("TopNav", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.clearAllMocks();
		i18n.loadAndActivate({ locale: "en", messages: {} });
		testState.hasWalletAccess = true;
		testState.authenticated = true;
		testState.isConnected = true;
		testState.depositAvailable = true;
		testState.depositPath = "external";
		testState.depositUnavailableReason = null;
		testState.isTestnet = false;
		testState.mobilePairingCreateAndReveal = true;
		testState.pathname = "/trade/HYPE";
		testState.privyPopupOpen = false;
		testState.tradeHomePath = "/trade/HYPE";
		testState.tradeRestricted = false;
		testState.userMenuMounts = 0;
		testState.userMenuUnmounts = 0;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderNav(mode?: TopNavMode) {
		act(() => root.render(<TopNav mode={mode} />));
	}

	function findButton(label: string) {
		return [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === label,
		);
	}

	function findLink(label: string) {
		return [...container.querySelectorAll<HTMLAnchorElement>("a")].find((link) => link.textContent?.trim() === label);
	}

	function stubViewportWidth(width: number) {
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			writable: true,
			value: (query: string) => {
				const maxWidth = /max-width:\s*(\d+)px/.exec(query);
				return {
					matches: maxWidth ? width <= Number(maxWidth[1]) : false,
					media: query,
					addEventListener() {},
					removeEventListener() {},
				};
			},
		});
	}

	function moreMenuLabels() {
		return [...container.querySelectorAll<HTMLElement>('[data-testid="more-dropdown"] [role="menuitem"]')].map((item) =>
			item.textContent?.trim(),
		);
	}

	function topLevelLabels() {
		const primaryNavigation = container.querySelector<HTMLElement>('nav[aria-label="Primary navigation"]');
		return [...(primaryNavigation?.querySelectorAll<HTMLElement>(":scope > a, :scope > button") ?? [])].map((item) =>
			item.textContent?.replace(/\s+/g, " ").trim(),
		);
	}

	function findDesktopUtilitiesButton() {
		return container.querySelector<HTMLButtonElement>('button[aria-label="Display and language"]') ?? undefined;
	}

	function findLinkMobileIcon() {
		return container.querySelector<HTMLButtonElement>('button[aria-label="Link mobile device"]') ?? undefined;
	}

	it.each([
		["/trade/HYPE", "Trade"],
		["/perp/BTC", "Trade"],
		["/portfolio", "Portfolio"],
		["/referrals", "Referrals"],
		["/api-wallet", "API Wallet"],
		["/fundingComparison", "Funding Comparison"],
		["/vaults", "Vaults"],
		["/vaults/0x123", "Vaults"],
		["/staking", "Staking"],
		["/leaderboard", "Leaderboard"],
		["/docs", null],
		["/support", null],
		["/terms", null],
		["/privacy", null],
		["/risk", null],
		["/portfolio/history", null],
		["/trader", null],
	] as const)("derives the current destination from the real route %s", (pathname, currentLabel) => {
		testState.pathname = pathname;
		renderNav();

		const currentLinks = [...container.querySelectorAll<HTMLElement>('a[aria-current="page"]')];
		const currentMoreItems = [...container.querySelectorAll<HTMLElement>('[role="menuitem"][aria-current="true"]')];
		const currentDestinations = [
			...new Set([...currentLinks, ...currentMoreItems].map((item) => item.textContent?.trim())),
		];

		expect(currentDestinations).toEqual(currentLabel === null ? [] : [currentLabel]);
	});

	it("omits documentation, support, and legal destinations from desktop More menus", () => {
		renderNav();
		const removedLabels = ["Docs", "Support", "Terms", "Privacy Policy", "Risk Disclosure"];

		for (const menu of container.querySelectorAll<HTMLElement>('[data-testid="more-dropdown"]')) {
			const labels = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((item) =>
				item.textContent?.trim(),
			);
			for (const label of removedLabels) expect(labels).not.toContain(label);
		}
		expect(testState.navigate).not.toHaveBeenCalled();
	});

	it("links the approved primary routes including Earn", () => {
		renderNav();
		const primaryNavigation = container.querySelector<HTMLElement>('nav[aria-label="Primary navigation"]');
		const primaryEntries = [...(primaryNavigation?.querySelectorAll<HTMLElement>(":scope > a, :scope > button") ?? [])];

		expect(primaryEntries.map((item) => item.textContent?.replace(/\s+/g, " ").trim())).toEqual([
			"Trade",
			"Portfolio",
			"Earn",
			"Vaults",
			"Staking",
			"Referrals",
			"Leaderboard",
		]);

		expect(findLink("Earn")?.dataset.to).toBe("/earn");
		expect(findLink("Vaults")?.dataset.to).toBe("/vaults");
		expect(findLink("Staking")?.dataset.to).toBe("/staking");
		expect(findLink("Leaderboard")?.dataset.to).toBe("/leaderboard");
		expect(findLink("Referrals")?.dataset.to).toBe("/referrals");
	});

	it("links Statistics externally while keeping Funding Comparison and API Wallet on the app router", () => {
		renderNav();
		expect(container.querySelectorAll('[data-testid="more-dropdown"]')).toHaveLength(1);
		const statisticsItem = [
			...container.querySelectorAll<HTMLAnchorElement>('[data-testid="more-dropdown"] a[role="menuitem"]'),
		].find((item) => item.textContent?.trim() === "Statistics");
		expect(statisticsItem?.href).toBe(HYPERSCREENER_URL);
		expect(statisticsItem?.target).toBe("_blank");
		expect(statisticsItem?.rel).toBe("noopener noreferrer");
		statisticsItem?.addEventListener("click", (event) => event.preventDefault(), { once: true });
		act(() => statisticsItem?.click());
		expect(testState.navigate).not.toHaveBeenCalled();

		const apiWalletItem = [
			...container.querySelectorAll<HTMLElement>('[data-testid="more-dropdown"] [role="menuitem"]'),
		].find(
			(item): item is HTMLButtonElement =>
				item instanceof HTMLButtonElement && item.textContent?.trim() === "API Wallet",
		);
		expect(apiWalletItem?.disabled).toBe(false);
		act(() => apiWalletItem?.click());
		expect(testState.navigate).toHaveBeenLastCalledWith({ to: "/api-wallet" });

		const fundingComparisonItem = [
			...container.querySelectorAll<HTMLElement>('[data-testid="more-dropdown"] [role="menuitem"]'),
		].find(
			(item): item is HTMLButtonElement =>
				item instanceof HTMLButtonElement && item.textContent?.trim() === "Funding Comparison",
		);
		expect(fundingComparisonItem?.disabled).toBe(false);
		act(() => fundingComparisonItem?.click());
		expect(testState.navigate).toHaveBeenLastCalledWith({ to: "/fundingComparison" });
	});

	it("collapses navigation entries by header width and wallet state", () => {
		try {
			stubViewportWidth(1440);
			renderNav();
			expect(topLevelLabels()).toEqual(["Trade", "Portfolio", "Earn", "Vaults", "Staking", "Referrals", "Leaderboard"]);
			expect(moreMenuLabels()).toEqual(["Funding Comparison", "Statistics", "API Wallet"]);

			stubViewportWidth(DESKTOP_NAV_COMPACT_MAX_PX + 1);
			renderNav();
			expect(topLevelLabels()).toEqual(["Trade", "Portfolio", "Earn", "Vaults", "Staking", "Referrals", "Leaderboard"]);

			stubViewportWidth(DESKTOP_NAV_COMPACT_MAX_PX);
			renderNav();
			expect(topLevelLabels()).toEqual(["Trade", "Portfolio", "Earn"]);
			expect(moreMenuLabels()).toEqual([
				"Vaults",
				"Staking",
				"Referrals",
				"Leaderboard",
				"Funding Comparison",
				"Statistics",
				"API Wallet",
			]);
			const menuItems = [...container.querySelectorAll<HTMLElement>('[data-testid="more-dropdown"] [role="menuitem"]')];
			const referralsItem = menuItems.find((item) => item.textContent?.trim() === "Referrals");
			act(() => referralsItem?.click());
			expect(testState.navigate).toHaveBeenLastCalledWith({ to: "/referrals" });

			testState.hasWalletAccess = false;
			testState.authenticated = false;
			testState.isConnected = true;
			renderNav();
			expect(topLevelLabels()).toEqual(["Trade", "Portfolio", "Earn"]);
			expect(findDesktopUtilitiesButton()).not.toBeUndefined();

			testState.isConnected = false;
			renderNav();
			expect(topLevelLabels()).toEqual(["Trade", "Portfolio", "Earn", "Vaults", "Staking", "Referrals", "Leaderboard"]);
			expect(moreMenuLabels()).toEqual(["Funding Comparison", "Statistics", "API Wallet"]);
			expect(findDesktopUtilitiesButton()).toBeUndefined();

			stubViewportWidth(DESKTOP_NAV_NARROW_MAX_PX);
			renderNav();
			expect(topLevelLabels()).toEqual(["Trade", "Portfolio", "Earn"]);
			expect(moreMenuLabels()).toEqual([
				"Vaults",
				"Staking",
				"Referrals",
				"Leaderboard",
				"Funding Comparison",
				"Statistics",
				"API Wallet",
			]);
		} finally {
			Reflect.deleteProperty(window, "matchMedia");
		}
	});

	it("keeps the compact utilities menu and hidden utility icons consistent while the market loads", () => {
		try {
			stubViewportWidth(DESKTOP_NAV_COMPACT_MAX_PX);
			renderNav("market-loading");
			const utilities = findDesktopUtilitiesButton();
			expect(utilities?.disabled).toBe(false);
			const hiddenGroup = container.querySelector('[data-testid="theme-toggle"]')?.parentElement;
			expect(hiddenGroup?.className).toContain("nav-compact:hidden");
			act(() => utilities?.click());
			expect(testState.openSettingsDialog).not.toHaveBeenCalled();
		} finally {
			Reflect.deleteProperty(window, "matchMedia");
		}
	});

	it("highlights More when a collapsed entry is the current route", () => {
		try {
			stubViewportWidth(DESKTOP_NAV_COMPACT_MAX_PX);
			testState.pathname = "/vaults/0x123";
			renderNav();
			const trigger = container.querySelector<HTMLElement>('[data-testid="more-dropdown"] button[aria-label="More"]');
			expect(trigger?.className).toContain("text-market-close-fg");
			expect(
				[...container.querySelectorAll<HTMLElement>('[role="menuitem"][aria-current="true"]')].map((item) =>
					item.textContent?.trim(),
				),
			).toEqual(["Vaults"]);
		} finally {
			Reflect.deleteProperty(window, "matchMedia");
		}
	});

	it("uses the selected all-scope market for both logo and Trade links", () => {
		testState.tradeHomePath = "/spot/@107";
		renderNav();

		const logoLink = container.querySelector<HTMLAnchorElement>("a[data-brand-home-link]");
		const tradeLink = findLink("Trade");
		expect(logoLink?.getAttribute("aria-label")).toBe("Sairn");
		for (const link of [logoLink, tradeLink]) {
			expect(link?.dataset.to).toBe("/spot/@107");
			expect(JSON.parse(link?.dataset.search ?? "null")).toEqual({ scope: "all" });
		}
	});

	it("opens the deposit flow only for unrestricted wallet sessions", () => {
		renderNav();
		act(() => findButton("Deposit")?.click());
		expect(testState.openDepositModal).toHaveBeenCalledOnce();
		expect(testState.openDepositModal).toHaveBeenCalledWith("deposit");
		expect(findButton("Deposit")?.querySelector("span")?.className).toBe("nav-compact:sr-only");

		testState.hasWalletAccess = false;
		renderNav();
		expect(findButton("Deposit")).toBeUndefined();

		testState.hasWalletAccess = true;
		testState.tradeRestricted = true;
		renderNav();
		const restrictedDeposit = findButton("Deposit unavailable");
		expect(restrictedDeposit?.disabled).toBe(true);
		expect(restrictedDeposit?.getAttribute("aria-label")).toBe("Deposit unavailable");
		expect(restrictedDeposit?.title).toBe("Deposits are not available in your region.");
		expect(restrictedDeposit?.className).toContain("size-9");
		expect(restrictedDeposit?.className).not.toContain("px-3.5");
		expect(restrictedDeposit?.querySelector("span.sr-only")?.textContent).toBe("Deposit unavailable");
		act(() => restrictedDeposit?.click());
		expect(testState.openDepositModal).toHaveBeenCalledTimes(1);
	});

	it("shows an email Deposit entry before its embedded signer is active", () => {
		testState.hasWalletAccess = false;
		testState.depositPath = "sponsored";
		renderNav();

		act(() => findButton("Deposit")?.click());
		expect(testState.openDepositModal).toHaveBeenCalledWith("deposit");
	});

	it("keeps public navigation usable while disabling modal-backed controls during market loading", () => {
		renderNav("market-loading");

		const depositButton = findButton("Deposit");
		const settingsButton = container.querySelector<HTMLButtonElement>('button[aria-label="Settings"]');
		const desktopUtilitiesButton = findDesktopUtilitiesButton();
		expect(depositButton?.disabled).toBe(true);
		expect(settingsButton?.disabled).toBe(true);
		expect(desktopUtilitiesButton?.disabled).toBe(false);
		expect(desktopUtilitiesButton?.parentElement?.className).toContain("nav-compact:inline-flex");

		act(() => {
			depositButton?.focus();
			settingsButton?.focus();
			desktopUtilitiesButton?.focus();
			depositButton?.click();
			settingsButton?.click();
			desktopUtilitiesButton?.click();
		});
		expect(document.activeElement).not.toBe(depositButton);
		expect(document.activeElement).not.toBe(settingsButton);
		expect(testState.openDepositModal).not.toHaveBeenCalled();
		expect(testState.openSettingsDialog).not.toHaveBeenCalled();

		expect(container.querySelector<HTMLAnchorElement>("a[data-brand-home-link]")).not.toBeNull();
		expect(findLink("Trade")).not.toBeUndefined();
		const moreTriggers = container.querySelectorAll<HTMLButtonElement>('[data-testid="more-dropdown"] > button');
		expect(moreTriggers).toHaveLength(1);
		for (const trigger of moreTriggers) expect(trigger.disabled).toBe(false);
		expect(container.querySelector('[data-testid="theme-toggle"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="language-switcher"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="UserMenu"]')).not.toBeNull();
	});

	it("preserves the lazy UserMenu and its open Privy popup when market loading becomes ready", () => {
		renderNav("market-loading");
		expect(testState.userMenuMounts).toBe(1);
		expect(testState.userMenuUnmounts).toBe(0);

		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Open Privy"]')?.click());
		expect(testState.privyPopupOpen).toBe(true);
		expect(container.querySelector('[data-testid="privy-popup"]')).not.toBeNull();

		renderNav();
		expect(testState.userMenuMounts).toBe(1);
		expect(testState.userMenuUnmounts).toBe(0);
		expect(testState.privyPopupOpen).toBe(true);
		expect(container.querySelector('[data-testid="privy-popup"]')).not.toBeNull();
	});

	it("updates shared nav descriptors without remounting navigation or wallet controls", () => {
		renderNav();
		const trade = findLink("Trade");
		const navigation = container.querySelector("nav");
		const wallet = container.querySelector('[data-testid="UserMenu"]');
		act(() =>
			i18n.loadAndActivate({
				locale: "zh",
				messages: {
					[DESKTOP_NAV_ITEMS[0].label.id ?? ""]: "交易",
					[DESKTOP_NAV_ITEMS[2].label.id ?? ""]: "收益",
					[DESKTOP_NAV_LABELS.primary.id ?? ""]: "主导航",
				},
			}),
		);
		expect(findLink("交易")).toBe(trade);
		expect(findLink("收益")?.dataset.to).toBe("/earn");
		expect(navigation?.getAttribute("aria-label")).toBe("主导航");
		expect(container.querySelector('[data-testid="UserMenu"]')).toBe(wallet);
		act(() => i18n.activate("en"));
		expect(findLink("Trade")).toBe(trade);
	});

	it("shows the Link mobile device icon only for wallet sessions with pairing enabled", async () => {
		testState.preloadMobileSyncModal.mockResolvedValue(undefined);
		renderNav();
		const icon = findLinkMobileIcon();
		expect(icon?.disabled).toBe(false);
		expect(icon?.parentElement?.className).not.toContain("nav-compact:hidden");
		expect(icon?.closest(".nav-compact\\:hidden")).toBeNull();

		act(() => {
			icon?.dispatchEvent(new Event("pointerover", { bubbles: true }));
		});
		expect(testState.preloadMobileSyncModal).toHaveBeenCalledTimes(1);
		expect(testState.openMobileSyncModal).not.toHaveBeenCalled();

		await act(async () => {
			icon?.click();
		});
		expect(testState.preloadMobileSyncModal).toHaveBeenCalledTimes(2);
		expect(testState.openMobileSyncModal).toHaveBeenCalledOnce();
		expect(testState.openSettingsDialog).not.toHaveBeenCalled();

		testState.hasWalletAccess = false;
		renderNav();
		expect(findLinkMobileIcon()).toBeUndefined();

		testState.hasWalletAccess = true;
		testState.mobilePairingCreateAndReveal = false;
		renderNav();
		expect(findLinkMobileIcon()).toBeUndefined();
		expect(container.querySelector('button[aria-label="Settings"]')).not.toBeNull();
	});

	it("disables the Link mobile device icon with the settings icon while the market loads", async () => {
		renderNav("market-loading");
		const icon = findLinkMobileIcon();
		expect(icon?.disabled).toBe(true);
		await act(async () => {
			icon?.dispatchEvent(new Event("pointerover", { bubbles: true }));
			icon?.focus();
			icon?.click();
		});
		expect(document.activeElement).not.toBe(icon);
		expect(testState.preloadMobileSyncModal).not.toHaveBeenCalled();
		expect(testState.openMobileSyncModal).not.toHaveBeenCalled();
	});

	it("keeps account, theme, language, and settings controls mounted", () => {
		renderNav();

		expect(container.querySelector('[data-testid="UserMenu"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="theme-toggle"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="language-switcher"]')).not.toBeNull();
		const settingsButton = container.querySelector<HTMLButtonElement>('button[aria-label="Settings"]');
		expect(settingsButton).not.toBeNull();
		expect(settingsButton?.disabled).toBe(false);
		expect(findDesktopUtilitiesButton()?.disabled).toBe(false);

		act(() => settingsButton?.click());
		expect(testState.openSettingsDialog).toHaveBeenCalledOnce();
	});
	it("renders persisted Chinese from the first chrome render through market readiness", () => {
		i18n.loadAndActivate({
			locale: "zh",
			messages: {
				...Object.fromEntries(
					DESKTOP_NAV_ITEMS.map((item, index) => [
						item.label.id,
						["交易", "投资组合", "收益", "金库", "质押", "推荐", "排行榜"][index],
					]),
				),
				[DESKTOP_NAV_LABELS.primary.id]: "主导航",
				[DESKTOP_NAV_LABELS.more.id]: "更多",
				[DESKTOP_NAV_LABELS.soon.id]: "即将推出",
				...Object.fromEntries(
					[
						["Funding Comparison", "资金费率对比"],
						["Statistics", "统计"],
						["API Wallet", "API 钱包"],
					].map(([message, translation]) => [
						createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6),
						translation,
					]),
				),
			},
		});
		renderNav("market-loading");
		const header = container.querySelector("header");
		const nav = container.querySelector("nav");
		expect(nav?.textContent).toContain("交易");
		expect(nav?.textContent).not.toMatch(
			/Trade|Portfolio|Earn|Vaults|Staking|Referrals|Leaderboard|More|Funding Comparison|Statistics|API Wallet/,
		);
		expect(nav?.textContent).not.toContain("Portfolio");
		renderNav();
		expect(container.querySelector("header")).toBe(header);
		expect(container.querySelector("nav")).toBe(nav);
		expect(nav?.textContent).not.toMatch(
			/Trade|Portfolio|Earn|Vaults|Staking|Referrals|Leaderboard|More|Funding Comparison|Statistics|API Wallet/,
		);
		expect(container.textContent).not.toContain("Loading");
	});
});
