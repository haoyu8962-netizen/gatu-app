// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	SpotMarketSocialIconLinks,
	SpotMarketSocialLinks,
} from "@/components/trade/components/spot-market-social-links";
import { createI18nRoot } from "./harness/react";

vi.mock("@gatu/ui", () => ({
	Tooltip: ({ children, content }: { children: ReactNode; content: ReactNode }) =>
		createElement("span", { "data-tooltip": String(content) }, children),
}));

describe("SpotMarketSocialLinks", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("renders safe external links in the desktop-only market bar row", () => {
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
			expect(link.className).toContain("size-4");
			expect(link.getAttribute("target")).toBe("_blank");
			expect(link.getAttribute("rel")).toBe("noopener noreferrer");
		}
		expect(container.firstElementChild?.className).toContain("hidden");
		expect(container.firstElementChild?.className).toContain("min-[1001px]:grid");
	});

	it("renders nothing when the selected market has no spot social metadata", () => {
		act(() => root.render(createElement(SpotMarketSocialLinks, { socials: null })));

		expect(container.firstElementChild).toBeNull();
	});

	it("renders compact links without hover tooltips for the mobile market details row", () => {
		act(() =>
			root.render(
				createElement(SpotMarketSocialIconLinks, {
					socials: {
						displayName: "Lick",
						x: "https://x.com/lick_fun",
						telegram: "https://t.me/lickfun",
						website: "https://www.lick.fun/",
					},
					showTooltips: false,
					targetSize: "touch",
				}),
			),
		);

		expect(container.querySelectorAll("[data-tooltip]")).toHaveLength(0);
		const links = [...container.querySelectorAll("a")];
		expect(links.map((link) => link.getAttribute("aria-label"))).toEqual(["X", "Telegram", "Website"]);
		for (const link of links) {
			expect(link.className).toContain("size-11");
			expect(link.className).not.toContain("after:size-11");
			expect(link.querySelector("svg")?.getAttribute("class")).toContain("size-3.5");
		}
	});

	it("updates localized website labels without remounting the social links", () => {
		const websiteMessage = msg`Website`;
		i18n.loadAndActivate({ locale: "en", messages: { [websiteMessage.id]: "Website" } });
		act(() =>
			root.render(
				createElement(SpotMarketSocialIconLinks, {
					socials: {
						displayName: "Lick",
						website: "https://www.lick.fun/",
					},
				}),
			),
		);
		expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("Website");

		act(() => i18n.loadAndActivate({ locale: "zh", messages: { [websiteMessage.id]: "网站" } }));

		expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("网站");
	});
});
