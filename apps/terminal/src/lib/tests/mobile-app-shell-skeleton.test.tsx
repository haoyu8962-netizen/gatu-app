/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShellSkeleton } from "@/components/trade/layout/app-shell-skeleton";
import { TerminalLoadingWorkspace } from "@/components/trade/layout/terminal-loading-workspace";
import { MobileLoadingFallback } from "@/components/trade/mobile/mobile-loading-fallback";

describe("AppShellSkeleton mobile viewport", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("uses the fixed mobile shell and current three-item navigation shape", () => {
		act(() => root.render(<AppShellSkeleton />));

		const mobileShell = container.querySelector("[data-shell-mobile]");
		expect(mobileShell?.className).toContain("fixed");
		expect(mobileShell?.className).toContain("inset-0");
		expect(mobileShell?.className).toContain("overscroll-none");
		expect(mobileShell?.className).not.toContain("h-dvh");
		const headerItems = mobileShell?.firstElementChild?.firstElementChild;
		const workspace = mobileShell?.children.item(1);
		const navigationItems = mobileShell?.lastElementChild?.firstElementChild;
		expect(headerItems?.className).toContain("h-14");
		expect(headerItems?.className).toContain("pl-[max(0.625rem,var(--sal))]");
		expect(headerItems?.className).toContain("pr-[max(0.625rem,var(--sar))]");
		expect(workspace?.className).toContain("pl-[var(--sal)]");
		expect(workspace?.className).toContain("pr-[var(--sar)]");
		expect(navigationItems?.className).toContain("pl-[var(--sal)]");
		expect(navigationItems?.className).toContain("pr-[var(--sar)]");
		expect(mobileShell?.lastElementChild?.querySelectorAll(".flex-1")).toHaveLength(3);
	});

	it("matches the header, market bar, split, positions tabs and nav geometry", () => {
		act(() => root.render(<AppShellSkeleton />));
		const shell = container.querySelector("[data-shell-mobile]");
		const actions = shell?.querySelector('[data-slot="mobile-header-actions"]');
		expect(actions?.children).toHaveLength(4);
		for (const iconSlot of Array.from(actions?.children ?? []).slice(1)) {
			expect(iconSlot.className).toContain("size-11");
			expect(iconSlot.className).toContain("min-h-11");
		}
		expect(shell?.querySelector('[data-slot="mobile-header-brand"]')?.children).toHaveLength(2);
		expect(shell?.querySelector('[data-slot="mobile-header-account"] svg')?.getAttribute("class")).toBe("size-3.5");
		expect(shell?.querySelector('[data-slot="mobile-market-bar"]')?.className).toContain("min-h-[61px]");
		expect(shell?.querySelector('[data-slot="mobile-market-selector"]')?.classList.contains("pl-1")).toBe(true);
		const sliderFrame = shell?.querySelector('[data-slot="mobile-size-slider-frame"]');
		expect(sliderFrame?.classList.contains("h-[33px]")).toBe(true);
		expect(sliderFrame?.firstElementChild?.classList.contains("bg-fill-weak")).toBe(true);
		expect(shell?.querySelector('[data-slot="mobile-trade-order-split"]')?.className).toContain(
			"min-h-[clamp(370px,60svh,480px)]",
		);
		expect(shell?.querySelector('[class*="bg-grid-container"]')).toBeNull();
		const tabs = shell?.querySelector('[data-slot="mobile-positions-tabs"]');
		expect(Array.from(tabs?.children ?? []).map((tab) => tab.textContent)).toEqual([
			"Balances",
			"Positions",
			"Orders",
			"TWAP",
			"Trade History",
			"Funding Payments",
			"Order History",
		]);
		expect(tabs?.querySelectorAll("[data-active]")).toHaveLength(1);
		expect(tabs?.children[1]?.hasAttribute("data-active")).toBe(true);
		const sides = shell?.querySelector('[data-slot="mobile-side-toggle"]');
		expect(sides?.textContent).toBe("LongShort");
		expect(sides?.innerHTML).not.toMatch(/text-success|text-error|bg-trading-panel-(success|error)/);
		expect(shell?.querySelector('[data-slot="mobile-header-theme"]')?.innerHTML).toContain("dark:block");
		expect(shell?.querySelector('[data-slot="mobile-header-theme"]')?.innerHTML).toContain("dark:hidden");
		expect(shell?.lastElementChild?.querySelectorAll('[class*="text-3xs tracking-wide"]')).toHaveLength(3);
	});

	it("renders a stable terminal frame without replaying a loading animation", () => {
		act(() => root.render(<AppShellSkeleton />));

		expect(container.querySelectorAll('[class*="animate-"]')).toHaveLength(0);
		expect(container.querySelectorAll("[data-shell-panel]")).toHaveLength(7);
		expect(container.textContent).toContain("GATU");
	});

	it("reserves the mobile drawer and brand slots with the approved micro mark", () => {
		act(() => root.render(<AppShellSkeleton />));

		const mobileShell = container.querySelector("[data-shell-mobile]");
		const brandMark = mobileShell?.querySelector<SVGElement>('[data-gatu-logo="mark"]');
		const brandSlot = brandMark?.parentElement;
		const drawerSlot = brandSlot?.previousElementSibling;

		expect(brandMark?.getAttribute("class")).toContain("size-[22px]");
		expect(brandMark?.querySelector("path")?.getAttribute("stroke-width")).toBe("6.5");
		expect(brandSlot?.className).toContain("touch-target");
		expect(drawerSlot?.className).toContain("touch-target");
	});

	it("exposes one implicit status while keeping the decorative AppShell out of the accessibility tree", () => {
		act(() => root.render(<AppShellSkeleton />));

		const fallback = container.querySelector('[data-testid="app-shell-fallback"]');
		expectBusySurfaceWithImplicitStatus(fallback);
		expect(fallback?.hasAttribute("aria-hidden")).toBe(false);
		expect(fallback?.querySelector(':scope > div[aria-hidden="true"]')).not.toBeNull();
		const decorative = fallback?.querySelector('[aria-hidden="true"][inert]');
		expect(decorative).not.toBeNull();
		for (const control of fallback?.querySelectorAll(
			'a, button, input, select, textarea, [role="button"], [tabindex]',
		) ?? []) {
			expect(control.closest("[inert]")).toBe(decorative);
		}
	});

	it("hydrates the pre-locale startup status without changing its server markup", async () => {
		const hydrationContainer = document.createElement("div");
		hydrationContainer.innerHTML = renderToString(<AppShellSkeleton />);
		document.body.appendChild(hydrationContainer);
		const serverMarkup = hydrationContainer.innerHTML;
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

		let hydrationRoot: Root | undefined;
		await act(async () => {
			hydrationRoot = hydrateRoot(hydrationContainer, <AppShellSkeleton />);
		});

		expectBusySurfaceWithImplicitStatus(hydrationContainer.querySelector('[data-testid="app-shell-fallback"]'));
		expect(hydrationContainer.innerHTML).toBe(serverMarkup);
		expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(/hydration|did not match/i);

		act(() => hydrationRoot?.unmount());
		consoleError.mockRestore();
		hydrationContainer.remove();
	});

	it("uses the shared fractional desktop geometry without changing the mobile shell", () => {
		act(() => root.render(<AppShellSkeleton />));

		const desktopLoadingSurface = container.querySelector<HTMLElement>("[data-desktop-grid-loading-surface]");
		const chartPanel = container.querySelector<HTMLElement>('[data-desktop-grid-loading-panel="chart"]');

		expect(desktopLoadingSurface?.style.getPropertyValue("--dgl-md-container-h")).toBe("1144.8px");
		expect(desktopLoadingSurface?.style.getPropertyValue("--dgl-lg-container-h")).toBe("1138.2px");
		expect(chartPanel?.style.getPropertyValue("--dgl-md-t")).toBe("92px");
		expect(chartPanel?.style.getPropertyValue("--dgl-md-h")).toBe("588px");
		expect(chartPanel?.style.getPropertyValue("--dgl-lg-t")).toBe("92px");
		expect(chartPanel?.style.getPropertyValue("--dgl-lg-h")).toBe("581px");
		expect(container.querySelectorAll("[data-shell-mobile]")).toHaveLength(1);
	});

	it("reuses the SSR mobile shell for the lazy-loading fallback so the swap is pixel-stable", () => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<MobileLoadingFallback />
				</I18nProvider>,
			),
		);

		const fallback = container.querySelector('[data-testid="mobile-loading-fallback"]');
		expectBusySurfaceWithImplicitStatus(fallback);
		const mobileShell = fallback?.querySelector("[data-shell-mobile]");
		expect(mobileShell?.hasAttribute("data-shell-mobile")).toBe(true);
		expect(mobileShell?.className).toContain("fixed");
		expect(mobileShell?.className).toContain("inset-0");
		expect(mobileShell?.className).toContain("overscroll-none");
		expect(mobileShell?.className).not.toContain("h-dvh");
		const headerItems = mobileShell?.firstElementChild?.firstElementChild;
		const workspace = mobileShell?.children.item(1);
		const navigationItems = mobileShell?.lastElementChild?.firstElementChild;
		expect(headerItems?.className).toContain("h-14");
		expect(headerItems?.className).toContain("pl-[max(0.625rem,var(--sal))]");
		expect(workspace?.className).toContain("pl-[var(--sal)]");
		expect(navigationItems?.className).toContain("pl-[var(--sal)]");
		expect(mobileShell?.lastElementChild?.querySelectorAll(".flex-1")).toHaveLength(3);
		expect(mobileShell?.innerHTML).not.toContain("animate-pulse");
	});

	it("uses the same single implicit status contract for the desktop market-loading workspace", () => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<TerminalLoadingWorkspace />
				</I18nProvider>,
			),
		);

		const workspace = container.querySelector('[data-testid="terminal-loading-workspace"]');
		expectBusySurfaceWithImplicitStatus(workspace);
		expect(workspace?.querySelectorAll("[data-desktop-grid-loading-surface]")).toHaveLength(1);
		expect(workspace?.querySelectorAll('[class*="animate-"]')).toHaveLength(0);
	});
});

function expectBusySurfaceWithImplicitStatus(surface: Element | null) {
	expect(surface).not.toBeNull();
	expect(surface?.getAttribute("aria-busy")).toBe("true");

	const outputs = surface?.querySelectorAll("output");
	expect(outputs).toHaveLength(1);
	const output = outputs?.item(0);
	// HTML output already maps to status; keep that accessibility mapping implicit.
	expect(output?.hasAttribute("role")).toBe(false);
	expect(output?.hasAttribute("aria-live")).toBe(false);
	expect(output?.closest('[aria-hidden="true"]')).toBeNull();
}
