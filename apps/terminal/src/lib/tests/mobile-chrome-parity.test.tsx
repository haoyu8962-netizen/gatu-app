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
import { describe, expect, it, vi } from "vitest";
import { sliderFrame, sliderTrack } from "@/components/trade/components/trade-slider-view";
import { AppShellSkeleton, MobileShellSkeleton } from "@/components/trade/layout/app-shell-skeleton";
import { book, bookFooter, bookHeader, bookMid } from "@/components/trade/mobile/mobile-book-chrome-view";
import { navInner, navItem, navLabel } from "@/components/trade/mobile/mobile-bottom-nav-view";
import {
	headerAccount,
	headerActions,
	headerBrand,
	headerInner,
	headerLanguage,
	headerSettings,
	headerTheme,
} from "@/components/trade/mobile/mobile-header-view";
import { MobileLoadingFallback } from "@/components/trade/mobile/mobile-loading-fallback";
import { marketGrid, marketPrice } from "@/components/trade/mobile/mobile-market-bar-view";
import { positionsTab, positionsTabs } from "@/components/trade/mobile/mobile-positions-tabs-view";
import { marketName } from "@/components/trade/mobile/mobile-token-selector-view";
import {
	ctaButton,
	ctaEmbeddedHeight,
	ctaEmbeddedPadding,
	ctaWrapper,
} from "@/components/trade/mobile/mobile-trade-cta-frame-view";
import { bookColumn, tradeEmbeddedContent, tradeSplit } from "@/components/trade/mobile/mobile-trade-frame-view";
import { sizeLabel, sizeValue } from "@/components/trade/mobile/mobile-trade-size-view";
import {
	option,
	optionControl,
	optionLabel,
	optionsGrid,
} from "@/components/trade/tradebox/trade-option-checkboxes-view";
import { sizeSliderRow } from "@/components/trade/tradebox/trade-size-slider-row-view";
import { MOBILE_NAV_ITEMS } from "@/config/nav";
import { MOBILE_POSITIONS_TABS } from "@/config/trade";
import {
	useGlobalSettingsActions,
	useMobileActiveTab,
	usePositionsActiveTab,
} from "@/stores/use-global-settings-store";

vi.mock("@/providers/exchange-scope", () => ({ useExchangeScope: () => ({ routeMarketName: undefined }) }));
const OWNERS: Record<string, string> = {
	headerSafeArea: "mobile/mobile-header-view.tsx",
	headerSurface: "mobile/mobile-header-view.tsx",
	headerBorder: "mobile/mobile-header-view.tsx",
	headerInner: "mobile/mobile-header-view.tsx",
	headerBrand: "mobile/mobile-header-view.tsx",
	headerLogo: "mobile/mobile-header-view.tsx",
	headerActions: "mobile/mobile-header-view.tsx",
	headerAccount: "mobile/mobile-header-view.tsx",
	headerTheme: "mobile/mobile-header-view.tsx",
	headerLanguage: "mobile/mobile-header-view.tsx",
	headerSettings: "mobile/mobile-header-view.tsx",
	buttonOutlineNeutralSm: "mobile/mobile-header-view.tsx",
	buttonIconGhostNeutralSm: "mobile/mobile-header-view.tsx",
	headerWalletFrame: "mobile/mobile-header-view.tsx",
	terminal: "mobile/mobile-terminal-frame-view.tsx",
	workspace: "mobile/mobile-terminal-frame-view.tsx",
	pageSurface: "mobile/mobile-terminal-frame-view.tsx",
	pageScroll: "mobile/mobile-terminal-frame-view.tsx",
	nav: "mobile/mobile-bottom-nav-view.tsx",
	navSafeArea: "mobile/mobile-bottom-nav-view.tsx",
	navInner: "mobile/mobile-bottom-nav-view.tsx",
	navItem: "mobile/mobile-bottom-nav-view.tsx",
	navLabel: "mobile/mobile-bottom-nav-view.tsx",
	positionsWrapper: "mobile/mobile-positions-tabs-view.tsx",
	positionsScroll: "mobile/mobile-positions-tabs-view.tsx",
	positionsTabs: "mobile/mobile-positions-tabs-view.tsx",
	positionsTab: "mobile/mobile-positions-tabs-view.tsx",
	positionsFade: "mobile/mobile-positions-tabs-view.tsx",
	marketBar: "mobile/mobile-market-bar-view.tsx",
	marketGrid: "mobile/mobile-market-bar-view.tsx",
	marketAsset: "mobile/mobile-market-bar-view.tsx",
	marketQuote: "mobile/mobile-market-bar-view.tsx",
	marketPrice: "mobile/mobile-market-bar-view.tsx",
	marketChange: "mobile/mobile-market-bar-view.tsx",
	marketExpand: "mobile/mobile-market-bar-view.tsx",
	marketSelector: "mobile/mobile-token-selector-view.tsx",
	marketName: "mobile/mobile-token-selector-view.tsx",
	marketBadge: "mobile/mobile-token-selector-view.tsx",
	tradeSplit: "mobile/mobile-trade-frame-view.tsx",
	bookColumn: "mobile/mobile-trade-frame-view.tsx",
	tradeScroll: "mobile/mobile-trade-frame-view.tsx",
	tradeEmbeddedContent: "mobile/mobile-trade-frame-view.tsx",
	tradeColumn: "mobile/mobile-trade-frame-view.tsx",
	tradeView: "mobile/mobile-trade-frame-view.tsx",
	ctaWrapper: "mobile/mobile-trade-cta-frame-view.tsx",
	ctaEmbeddedPadding: "mobile/mobile-trade-cta-frame-view.tsx",
	ctaButton: "mobile/mobile-trade-cta-frame-view.tsx",
	ctaEmbeddedHeight: "mobile/mobile-trade-cta-frame-view.tsx",
	ctaConnect: "mobile/mobile-trade-cta-frame-view.tsx",
	ctaConnectDark: "mobile/mobile-trade-cta-frame-view.tsx",
	buttonFilledBrandMd: "mobile/mobile-trade-cta-frame-view.tsx",
	summary: "mobile/mobile-trade-summary-view.tsx",
	summaryRow: "mobile/mobile-trade-summary-view.tsx",
	summaryCompactRow: "mobile/mobile-trade-summary-view.tsx",
	summaryLabel: "mobile/mobile-trade-summary-view.tsx",
	summaryValue: "mobile/mobile-trade-summary-view.tsx",
	available: "mobile/mobile-trade-available-view.tsx",
	orderControl: "mobile/mobile-trade-header-view.tsx",
	orderCaret: "mobile/mobile-trade-header-view.tsx",
	sizeFrame: "mobile/mobile-trade-size-view.tsx",
	sizeLabel: "mobile/mobile-trade-size-view.tsx",
	sizeValue: "mobile/mobile-trade-size-view.tsx",
	sizeUnit: "mobile/mobile-trade-size-view.tsx",
	sizeSliderRow: "tradebox/trade-size-slider-row-view.tsx",
	sizePercent: "mobile/mobile-trade-size-view.tsx",
	book: "mobile/mobile-book-chrome-view.tsx",
	bookHeader: "mobile/mobile-book-chrome-view.tsx",
	bookMid: "mobile/mobile-book-chrome-view.tsx",
	bookFooter: "mobile/mobile-book-chrome-view.tsx",
	sideMobile: "tradebox/side-toggle-view.tsx",
	option: "tradebox/trade-option-checkboxes-view.tsx",
	optionLabel: "tradebox/trade-option-checkboxes-view.tsx",
	optionControl: "tradebox/trade-option-checkboxes-view.tsx",
	sideBox: "tradebox/side-toggle-view.tsx",
	optionsGrid: "tradebox/trade-option-checkboxes-view.tsx",
	sliderFrame: "components/trade-slider-view.tsx",
	sliderTrack: "components/trade-slider-view.tsx",
};
const TEST_DIR = dirname(fileURLToPath(import.meta.url));

const sharedClasses = [
	["headerInner", "mobile/mobile-header.tsx", headerInner],
	["headerBrand", "mobile/mobile-header.tsx", headerBrand],
	["headerActions", "mobile/mobile-header.tsx", headerActions],
	["headerAccount", "mobile/mobile-header.tsx", headerAccount],
	["marketGrid", "mobile/mobile-market-bar.tsx", marketGrid],
	["marketName", "chart/token-selector-trigger.tsx", marketName],
	["marketPrice", "mobile/mobile-market-bar.tsx", marketPrice],
	["tradeSplit", "mobile/mobile-trade-order-split.tsx", tradeSplit],
	["bookColumn", "mobile/mobile-trade-order-split.tsx", bookColumn],
	["tradeEmbeddedContent", "mobile/mobile-trade-scroll-area.tsx", tradeEmbeddedContent],
	["book", "mobile/mobile-book-view.tsx", book],
	["bookHeader", "mobile/mobile-book-view.tsx", bookHeader],
	["bookMid", "mobile/mobile-book-view.tsx", bookMid],
	["bookFooter", "mobile/mobile-book-view.tsx", bookFooter],
	["sizeLabel", "mobile/mobile-trade-size-control.tsx", sizeLabel],
	["sizeValue", "mobile/mobile-trade-size-control.tsx", sizeValue],
	["sizeSliderRow", "mobile/mobile-trade-size-control.tsx", sizeSliderRow],
	["sliderFrame", "components/trade-slider-view.tsx", sliderFrame],
	["navInner", "mobile/mobile-bottom-nav.tsx", navInner],
] as const;

const composedClasses = [
	["sliderTrack", "components/trade-slider-view.tsx", sliderTrack],
	["optionsGrid", "tradebox/trade-option-checkboxes-view.tsx", optionsGrid],
	["option", "tradebox/trade-option-checkboxes.tsx", option],
	["optionControl", "tradebox/trade-option-checkboxes.tsx", optionControl],
	["optionLabel", "tradebox/trade-option-checkboxes.tsx", optionLabel],
	["ctaWrapper", "mobile/mobile-trade-view.tsx", ctaWrapper],
	["ctaEmbeddedPadding", "mobile/mobile-trade-view.tsx", ctaEmbeddedPadding],
	["ctaButton", "mobile/mobile-trade-view.tsx", ctaButton],
	["ctaEmbeddedHeight", "mobile/mobile-trade-view.tsx", ctaEmbeddedHeight],
	["positionsTabs", "mobile/mobile-positions-view.tsx", positionsTabs],
	["positionsTab", "mobile/mobile-positions-view.tsx", positionsTab],
	["navItem", "mobile/mobile-bottom-nav.tsx", navItem],
	["navLabel", "mobile/mobile-bottom-nav.tsx", navLabel],
	["headerTheme", "mobile/mobile-header.tsx", headerTheme],
	["headerLanguage", "mobile/mobile-header.tsx", headerLanguage],
	["headerSettings", "mobile/mobile-header.tsx", headerSettings],
] as const;

describe("mobile chrome parity", () => {
	it("keeps geometry constants in the views that own markup", () => {
		const container = document.createElement("div");
		container.innerHTML = renderToString(<MobileShellSkeleton />);
		const elements = Array.from(container.querySelectorAll<HTMLElement>("[class]"));
		for (const [key, , classes] of [...sharedClasses, ...composedClasses]) {
			const owner = OWNERS[key];
			const source = readFileSync(resolve(TEST_DIR, "../../components/trade", owner), "utf8");
			expect(source, key).toContain(`export const ${key}`);
			expect(
				elements.some((element) => classes.split(" ").every((token) => element.classList.contains(token))),
				key,
			).toBe(true);
		}
		expect(
			readFileSync(resolve(TEST_DIR, "../../components/trade/layout/app-shell-skeleton.tsx"), "utf8"),
		).not.toContain("mobileChrome");
	});
	it("uses descriptor sources, shared views, inert controls and no loading animation", () => {
		const source = readFileSync(resolve(TEST_DIR, "../../components/trade/layout/mobile-placeholders.ts"), "utf8");
		expect(source).toContain("MOBILE_POSITIONS_TABS.map");
		expect(source).toContain("MOBILE_NAV_ITEMS.map");
		expect(source).not.toMatch(/from ["'](?:@gatu\/ui|@lingui\/|@\/stores\/)/);
		const container = document.createElement("div");
		container.innerHTML = renderToString(<MobileShellSkeleton />);
		for (const entry of [...MOBILE_POSITIONS_TABS, ...MOBILE_NAV_ITEMS])
			expect(container.textContent).toContain(entry.label.message);
		for (const control of container.querySelectorAll("button,nav,a,input"))
			expect(control.closest("[inert]")).not.toBeNull();
		expect(container.querySelector('[class*="animate-"]')).toBeNull();
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
