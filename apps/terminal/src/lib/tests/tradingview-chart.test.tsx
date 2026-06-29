// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradingViewChart } from "@/components/trade/chart/tradingview-chart";

vi.mock("@lingui/core/macro", () => ({
	t: (strings: TemplateStringsArray, ...values: unknown[]) =>
		strings.reduce((result, part, index) => `${result}${part}${values[index] ?? ""}`, ""),
}));

vi.mock("@/lib/chart/load-tradingview", () => ({
	loadTradingViewScript: vi.fn(async () => {}),
}));

vi.mock("@/lib/chart/theme-colors", () => ({
	buildChartOverrides: () => ({}),
	getChartCssUrl: vi.fn((theme: "light" | "dark") => `/tradingview-theme-${theme}.css`),
	getLoadingScreenColors: () => ({}),
	getToolbarBgColor: () => "#000",
}));

vi.mock("@/components/trade/chart/datafeed", () => ({
	createDatafeed: () => ({}),
}));

type MockWidget = {
	createButton: ReturnType<typeof vi.fn>;
	headerReady: ReturnType<typeof vi.fn>;
	onChartReady: ReturnType<typeof vi.fn>;
	remove: ReturnType<typeof vi.fn>;
	setSymbol: ReturnType<typeof vi.fn>;
};

function createMockWidget(): MockWidget {
	return {
		createButton: vi.fn(() => document.createElement("button")),
		headerReady: vi.fn(async () => {}),
		onChartReady: vi.fn((callback: () => void) => {
			queueMicrotask(callback);
		}),
		remove: vi.fn(),
		setSymbol: vi.fn((_symbol: string, _interval: string, callback: () => void) => callback()),
	};
}

async function flushChartEffects() {
	await act(async () => {
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
	});
}

describe("TradingViewChart", () => {
	let container: HTMLDivElement;
	let root: Root;
	let widgets: MockWidget[];
	let widgetConstructor: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		widgets = [];
		widgetConstructor = vi.fn(function Widget(this: unknown, _options: unknown) {
			void this;
			const widget = createMockWidget();
			widgets.push(widget);
			return widget;
		});
		Object.defineProperty(window, "TradingView", {
			configurable: true,
			value: { widget: widgetConstructor },
		});
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
		vi.restoreAllMocks();
		delete (window as { TradingView?: unknown }).TradingView;
	});

	it("reuses the widget and switches symbols without rebuilding the iframe", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(1);
		expect(widgets).toHaveLength(1);
		expect(widgets[0]?.setSymbol).not.toHaveBeenCalled();

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "ETH", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(1);
		expect(widgets[0]?.remove).not.toHaveBeenCalled();
		expect(widgets[0]?.setSymbol).toHaveBeenCalledTimes(1);
		expect(widgets[0]?.setSymbol).toHaveBeenCalledWith("ETH", "60", expect.any(Function));
	});

	it("uses a same-origin static stylesheet instead of a blob URL", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledWith(
			expect.objectContaining({
				custom_css_url: "/tradingview-theme-dark.css",
			}),
		);
	});

	it("retries a slow symbol switch without rebuilding the widget", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		const widget = widgets[0];
		expect(widget).toBeDefined();
		widget?.setSymbol.mockImplementation(() => {});
		vi.useFakeTimers();

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "ETH", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(1);
		expect(widget?.setSymbol).toHaveBeenCalledTimes(1);

		await act(async () => {
			vi.advanceTimersByTime(8_000);
			await Promise.resolve();
		});

		expect(widgetConstructor).toHaveBeenCalledTimes(1);
		expect(widget?.remove).not.toHaveBeenCalled();
		expect(widget?.setSymbol).toHaveBeenCalledTimes(2);
	});

	it("keeps the chart visible while a symbol switch is pending", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		const widget = widgets[0];
		expect(widget).toBeDefined();
		widget?.setSymbol.mockImplementation(() => {});

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "ETH", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		expect(container.textContent).not.toContain("Loading...");
		expect(container.textContent).not.toContain("ETH");
		expect(widget?.setSymbol).toHaveBeenCalledWith("ETH", "60", expect.any(Function));
	});
});
