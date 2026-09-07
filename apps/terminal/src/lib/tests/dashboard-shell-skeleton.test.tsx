// @vitest-environment jsdom

import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DashboardShellSkeleton } from "@/components/dashboard/dashboard-shell-skeleton";

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

	it("exposes an honest route-neutral loading frame with one main landmark", () => {
		root = createRoot(container);
		act(() => root?.render(<DashboardShellSkeleton />));

		const fallback = container.querySelector('[data-testid="dashboard-shell-fallback"]');
		const status = fallback?.querySelector("output");
		const main = fallback?.querySelector("main");
		expect(fallback?.hasAttribute("aria-busy")).toBe(false);
		expect(status?.textContent).toBe("Loading GATU...");
		expect(status?.closest('[aria-busy="true"]')).toBeNull();
		expect(fallback?.querySelectorAll("main")).toHaveLength(1);
		expect(main?.getAttribute("aria-busy")).toBe("true");
		expect(main?.closest('[aria-hidden="true"]')).toBeNull();
		expect(fallback?.querySelectorAll("nav, a, button, input, select, textarea")).toHaveLength(0);
		expect(fallback?.querySelectorAll('[class*="animate-"]')).toHaveLength(0);
		const header = fallback?.querySelector('[data-slot="dashboard-skeleton-header"]');
		expect(header?.className).toContain("pt-[env(safe-area-inset-top)]");
		expect(header?.firstElementChild?.className).toContain("pl-[max(0.625rem,var(--sal))]");
		expect(header?.firstElementChild?.className).toContain("pr-[max(0.625rem,var(--sar))]");
	});

	it("hydrates without replacing the route-matched dashboard frame", async () => {
		container.innerHTML = renderToString(<DashboardShellSkeleton />);
		const serverFallback = container.querySelector('[data-testid="dashboard-shell-fallback"]');
		const serverMain = container.querySelector("main");
		const recoverableErrors: unknown[] = [];

		await act(async () => {
			root = hydrateRoot(container, <DashboardShellSkeleton />, {
				onRecoverableError: (error) => recoverableErrors.push(error),
			});
		});

		expect(recoverableErrors).toHaveLength(0);
		expect(container.querySelector('[data-testid="dashboard-shell-fallback"]')).toBe(serverFallback);
		expect(container.querySelector("main")).toBe(serverMain);
	});
});
