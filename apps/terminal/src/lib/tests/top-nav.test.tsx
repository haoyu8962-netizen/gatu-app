// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TopNav } from "@/components/trade/header/top-nav";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	hasWalletAccess: true,
	isTestnet: false,
	navigate: vi.fn(),
	openDepositModal: vi.fn(),
	openSettingsDialog: vi.fn(),
	pathname: "/trade/HYPE",
	tradeHomePath: "/trade/HYPE",
	tradeRestricted: false,
}));

vi.mock("@gatu/ui", () => ({
	Button: ({ children, iconLeft, onClick }: { children: ReactNode; iconLeft?: ReactNode; onClick?: () => void }) =>
		createElement("button", { onClick, type: "button" }, iconLeft, children),
	ButtonIcon: ({
		"aria-label": ariaLabel,
		children,
		onClick,
	}: {
		"aria-label"?: string;
		children: ReactNode;
		onClick?: () => void;
	}) => createElement("button", { "aria-label": ariaLabel, onClick, type: "button" }, children),
	Divider: () => createElement("hr"),
	Dropdown: ({
		className,
		items = [],
		trigger,
		triggerAriaLabel,
	}: {
		className?: string;
		items?: Array<{ active?: boolean; disabled?: boolean; label: string; onSelect?: () => void }>;
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
					createElement(
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

vi.mock("@/hooks/use-geo-restriction", () => ({
	useGeoRestriction: () => ({ tradeRestricted: testState.tradeRestricted }),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ hasWalletAccess: testState.hasWalletAccess }),
}));

vi.mock("@/lib/lazy", () => ({
	createLazyComponent: (_loader: unknown, exportName: string) => () =>
		createElement("div", { "data-testid": exportName }),
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
		testState.isTestnet = false;
		testState.pathname = "/trade/HYPE";
		testState.tradeHomePath = "/trade/HYPE";
		testState.tradeRestricted = false;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderNav() {
		act(() => root.render(<TopNav />));
	}

	function findButton(label: string) {
		return [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === label,
		);
	}

	function findLink(label: string) {
		return [...container.querySelectorAll<HTMLAnchorElement>("a")].find((link) => link.textContent?.trim() === label);
	}

	it.each([
		["/trade/HYPE", "Trade"],
		["/perp/BTC", "Trade"],
		["/portfolio", "Portfolio"],
		["/docs", "Docs"],
		["/risk", "Risk Disclosure"],
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

	it("keeps the More menu wired to every existing destination", () => {
		renderNav();
		const destinations = [
			["Docs", "/docs"],
			["Support", "/support"],
			["Terms", "/terms"],
			["Privacy Policy", "/privacy"],
			["Risk Disclosure", "/risk"],
		] as const;
		const wideMenu = container.querySelector<HTMLElement>('[data-layout="wide"]');
		const menuItems = [...(wideMenu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])].filter(
			(item) => !item.disabled,
		);

		expect(menuItems.map((item) => item.textContent?.trim())).toEqual(destinations.map(([label]) => label));
		for (const [label, to] of destinations) {
			act(() => menuItems.find((item) => item.textContent?.trim() === label)?.click());
			expect(testState.navigate).toHaveBeenLastCalledWith({ to });
		}
	});

	it("includes all seven designed primary entries without inventing unavailable routes", () => {
		renderNav();
		const primaryNavigation = container.querySelector<HTMLElement>('nav[aria-label="Primary navigation"]');
		const primaryEntries = [...(primaryNavigation?.querySelectorAll<HTMLElement>(":scope > a, :scope > button") ?? [])];

		expect(primaryEntries.map((item) => item.textContent?.replace(/\s+/g, " ").trim())).toEqual([
			"Trade",
			"Portfolio",
			"Earn — Soon",
			"Vaults — Soon",
			"Staking — Soon",
			"Referrals — Soon",
			"Leaderboard — Soon",
		]);

		for (const label of ["Earn", "Vaults", "Staking", "Referrals", "Leaderboard"]) {
			const button = primaryEntries.find((item) => item.textContent?.startsWith(label));
			expect(button).toBeInstanceOf(HTMLButtonElement);
			expect((button as HTMLButtonElement).disabled).toBe(true);
			expect(button?.title).toBe("Soon");
			expect(findLink(label)).toBeUndefined();
		}
	});

	it("adds future More entries with disabled semantics and no navigation side effects", () => {
		renderNav();
		const wideMenuItems = [
			...(container.querySelector('[data-layout="wide"]')?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ??
				[]),
		];
		const futureItems = wideMenuItems.filter((item) => item.disabled);

		expect(futureItems.map((item) => item.textContent?.trim())).toEqual(["Statistics", "API & Subaccounts"]);
		for (const item of futureItems) act(() => item.click());
		expect(testState.navigate).not.toHaveBeenCalled();
	});

	it("moves lower-priority entries into More for each compact wallet state", () => {
		renderNav();

		function compactMenuItems() {
			return [
				...(container
					.querySelector('[data-layout="compact"]')
					?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []),
			];
		}

		expect(
			compactMenuItems()
				.slice(0, 6)
				.map((item) => item.textContent?.trim()),
		).toEqual(["Vaults", "Staking", "Referrals", "Leaderboard", "Statistics", "API & Subaccounts"]);
		expect(
			compactMenuItems()
				.slice(0, 4)
				.every((item) => item.disabled),
		).toBe(true);

		testState.hasWalletAccess = false;
		renderNav();
		expect(
			compactMenuItems()
				.slice(0, 4)
				.map((item) => item.textContent?.trim()),
		).toEqual(["Staking", "Referrals", "Statistics", "API & Subaccounts"]);
		expect(
			compactMenuItems()
				.slice(0, 4)
				.every((item) => item.disabled),
		).toBe(true);
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
		expect(findButton("Deposit")).toBeUndefined();
	});

	it("keeps account, theme, language, and settings controls mounted", () => {
		renderNav();

		expect(container.querySelector('[data-testid="UserMenu"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="theme-toggle"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="language-switcher"]')).not.toBeNull();
		const settingsButton = container.querySelector<HTMLButtonElement>('button[aria-label="Settings"]');
		expect(settingsButton).not.toBeNull();

		act(() => settingsButton?.click());
		expect(testState.openSettingsDialog).toHaveBeenCalledOnce();
	});
});
