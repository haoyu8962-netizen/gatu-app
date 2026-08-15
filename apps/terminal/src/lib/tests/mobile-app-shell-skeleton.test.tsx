/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppShellSkeleton } from "@/components/trade/layout/app-shell-skeleton";
import { MobileLoadingFallback } from "@/components/trade/mobile/mobile-loading-fallback";

describe("AppShellSkeleton mobile viewport", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
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
		expect(mobileShell?.firstElementChild?.firstElementChild?.className).toContain("h-14");
		expect(mobileShell?.lastElementChild?.querySelectorAll(".h-14")).toHaveLength(3);
	});

	it("renders a stable terminal frame without replaying a loading animation", () => {
		act(() => root.render(<AppShellSkeleton />));

		expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
		expect(container.querySelectorAll("[data-shell-panel]")).toHaveLength(7);
		expect(container.textContent).toContain("gatu");
	});

	it("uses the shared fractional desktop geometry without changing the mobile shell", () => {
		act(() => root.render(<AppShellSkeleton />));

		const desktopLoadingSurface = container.querySelector<HTMLElement>("[data-desktop-grid-loading-surface]");
		const chartPanel = container.querySelector<HTMLElement>('[data-desktop-grid-loading-panel="chart"]');

		expect(desktopLoadingSurface?.style.getPropertyValue("--dgl-md-container-h")).toBe("1554px");
		expect(desktopLoadingSurface?.style.getPropertyValue("--dgl-lg-container-h")).toBe("1138.2px");
		expect(chartPanel?.style.getPropertyValue("--dgl-md-t")).toBe("92px");
		expect(chartPanel?.style.getPropertyValue("--dgl-md-h")).toBe("588px");
		expect(chartPanel?.style.getPropertyValue("--dgl-lg-t")).toBe("92px");
		expect(chartPanel?.style.getPropertyValue("--dgl-lg-h")).toBe("581px");
		expect(container.querySelectorAll("[data-shell-mobile]")).toHaveLength(1);
	});

	it("reuses the SSR mobile shell for the lazy-loading fallback so the swap is pixel-stable", () => {
		act(() => root.render(<MobileLoadingFallback />));

		const mobileShell = container.firstElementChild;
		expect(mobileShell?.hasAttribute("data-shell-mobile")).toBe(true);
		expect(mobileShell?.className).toContain("fixed");
		expect(mobileShell?.className).toContain("inset-0");
		expect(mobileShell?.className).toContain("overscroll-none");
		expect(mobileShell?.className).not.toContain("h-dvh");
		expect(mobileShell?.firstElementChild?.firstElementChild?.className).toContain("h-14");
		expect(mobileShell?.lastElementChild?.querySelectorAll(".flex-1.h-14")).toHaveLength(3);
		expect(mobileShell?.innerHTML).not.toContain("animate-pulse");
	});
});
