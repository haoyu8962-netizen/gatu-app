/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setupI18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppShellSkeleton, MobileShellSkeleton } from "@/components/trade/layout/app-shell-skeleton";
import * as chrome from "@/components/trade/mobile/mobile-chrome-classes";
import { MobileLoadingFallback } from "@/components/trade/mobile/mobile-loading-fallback";
import { MOBILE_NAV_ITEMS } from "@/config/nav";
import { MOBILE_POSITIONS_TABS } from "@/config/trade";
import {
	useGlobalSettingsActions,
	useMobileActiveTab,
	usePositionsActiveTab,
} from "@/stores/use-global-settings-store";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

const sharedClasses = [
	["headerInner", "mobile/mobile-header.tsx", chrome.headerInner],
	["headerBrand", "mobile/mobile-header.tsx", chrome.headerBrand],
	["headerActions", "mobile/mobile-header.tsx", chrome.headerActions],
	["headerAccount", "mobile/mobile-header.tsx", chrome.headerAccount],
	["marketGrid", "mobile/mobile-market-bar.tsx", chrome.marketGrid],
	["marketName", "chart/token-selector-trigger.tsx", chrome.marketName],
	["marketPrice", "mobile/mobile-market-bar.tsx", chrome.marketPrice],
	["tradeSplit", "mobile/mobile-trade-order-split.tsx", chrome.tradeSplit],
	["bookColumn", "mobile/mobile-trade-order-split.tsx", chrome.bookColumn],
	["tradeEmbeddedContent", "mobile/mobile-trade-scroll-area.tsx", chrome.tradeEmbeddedContent],
	["book", "mobile/mobile-book-view.tsx", chrome.book],
	["bookHeader", "mobile/mobile-book-view.tsx", chrome.bookHeader],
	["bookMid", "mobile/mobile-book-view.tsx", chrome.bookMid],
	["bookFooter", "mobile/mobile-book-view.tsx", chrome.bookFooter],
	["sizeLabel", "mobile/mobile-trade-size-control.tsx", chrome.sizeLabel],
	["sizeValue", "mobile/mobile-trade-size-control.tsx", chrome.sizeValue],
	["sizeSliderRow", "mobile/mobile-trade-size-control.tsx", chrome.sizeSliderRow],
	["sliderFrame", "components/trade-slider.tsx", chrome.sliderFrame],
	["navInner", "mobile/mobile-bottom-nav.tsx", chrome.navInner],
] as const;

const composedClasses = [
	["sliderTrack", "components/trade-slider.tsx", chrome.sliderTrack],
	["optionsGrid", "tradebox/trade-option-checkboxes.tsx", chrome.optionsGrid],
	["option", "tradebox/trade-option-checkboxes.tsx", chrome.option],
	["optionControl", "tradebox/trade-option-checkboxes.tsx", chrome.optionControl],
	["optionLabel", "tradebox/trade-option-checkboxes.tsx", chrome.optionLabel],
	["ctaWrapper", "mobile/mobile-trade-view.tsx", chrome.ctaWrapper],
	["ctaEmbeddedPadding", "mobile/mobile-trade-view.tsx", chrome.ctaEmbeddedPadding],
	["ctaButton", "mobile/mobile-trade-view.tsx", chrome.ctaButton],
	["ctaEmbeddedHeight", "mobile/mobile-trade-view.tsx", chrome.ctaEmbeddedHeight],
	["positionsTabs", "mobile/mobile-positions-view.tsx", chrome.positionsTabs],
	["positionsTab", "mobile/mobile-positions-view.tsx", chrome.positionsTab],
	["navItem", "mobile/mobile-bottom-nav.tsx", chrome.navItem],
	["navLabel", "mobile/mobile-bottom-nav.tsx", chrome.navLabel],
	["headerTheme", "mobile/mobile-header.tsx", chrome.headerTheme],
	["headerLanguage", "mobile/mobile-header.tsx", chrome.headerLanguage],
	["headerSettings", "mobile/mobile-header.tsx", chrome.headerSettings],
] as const;

describe("mobile chrome parity", () => {
	it("renders the shared class strings and keeps real components consuming those constants", () => {
		const container = document.createElement("div");
		container.innerHTML = renderToString(<MobileShellSkeleton />);
		const elements = Array.from(container.querySelectorAll<HTMLElement>("[class]"));
		for (const [key, file, classes] of sharedClasses) {
			expect(
				elements.some((element) => element.getAttribute("class") === classes),
				key,
			).toBe(true);
			const source = readFileSync(resolve(TEST_DIR, `../../components/trade/${file}`), "utf8");
			expect(source, key).toContain(`mobileChrome.${key}`);
			expect(source, key).not.toContain(`"${classes}"`);
		}
		for (const [key, file, classes] of composedClasses) {
			expect(
				elements.some((element) => classes.split(" ").every((token) => element.classList.contains(token))),
				key,
			).toBe(true);
			expect(readFileSync(resolve(TEST_DIR, `../../components/trade/${file}`), "utf8"), key).toContain(
				`mobileChrome.${key}`,
			);
		}
		const source = readFileSync(resolve(TEST_DIR, "../../components/trade/mobile/mobile-chrome-classes.ts"), "utf8");
		expect(source).not.toMatch(/\bimport\b|\bfunction\b|=>/);
	});

	it("uses the shared navigation sources without importing runtime UI into the shell", () => {
		const source = readFileSync(resolve(TEST_DIR, "../../components/trade/layout/app-shell-skeleton.tsx"), "utf8");
		expect(source).toContain("MOBILE_POSITIONS_TABS.map((tab) => tab.label.message)");
		expect(source).toContain("MOBILE_NAV_ITEMS.map");
		expect(source).not.toMatch(/from ["'](?:@gatu\/ui|@lingui\/|@\/stores\/)/);
		const html = renderToString(<MobileShellSkeleton />);
		for (const entry of [...MOBILE_POSITIONS_TABS, ...MOBILE_NAV_ITEMS]) {
			expect(html).toContain(entry.label.message);
		}
		expect(html).not.toMatch(/<(?:button|nav|a)\b|animate-|0\.00|20x|>Perp</);
	});

	it("updates runtime labels on locale switches while the startup shell stays English", () => {
		const i18n = setupI18n({ locale: "en", messages: { en: {} } });
		const descriptors = [
			msg`Connect Wallet`,
			msg`Available`,
			msg`Size`,
			msg`Price`,
			msg`Long`,
			msg`Short`,
			msg`Reduce Only`,
			msg`TP/SL`,
			msg`Liq. Price`,
			msg`Order Value`,
			msg`Margin Req.`,
			msg`Slippage`,
			msg`Est. Fee`,
			...MOBILE_POSITIONS_TABS.map((tab) => tab.label),
			...MOBILE_NAV_ITEMS.map((item) => item.label),
		];
		i18n.load("test", Object.fromEntries(descriptors.map((label, index) => [label.id, `translated-${index}`])));
		const container = document.createElement("div");
		const root = createRoot(container);
		try {
			act(() =>
				root.render(
					<I18nProvider i18n={i18n}>
						<MobileLoadingFallback />
					</I18nProvider>,
				),
			);
			const frame = container.querySelector("[data-shell-mobile]");
			const geometry = Array.from(container.querySelectorAll("[class]")).map((element) =>
				element.getAttribute("class"),
			);
			act(() => i18n.activate("test"));
			expect(container.querySelector("[data-shell-mobile]")).toBe(frame);
			for (const label of descriptors) expect(container.textContent).toContain(i18n._(label));
			expect(container.textContent).not.toContain("Connect Wallet");
			expect(Array.from(container.querySelectorAll("[class]")).map((element) => element.getAttribute("class"))).toEqual(
				geometry,
			);
			expect(renderToString(<AppShellSkeleton />)).toContain("Connect Wallet");
		} finally {
			act(() => root.unmount());
		}
	});

	it("follows persisted tab selections at runtime while the prerendered shell keeps its defaults", () => {
		let settings!: {
			positionsActiveTab: string;
			mobileActiveTab: string;
			actions: ReturnType<typeof useGlobalSettingsActions>;
		};
		function ReadSettings() {
			settings = {
				positionsActiveTab: usePositionsActiveTab(),
				mobileActiveTab: useMobileActiveTab(),
				actions: useGlobalSettingsActions(),
			};
			return null;
		}
		const i18n = setupI18n({ locale: "en", messages: { en: {} } });
		const container = document.createElement("div");
		const root = createRoot(container);
		function expectActiveTabs(surface: Element, positionsLabel: string, navLabel: string) {
			const tabs = surface.querySelector('[data-slot="mobile-positions-tabs"]');
			expect(tabs?.querySelectorAll("[data-active]")).toHaveLength(1);
			const activeTab = tabs?.querySelector("[data-active]");
			expect(activeTab?.textContent).toBe(positionsLabel);
			expect(activeTab?.querySelector(".bg-market-close-fg")).not.toBeNull();
			expect(tabs?.querySelectorAll(".bg-market-close-fg")).toHaveLength(1);
			const nav = surface.querySelector("[data-shell-mobile]")?.lastElementChild;
			expect(nav?.querySelectorAll(".text-trading-panel-fg")).toHaveLength(1);
			expect(nav?.querySelector(".text-trading-panel-fg")?.textContent).toBe(navLabel);
			expect(nav?.querySelectorAll(".font-bold")).toHaveLength(1);
			expect(nav?.querySelector(".font-bold")?.textContent).toBe(navLabel);
		}
		try {
			act(() => root.render(<ReadSettings />));
			act(() => root.render(null));
			settings.actions.setPositionsActiveTab("balances");
			settings.actions.setMobileActiveTab("account");
			act(() =>
				root.render(
					<I18nProvider i18n={i18n}>
						<MobileLoadingFallback />
					</I18nProvider>,
				),
			);
			expectActiveTabs(container, "Balances", "Account");
			const startup = document.createElement("div");
			startup.innerHTML = renderToString(<AppShellSkeleton />);
			expectActiveTabs(startup, "Positions", "Trade");
			act(() => {
				settings.actions.setPositionsActiveTab("unknown");
				settings.actions.setMobileActiveTab("markets");
			});
			expectActiveTabs(container, "Positions", "Markets");
			act(() => {
				settings.actions.setPositionsActiveTab("orders");
				settings.actions.setMobileActiveTab("unknown");
			});
			expectActiveTabs(container, "Orders", "Trade");
		} finally {
			act(() => root.unmount());
			settings.actions.setPositionsActiveTab(settings.positionsActiveTab);
			settings.actions.setMobileActiveTab(settings.mobileActiveTab);
		}
	});
});
