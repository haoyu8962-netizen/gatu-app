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

		const mobileShell = container.firstElementChild;
		expect(mobileShell?.className).toContain("fixed");
		expect(mobileShell?.className).toContain("inset-0");
		expect(mobileShell?.className).toContain("overscroll-none");
		expect(mobileShell?.className).not.toContain("h-dvh");
		expect(mobileShell?.querySelectorAll(".h-14")).toHaveLength(3);
	});

	it("keeps the lazy-loading shell pinned with the current three-item navigation shape", () => {
		act(() => root.render(<MobileLoadingFallback />));

		const mobileShell = container.firstElementChild;
		expect(mobileShell?.className).toContain("fixed");
		expect(mobileShell?.className).toContain("inset-0");
		expect(mobileShell?.className).toContain("overscroll-none");
		expect(mobileShell?.className).not.toContain("h-dvh");
		expect(mobileShell?.querySelectorAll(`[style="min-height: 56px;"]`)).toHaveLength(3);
	});
});
