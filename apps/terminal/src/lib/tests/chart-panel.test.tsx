// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChartPanel } from "@/components/trade/chart/chart-panel";

const testState = vi.hoisted(() => ({
	selectedMarket: undefined as { kind?: string; name: string } | undefined,
	fundingPreload: vi.fn(async () => undefined),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useSelectedMarketInfo: () => ({ data: testState.selectedMarket }),
}));

vi.mock("@/lib/lazy", () => ({
	createLazyComponent: () =>
		function MockTradingViewChart({ active, locale, symbol }: { active: boolean; locale: string; symbol: string }) {
			return (
				<div data-testid="tradingview-chart" data-active={String(active)} data-locale={locale} data-symbol={symbol} />
			);
		},
	createRetryableLazyComponent: () =>
		Object.assign(
			function MockFundingHistoryPanel({ active, market }: { active: boolean; market?: { name: string } }) {
				return <div data-testid="funding-history-panel" data-active={String(active)} data-market={market?.name} />;
			},
			{ preload: testState.fundingPreload },
		),
	LazyComponentLoadError: class LazyComponentLoadError extends Error {},
	preloadLazyComponents: async () => undefined,
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
		testState.fundingPreload.mockClear();
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

	function renderPanel(showFundingTab: boolean, active = true) {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<ChartPanel active={active} showFundingTab={showFundingTab} />
				</I18nProvider>,
			),
		);
	}

	function tradingView() {
		return container.querySelector<HTMLElement>('[data-testid="tradingview-chart"]');
	}

	function fundingPanel() {
		return container.querySelector<HTMLElement>('[data-testid="funding-history-panel"]');
	}

	function tab(name: string) {
		return Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
			(element) => element.textContent === name,
		);
	}

	it("keeps the mobile chart surface free of a view strip", () => {
		testState.selectedMarket = { kind: "perp", name: "BTC" };
		renderPanel(false);

		expect(container.querySelector('[role="tablist"]')).toBeNull();
		expect(container.firstElementChild?.className).toBe("h-full flex flex-col overflow-hidden");
		expect(container.firstElementChild?.firstElementChild).toBe(tradingView());
		expect(tradingView()?.dataset.active).toBe("true");
		expect(fundingPanel()).toBeNull();
	});

	it("switches a perpetual chart to funding while TradingView stays mounted and inactive", () => {
		testState.selectedMarket = { kind: "perp", name: "BTC" };
		renderPanel(true);
		const chart = tradingView();

		expect(container.querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe("Chart views");
		expect(Array.from(container.querySelectorAll('[role="tab"]')).map((element) => element.textContent)).toEqual([
			"Chart",
			"Funding",
		]);
		expect(fundingPanel()).toBeNull();

		act(() => tab("Funding")?.click());

		expect(tradingView()).toBe(chart);
		expect(chart?.dataset.active).toBe("false");
		const chartLayer = chart?.closest<HTMLElement>("[data-chart-layer]");
		expect(chartLayer?.getAttribute("aria-hidden")).toBe("true");
		expect(chartLayer?.className).toContain("invisible");
		expect(chartLayer?.classList.contains("hidden")).toBe(false);
		expect(chartLayer?.hidden).toBe(false);
		expect(fundingPanel()?.dataset.active).toBe("true");
		expect(fundingPanel()?.dataset.market).toBe("BTC");
		const fundingLayer = fundingPanel()?.closest<HTMLElement>("[data-funding-layer]");
		expect(tab("Funding")?.getAttribute("aria-controls")).toBe(fundingLayer?.id);
		expect(fundingLayer?.getAttribute("aria-labelledby")).toBe(tab("Funding")?.id);
		expect(tab("Chart")?.getAttribute("aria-controls")).toBe(chartLayer?.id);

		const funding = fundingPanel();
		act(() => tab("Chart")?.click());

		expect(tradingView()).toBe(chart);
		expect(chart?.dataset.active).toBe("true");
		expect(fundingPanel()).toBe(funding);
		expect(funding?.dataset.active).toBe("false");
		expect(funding?.closest("[data-funding-layer]")?.getAttribute("aria-hidden")).toBe("true");
	});

	it("keeps TradingView inactive on the funding view while the surface is hidden", () => {
		testState.selectedMarket = { kind: "builderPerp", name: "xyz:AAPL" };
		renderPanel(true);
		act(() => tab("Funding")?.click());
		renderPanel(true, false);

		expect(tradingView()?.dataset.active).toBe("false");
		expect(fundingPanel()?.dataset.active).toBe("false");
		expect(fundingPanel()?.dataset.market).toBe("xyz:AAPL");
	});

	it("renders the same strip with only Chart for spot and unknown markets", () => {
		renderPanel(true);
		expect(container.querySelector('[role="tablist"]')).not.toBeNull();
		expect(Array.from(container.querySelectorAll('[role="tab"]')).map((element) => element.textContent)).toEqual([
			"Chart",
		]);

		testState.selectedMarket = { kind: "spot", name: "@107" };
		renderPanel(true);
		expect(Array.from(container.querySelectorAll('[role="tab"]')).map((element) => element.textContent)).toEqual([
			"Chart",
		]);
		expect(tradingView()?.dataset.active).toBe("true");
	});

	it("falls back to the chart when the market changes to spot on the funding view", () => {
		testState.selectedMarket = { kind: "perp", name: "BTC" };
		renderPanel(true);
		act(() => tab("Funding")?.click());
		const chart = tradingView();

		testState.selectedMarket = { kind: "spot", name: "@107" };
		renderPanel(true);

		expect(tab("Funding")).toBeUndefined();
		expect(tradingView()).toBe(chart);
		expect(chart?.dataset.active).toBe("true");
		expect(chart?.dataset.symbol).toBe("@107");
		expect(fundingPanel()?.dataset.active).toBe("false");
	});

	it("warms the funding chunk when the pointer or focus reaches its tab", () => {
		testState.selectedMarket = { kind: "perp", name: "BTC" };
		renderPanel(true);

		act(() => {
			tab("Funding")?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
		});

		expect(testState.fundingPreload).toHaveBeenCalled();
		expect(fundingPanel()).toBeNull();
	});
});
