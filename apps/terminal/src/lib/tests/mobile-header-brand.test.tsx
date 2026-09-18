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
		children,
		className,
		to,
	}: {
		"aria-label"?: string;
		children: ReactNode;
		className?: string;
		to: string;
	}) => createElement("a", { "aria-label": ariaLabel, className, href: to }, children),
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

	it("uses the approved 22px micro mark in a 44px focusable target", () => {
		const container = document.createElement("div");
		container.innerHTML = renderToStaticMarkup(
			<I18nProvider i18n={i18n}>
				<MobileHeader />
			</I18nProvider>,
		);

		const logoLink = container.querySelector<HTMLAnchorElement>('a[aria-label="GATU"]');
		const brandMark = logoLink?.querySelector<SVGElement>('[data-gatu-logo="mark"]');

		expect(logoLink?.className).toContain("touch-target");
		expect(logoLink?.className).toContain("focus-visible:outline-stroke-focus");
		expect(logoLink?.className).toContain("max-[359px]:hidden");
		expect(brandMark?.getAttribute("class")).toContain("size-[22px]");
		expect(brandMark?.querySelector("path")?.getAttribute("stroke-width")).toBe("6.5");
	});
});
