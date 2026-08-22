// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act, createElement, type ReactNode, useEffect, useState } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TopNav, type TopNavMode } from "@/components/trade/header/top-nav";
import { HYPERSCREENER_URL } from "@/config/nav";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	hasWalletAccess: true,
	depositAvailable: true,
	depositPath: "external" as "external" | "sponsored",
	depositUnavailableReason: null as string | null,
	isTestnet: false,
	navigate: vi.fn(),
	openDepositModal: vi.fn(),
	openSettingsDialog: vi.fn(),
	pathname: "/trade/HYPE",
	privyPopupOpen: false,
	tradeHomePath: "/trade/HYPE",
	tradeRestricted: false,
	userMenuMounts: 0,
	userMenuUnmounts: 0,
}));

vi.mock("@gatu/ui", () => ({
	Button: ({
		"aria-label": ariaLabel,
		children,
		disabled,
		iconLeft,
		onClick,
		title,
	}: {
		"aria-label"?: string;
		children: ReactNode;
		disabled?: boolean;
		iconLeft?: ReactNode;
		onClick?: () => void;
		title?: string;
	}) =>
		createElement("button", { "aria-label": ariaLabel, disabled, onClick, title, type: "button" }, iconLeft, children),
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
		triggerAriaLabel?: string;
	}) =>
		createElement(
			"div",
			{
				"data-layout": className?.includes("max-[1181px]:hidden") ? "wide" : "compact",
				"data-testid": "more-dropdown",
			},
			createElement("button", { "aria-label": triggerAriaLabel, type: "button" }, trigger),
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
		children,
		className,
		search,
		to,
	}: {
		"aria-current"?: string;
		"aria-label"?: string;
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
	useWalletSession: () => ({ hasWalletAccess: testState.hasWalletAccess }),
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
		testState.depositAvailable = true;
		testState.depositPath = "external";
		testState.depositUnavailableReason = null;
		testState.isTestnet = false;
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

	function findDesktopUtilitiesButton() {
		return [...container.querySelectorAll<HTMLButtonElement>('button[aria-label="More"]')].find((button) =>
			button.className.includes("max-[1181px]:inline-flex"),
		);
	}

	it.each([
		["/trade/HYPE", "Trade"],
		["/perp/BTC", "Trade"],
		["/portfolio", "Portfolio"],
		["/referrals", "Referrals"],
		["/api-wallet", "API Wallet"],
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

	it("links the approved primary routes and keeps Earn unavailable", () => {
		renderNav();
		const primaryNavigation = container.querySelector<HTMLElement>('nav[aria-label="Primary navigation"]');
		const primaryEntries = [...(primaryNavigation?.querySelectorAll<HTMLElement>(":scope > a, :scope > button") ?? [])];

		expect(primaryEntries.map((item) => item.textContent?.replace(/\s+/g, " ").trim())).toEqual([
			"Trade",
			"Portfolio",
			"Earn — Soon",
			"Vaults",
			"Staking",
			"Referrals",
			"Leaderboard",
		]);

		const earnButton = primaryEntries.find((item) => item.textContent?.startsWith("Earn"));
		expect(earnButton).toBeInstanceOf(HTMLButtonElement);
		expect((earnButton as HTMLButtonElement).disabled).toBe(true);
		expect(earnButton?.title).toBe("Soon");
		expect(findLink("Vaults")?.dataset.to).toBe("/vaults");
		expect(findLink("Staking")?.dataset.to).toBe("/staking");
		expect(findLink("Leaderboard")?.dataset.to).toBe("/leaderboard");
		expect(findLink("Referrals")?.dataset.to).toBe("/referrals");
	});

	it("links Statistics externally while keeping API Wallet on the app router", () => {
		renderNav();
		for (const layout of ["wide", "compact"]) {
			const statisticsItem = [...container.querySelectorAll<HTMLAnchorElement>(`[data-layout="${layout}"] a`)].find(
				(item) => item.textContent?.trim() === "Statistics",
			);
			expect(statisticsItem?.href).toBe(HYPERSCREENER_URL);
			expect(statisticsItem?.target).toBe("_blank");
			expect(statisticsItem?.rel).toBe("noopener noreferrer");
			statisticsItem?.addEventListener("click", (event) => event.preventDefault(), { once: true });
			act(() => statisticsItem?.click());
		}
		expect(testState.navigate).not.toHaveBeenCalled();

		const wideMenuItems = [
			...(container.querySelector('[data-layout="wide"]')?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
		];
		const apiWalletItem = wideMenuItems.find(
			(item): item is HTMLButtonElement =>
				item instanceof HTMLButtonElement && item.textContent?.trim() === "API Wallet",
		);
		expect(apiWalletItem?.disabled).toBe(false);
		act(() => apiWalletItem?.click());
		expect(testState.navigate).toHaveBeenLastCalledWith({ to: "/api-wallet" });
	});

	it("moves lower-priority entries into More for each compact wallet state", () => {
		renderNav();

		function compactMenuLabels() {
			return [
				...(container.querySelector('[data-layout="compact"]')?.querySelectorAll<HTMLElement>('[role="menuitem"]') ??
					[]),
			].map((item) => item.textContent?.trim());
		}

		expect(compactMenuLabels()).toEqual(["Vaults", "Staking", "Referrals", "Leaderboard", "Statistics", "API Wallet"]);
		expect(findLink("Referrals")?.className).toContain("max-[1181px]:hidden");
		const compactReferralsItem = [
			...(container
				.querySelector('[data-layout="compact"]')
				?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []),
		].find((item) => item.textContent?.trim() === "Referrals");
		act(() => compactReferralsItem?.click());
		expect(testState.navigate).toHaveBeenLastCalledWith({ to: "/referrals" });

		testState.hasWalletAccess = false;
		renderNav();
		expect(compactMenuLabels()).toEqual(["Vaults", "Staking", "Referrals", "Leaderboard", "Statistics", "API Wallet"]);
	});

	it("uses the selected all-scope market for both logo and Trade links", () => {
		testState.tradeHomePath = "/spot/@107";
		renderNav();

		const logoLink = container.querySelector<HTMLAnchorElement>('a[aria-label="gatu"]');
		const tradeLink = findLink("Trade");
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
		expect(desktopUtilitiesButton?.disabled).toBe(true);

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
		expect(document.activeElement).not.toBe(desktopUtilitiesButton);
		expect(testState.openDepositModal).not.toHaveBeenCalled();
		expect(testState.openSettingsDialog).not.toHaveBeenCalled();

		expect(container.querySelector<HTMLAnchorElement>('a[aria-label="gatu"]')).not.toBeNull();
		expect(findLink("Trade")).not.toBeUndefined();
		const moreTriggers = container.querySelectorAll<HTMLButtonElement>('[data-testid="more-dropdown"] > button');
		expect(moreTriggers).toHaveLength(2);
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
});
