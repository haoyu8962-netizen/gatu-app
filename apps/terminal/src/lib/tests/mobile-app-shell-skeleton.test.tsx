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
		expect(headerItems?.className).toContain("pl-[max(0.75rem,var(--sal))]");
		expect(headerItems?.className).toContain("pr-[max(0.75rem,var(--sar))]");
		expect(workspace?.className).toContain("pl-[max(3px,var(--sal))]");
		expect(workspace?.className).toContain("pr-[max(3px,var(--sar))]");
		expect(navigationItems?.className).toContain("pl-[var(--sal)]");
		expect(navigationItems?.className).toContain("pr-[var(--sar)]");
		expect(mobileShell?.lastElementChild?.querySelectorAll(".h-14")).toHaveLength(3);
	});

	it("renders a stable terminal frame without replaying a loading animation", () => {
		act(() => root.render(<AppShellSkeleton />));

		expect(container.querySelectorAll('[class*="animate-"]')).toHaveLength(0);
		expect(container.querySelectorAll("[data-shell-panel]")).toHaveLength(7);
		expect(container.textContent).toContain("gatu");
	});

	it("exposes one implicit status while keeping the decorative AppShell out of the accessibility tree", () => {
		act(() => root.render(<AppShellSkeleton />));

		const fallback = container.querySelector('[data-testid="app-shell-fallback"]');
		expectBusySurfaceWithImplicitStatus(fallback);
		expect(fallback?.hasAttribute("aria-hidden")).toBe(false);
		expect(fallback?.querySelector(':scope > div[aria-hidden="true"]')).not.toBeNull();
		expect(
			fallback?.querySelectorAll('a, button, input, select, textarea, [role="navigation"], [tabindex]'),
		).toHaveLength(0);
	});

	it("hydrates the pre-locale startup status without changing its server markup", async () => {
		const hydrationContainer = document.createElement("div");
		hydrationContainer.innerHTML = renderToString(<AppShellSkeleton />);
		document.body.appendChild(hydrationContainer);
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

		let hydrationRoot: Root | undefined;
		await act(async () => {
			hydrationRoot = hydrateRoot(hydrationContainer, <AppShellSkeleton />);
		});

		expectBusySurfaceWithImplicitStatus(hydrationContainer.querySelector('[data-testid="app-shell-fallback"]'));
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
		expect(headerItems?.className).toContain("pl-[max(0.75rem,var(--sal))]");
		expect(workspace?.className).toContain("pl-[max(3px,var(--sal))]");
		expect(navigationItems?.className).toContain("pl-[var(--sal)]");
		expect(mobileShell?.lastElementChild?.querySelectorAll(".flex-1.h-14")).toHaveLength(3);
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
