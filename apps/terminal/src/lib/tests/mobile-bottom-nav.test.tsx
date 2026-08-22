// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileBottomNav } from "@/components/trade/mobile/mobile-bottom-nav";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("MobileBottomNav", () => {
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

	it("keeps navigation in the viewport shell without allowing vertical page panning", () => {
		const onTabChange = vi.fn();
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<MobileBottomNav activeTab="markets" onTabChange={onTabChange} />
				</I18nProvider>,
			),
		);

		const marketsButton = container.querySelector<HTMLButtonElement>('button[aria-label="Markets"]');
		const tradeButton = container.querySelector<HTMLButtonElement>('button[aria-label="Trade"]');
		const navigation = container.querySelector("nav");
		const navigationItems = navigation?.firstElementChild;
		expect(navigation?.className).toContain("relative");
		expect(navigation?.className).toContain("shrink-0");
		expect(navigation?.className).toContain("[touch-action:pan-x_pinch-zoom]");
		expect(navigation?.className).not.toContain("fixed");
		expect(navigation?.className).not.toContain("bottom-0");
		expect(navigation?.className).not.toContain("pl-[var(--sal)]");
		expect(navigationItems?.className).toContain("pl-[var(--sal)]");
		expect(navigationItems?.className).toContain("pr-[var(--sar)]");
		expect(marketsButton?.getAttribute("aria-current")).toBe("page");
		expect(tradeButton?.className).not.toContain("-webkit-tap-highlight-color");

		act(() => tradeButton?.click());
		expect(onTabChange).toHaveBeenCalledWith("trade");
	});
});
