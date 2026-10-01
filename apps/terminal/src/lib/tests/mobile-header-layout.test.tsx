/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "./harness/react";

vi.mock("@sairn/ui", () => ({
	buttonVariants: () => "",
	ButtonIcon: ({
		"aria-label": ariaLabel,
		children,
		className,
	}: {
		"aria-label"?: string;
		children?: ReactNode;
		className?: string;
	}) => (
		<button type="button" aria-label={ariaLabel} className={className}>
			{children}
		</button>
	),
}));

vi.mock("@phosphor-icons/react", () => ({
	GearIcon: ({ className }: { className?: string }) => <span className={className} />,
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		"aria-label": ariaLabel,
		children,
		className,
	}: {
		"aria-label"?: string;
		children: ReactNode;
		className?: string;
	}) => (
		<a href="/trade" aria-label={ariaLabel} className={className}>
			{children}
		</a>
	),
}));

vi.mock("@/hooks/trade/use-trade-home-path", () => ({
	useTradeHomePath: () => "/trade",
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useSettingsDialogActions: () => ({ open: vi.fn() }),
}));

vi.mock("@/components/trade/header/language-switcher", () => ({
	LanguageSwitcher: ({ className }: { className?: string }) => (
		<button type="button" data-testid="language" className={className}>
			Language
		</button>
	),
}));

vi.mock("@/components/trade/header/theme-toggle", () => ({
	ThemeToggle: ({ className }: { className?: string }) => (
		<button type="button" data-testid="theme" className={className}>
			Theme
		</button>
	),
}));

vi.mock("@/components/trade/header/user-menu", () => ({
	UserMenu: () => (
		<button type="button" data-testid="account">
			account-with-a-long-email-address@example.test
		</button>
	),
}));

vi.mock("@/components/trade/mobile/mobile-nav-drawer", () => ({
	MobileNavDrawer: () => (
		<button type="button" data-testid="navigation">
			Navigation
		</button>
	),
}));

import { MobileHeader } from "@/components/trade/mobile/mobile-header";

describe("MobileHeader layout", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("gives the account the remaining width and separates expanded icon touch targets", () => {
		act(() => root.render(<MobileHeader />));

		const header = container.querySelector<HTMLElement>("header");
		const inner = container.querySelector<HTMLElement>('[data-slot="mobile-header-inner"]');
		const brand = container.querySelector<HTMLElement>('[data-slot="mobile-header-brand"]');
		const actions = container.querySelector<HTMLElement>('[data-slot="mobile-header-actions"]');
		const account = container.querySelector<HTMLElement>('[data-slot="mobile-header-account"]');
		const theme = actions?.querySelector<HTMLElement>('[data-testid="theme"]');

		expect(header?.className).not.toContain("pl-[");
		expect(header?.className).not.toContain("pr-[");
		expect(inner?.className).toContain("gap-2");
		expect(inner?.className).toContain("pl-[max(0.625rem,var(--sal))]");
		expect(inner?.className).toContain("pr-[max(0.625rem,var(--sar))]");
		expect(brand?.className).toContain("shrink-0");
		expect(actions?.className).toContain("min-w-0");
		expect(actions?.className).toContain("flex-1");
		expect(actions?.className).toContain("gap-1");
		expect(actions?.className).toContain("min-[360px]:gap-2");
		expect(account?.className).toContain("min-w-0");
		expect(account?.className).toContain("flex-1");
		expect(account?.className).toContain("justify-end");
		expect(account?.className).not.toContain("[&_button]:h-11");
		expect(account?.className).not.toContain("[&_button]:min-h-11");
		expect(actions?.className).toContain("ms-auto");
		expect(account?.querySelector('[data-testid="account"]')).not.toBeNull();
		expect(theme).toBeNull();
		expect(actions?.querySelector('[data-testid="language"]')?.className).toContain("size-11");
		expect(actions?.querySelector('button[aria-label="Settings"]')?.className).toContain("size-11");
	});
});
