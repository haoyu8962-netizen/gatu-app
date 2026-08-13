// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act, createElement, Fragment, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileNavDrawer } from "@/components/trade/mobile/mobile-nav-drawer";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	pathname: "/api-wallet",
}));

vi.mock("@gatu/ui", () => ({
	Badge: ({ children }: { children: ReactNode }) => createElement("span", null, children),
	Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) =>
		createElement("button", { onClick, type: "button" }, children),
	ButtonIcon: ({
		"aria-label": ariaLabel,
		children,
		onClick,
	}: {
		"aria-label"?: string;
		children: ReactNode;
		onClick?: () => void;
	}) => createElement("button", { "aria-label": ariaLabel, onClick, type: "button" }, children),
	Drawer: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? createElement(Fragment, null, children) : null,
	DrawerContent: ({ children }: { children: ReactNode }) =>
		createElement("div", { "data-testid": "mobile-nav-drawer" }, children),
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
}));

vi.mock("@/components/trade/header/theme-toggle", () => ({
	ThemeToggle: () => createElement("div", { "data-testid": "theme-toggle" }),
}));

vi.mock("@/hooks/trade/use-trade-home-path", () => ({
	useTradeHomePath: () => "/trade/HYPE",
}));

vi.mock("@/hooks/use-geo-restriction", () => ({
	useGeoRestriction: () => ({ tradeRestricted: false }),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ hasWalletAccess: false }),
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalActions: () => ({ open: vi.fn() }),
	useSettingsDialogActions: () => ({ open: vi.fn() }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("MobileNavDrawer", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		testState.pathname = "/api-wallet";
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
		expect(moreItems.map(itemLabel)).toEqual(["Statistics", "API Wallet"]);

		const links = [...container.querySelectorAll<HTMLAnchorElement>('[data-testid="mobile-nav-drawer"] nav a')];
		expect(links.map((link) => link.textContent?.trim())).toEqual([
			"Trade",
			"Portfolio",
			"Vaults",
			"Staking",
			"Referrals",
			"Leaderboard",
			"API Wallet",
		]);
		expect(links.map((link) => link.dataset.to)).toEqual([
			"/trade/HYPE",
			"/portfolio",
			"/vaults",
			"/staking",
			"/referrals",
			"/leaderboard",
			"/api-wallet",
		]);

		const upcomingItems = [
			...container.querySelectorAll<HTMLButtonElement>('[data-testid="mobile-nav-drawer"] nav button'),
		];
		expect(upcomingItems.map(itemLabel)).toEqual(["Earn", "Statistics"]);
		for (const item of upcomingItems) {
			expect(item.disabled).toBe(true);
			expect(item.textContent).toContain("Soon");
		}

		const drawerText = container.querySelector('[data-testid="mobile-nav-drawer"]')?.textContent;
		for (const removedLabel of ["Docs", "Support", "Terms", "Privacy Policy", "Risk Disclosure"])
			expect(drawerText).not.toContain(removedLabel);

		const apiWalletLink = links.find((link) => link.textContent?.trim() === "API Wallet");
		expect(apiWalletLink?.dataset.to).toBe("/api-wallet");
		expect(apiWalletLink?.getAttribute("aria-current")).toBe("page");
		expect(apiWalletLink?.className).toContain("bg-fill-hover");

		act(() => apiWalletLink?.click());
		expect(container.querySelector('[data-testid="mobile-nav-drawer"]')).toBeNull();
	});
});
