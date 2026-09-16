// @vitest-environment jsdom

import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DashboardShellSkeleton } from "@/components/dashboard/dashboard-shell-skeleton";
import { DASHBOARD_FRAMES } from "@/config/dashboard-frames";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("DashboardShellSkeleton", () => {
	let container: HTMLDivElement;
	let root: Root | undefined;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		if (root) {
			act(() => root?.unmount());
			root = undefined;
		}
		container.remove();
	});

	it("exposes an inert shared chrome and one decorative main with one loading announcement", () => {
		root = createRoot(container);
		act(() => root?.render(<DashboardShellSkeleton />));

		const fallback = container.querySelector('[data-testid="dashboard-shell-fallback"]');
		const status = fallback?.querySelector("output");
		const main = fallback?.querySelector("main");
		expect(fallback?.getAttribute("aria-busy")).toBe("true");
		expect(status?.textContent).toBe("Loading GATU...");
		expect(status?.closest("[inert], [aria-hidden='true']")).toBeNull();
		expect(fallback?.querySelectorAll("output")).toHaveLength(1);
		expect(fallback?.querySelectorAll("main")).toHaveLength(1);
		expect(main?.closest('[aria-hidden="true"][inert]')).not.toBeNull();
		expect(fallback?.querySelectorAll("header")).toHaveLength(2);
		expect(fallback?.querySelectorAll("button").length).toBeGreaterThan(0);
		for (const control of fallback?.querySelectorAll("nav, a, button, input, select, textarea") ?? [])
			expect(control.closest('[aria-hidden="true"][inert]')).not.toBeNull();
		expect(fallback?.querySelectorAll('[class*="animate-"]')).toHaveLength(0);
		const header = fallback?.querySelector('[data-slot="mobile-header-inner"]');
		expect(header?.parentElement?.className).toContain("pt-[env(safe-area-inset-top)]");
		expect(header?.className).toContain("pl-[max(0.625rem,var(--sal))]");
		expect(header?.className).toContain("pr-[max(0.625rem,var(--sar))]");
	});

	it.each(Object.entries(DASHBOARD_FRAMES))(
		"hydrates %s without replacing the route-matched dashboard frame",
		async (pathname, frame) => {
			container.innerHTML = renderToString(<DashboardShellSkeleton pathname={pathname} frame={frame} />);
			const serverFallback = container.querySelector('[data-testid="dashboard-shell-fallback"]');
			const serverMain = container.querySelector("main");
			const recoverableErrors: unknown[] = [];

			await act(async () => {
				root = hydrateRoot(container, <DashboardShellSkeleton pathname={pathname} frame={frame} />, {
					onRecoverableError: (error) => recoverableErrors.push(error),
				});
			});

			expect(recoverableErrors).toHaveLength(0);
			expect(container.querySelector('[data-testid="dashboard-shell-fallback"]')).toBe(serverFallback);
			expect(container.querySelector("main")).toBe(serverMain);
		},
	);
});
