// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChartPanel } from "@/components/trade/chart/chart-panel";

const testState = vi.hoisted(() => ({
	selectedMarket: undefined as { name: string } | undefined,
}));

vi.mock("@/lib/hyperliquid", () => ({
	useSelectedMarketInfo: () => ({ data: testState.selectedMarket }),
}));

vi.mock("@/lib/lazy", () => ({
	createLazyComponent: () =>
		function MockTradingViewChart({ locale }: { locale: string }) {
			return <div data-testid="tradingview-chart" data-locale={locale} />;
		},
}));

vi.mock("@/lib/performance/render-profile", () => ({
	useRenderCommitTrack: () => undefined,
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	useNumberFormatLocale: () => "en-US",
	useTheme: () => "light",
}));

describe("ChartPanel", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		testState.selectedMarket = undefined;
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("shows an explicit loading state while market or chart code is unavailable", () => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<ChartPanel />
				</I18nProvider>,
			),
		);

		const status = container.querySelector("output");
		expect(status).not.toBeNull();
		expect(status?.getAttribute("aria-live")).toBe("polite");
		expect(status?.textContent).toContain("Loading...");
	});

	it("maps the live app locale to the TradingView widget locale", () => {
		testState.selectedMarket = { name: "HYPE" };
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<ChartPanel />
				</I18nProvider>,
			),
		);
		expect(container.querySelector('[data-testid="tradingview-chart"]')?.getAttribute("data-locale")).toBe("en");

		act(() => i18n.loadAndActivate({ locale: "ar", messages: {} }));
		expect(container.querySelector('[data-testid="tradingview-chart"]')?.getAttribute("data-locale")).toBe("ar");

		act(() => i18n.loadAndActivate({ locale: "hi", messages: {} }));
		expect(container.querySelector('[data-testid="tradingview-chart"]')?.getAttribute("data-locale")).toBe("en");
	});
});
