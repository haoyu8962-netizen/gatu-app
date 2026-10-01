/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileHeader } from "@/components/trade/mobile/mobile-header";

vi.mock("@gatu/ui", () => ({
	buttonVariants: () => "",
	ButtonIcon: ({
		"aria-label": ariaLabel,
		children,
		className,
		onClick,
	}: {
		"aria-label"?: string;
		children: ReactNode;
		className?: string;
		onClick?: () => void;
	}) => createElement("button", { "aria-label": ariaLabel, className, onClick, type: "button" }, children),
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		"aria-label": ariaLabel,
		"data-brand-home-link": brandHomeLink,
		children,
		className,
		to,
	}: {
		"aria-label"?: string;
		"data-brand-home-link"?: string;
		children: ReactNode;
		className?: string;
		to: string;
	}) =>
		createElement(
			"a",
			{ "aria-label": ariaLabel, "data-brand-home-link": brandHomeLink, className, href: to },
			children,
		),
}));

vi.mock("@/hooks/trade/use-trade-home-path", () => ({
	useTradeHomePath: () => "/trade/BTC",
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useSettingsDialogActions: () => ({ open: vi.fn() }),
}));

vi.mock("@/components/trade/header/language-switcher", () => ({
	LanguageSwitcher: () => createElement("button", { type: "button" }, "Language"),
}));

vi.mock("@/components/trade/header/theme-toggle", () => ({
	ThemeToggle: () => createElement("button", { type: "button" }, "Theme"),
}));

vi.mock("@/components/trade/header/user-menu", () => ({
	UserMenu: () => createElement("button", { type: "button" }, "User"),
}));

vi.mock("@/components/trade/mobile/mobile-nav-drawer", () => ({
	MobileNavDrawer: () => createElement("button", { type: "button" }, "Menu"),
}));

describe("MobileHeader brand link", () => {
	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	it("uses the 24px Sairn mark in a 44px focusable target", () => {
		const container = document.createElement("div");
		container.innerHTML = renderToStaticMarkup(
			<I18nProvider i18n={i18n}>
				<MobileHeader />
			</I18nProvider>,
		);

		const logoLink = container.querySelector<HTMLAnchorElement>("a[data-brand-home-link]");
		const brandMark = logoLink?.querySelector<SVGElement>('[data-brand-logo="mark"]');

		expect(logoLink?.getAttribute("aria-label")).toBe("GATU");
		expect(logoLink?.className).toContain("touch-target");
		expect(logoLink?.className).toContain("focus-visible:outline-stroke-focus");
		expect(logoLink?.className).toContain("max-[359px]:hidden");
		expect(brandMark?.getAttribute("class")).toBe("h-6 w-auto");
		expect(brandMark?.querySelectorAll("path")).toHaveLength(2);
	});
});
