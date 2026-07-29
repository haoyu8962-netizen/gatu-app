// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "./harness/react";

vi.mock("@gatu/ui", () => ({
	Tooltip: ({ children, content }: { children: ReactNode; content: ReactNode }) =>
		createElement("span", { "data-tooltip": String(content) }, children),
}));

describe("SpotMarketSocialLinks", () => {
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
		vi.clearAllMocks();
	});

	it("renders safe external links in the desktop-only market bar row", async () => {
		const { SpotMarketSocialLinks } = await import("@/components/trade/components/spot-market-social-links");
		act(() =>
			root.render(
				createElement(SpotMarketSocialLinks, {
					socials: {
						displayName: "Lick",
						x: "https://x.com/lick_fun",
						telegram: "https://t.me/lickfun",
						website: "https://www.lick.fun/",
					},
				}),
			),
		);

		expect(container.textContent).toContain("Lick");
		const links = [...container.querySelectorAll("a")];
		expect(links).toHaveLength(3);
		expect(links.map((link) => link.getAttribute("aria-label"))).toEqual(["X", "Telegram", "Website"]);
		for (const link of links) {
			expect(link.getAttribute("target")).toBe("_blank");
			expect(link.getAttribute("rel")).toBe("noopener noreferrer");
		}
		expect(container.firstElementChild?.className).toContain("hidden");
		expect(container.firstElementChild?.className).toContain("min-[1001px]:grid");
	});

	it("renders nothing when the selected market has no spot social metadata", async () => {
		const { SpotMarketSocialLinks } = await import("@/components/trade/components/spot-market-social-links");
		act(() => root.render(createElement(SpotMarketSocialLinks, { socials: null })));

		expect(container.firstElementChild).toBeNull();
	});
});
