// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradingViewChart } from "@/components/trade/chart/tradingview-chart";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";

const testState = vi.hoisted(() => ({
	datafeedOptions: [] as unknown[],
}));

vi.mock("@/lib/chart/load-tradingview", () => ({
	loadTradingViewScript: vi.fn(async () => {}),
}));

vi.mock("@/lib/chart/theme-colors", () => ({
	buildChartOverrides: () => ({}),
	getChartCssUrl: vi.fn(() => "/tradingview-theme.css"),
	getLoadingScreenColors: () => ({}),
	getToolbarBgColor: () => "#000",
}));

vi.mock("@/components/trade/chart/datafeed", () => ({
	createDatafeed: (options: unknown) => {
		testState.datafeedOptions.push(options);
		return {};
	},
}));

type MockWidget = {
	__setActiveSymbol: (symbol: string) => void;
	activeChart: ReturnType<typeof vi.fn>;
	applyOverrides: ReturnType<typeof vi.fn>;
	changeTheme: ReturnType<typeof vi.fn>;
	createButton: ReturnType<typeof vi.fn>;
	getTheme: ReturnType<typeof vi.fn>;
	headerReady: ReturnType<typeof vi.fn>;
	onChartReady: ReturnType<typeof vi.fn>;
	remove: ReturnType<typeof vi.fn>;
	setSymbol: ReturnType<typeof vi.fn>;
};

function createMockSubscription() {
	const callbacks: Array<() => void> = [];
	return {
		callbacks,
		subscribe: vi.fn((_obj: object | null, callback: () => void, singleshot?: boolean) => {
			const wrapped = singleshot
				? () => {
						const index = callbacks.indexOf(wrapped);
						if (index >= 0) callbacks.splice(index, 1);
						callback();
					}
				: callback;
			callbacks.push(wrapped);
		}),
		unsubscribe: vi.fn((_obj: object | null, callback: () => void) => {
			const index = callbacks.indexOf(callback);
			if (index >= 0) callbacks.splice(index, 1);
		}),
	};
}

function createMockWidget(options: { theme?: "light" | "dark" } = {}): MockWidget {
	let currentTheme = options.theme ?? "dark";
	let currentSymbol = (options as { symbol?: string }).symbol ?? "BTC";
	const symbolChanged = createMockSubscription();

	return {
		__setActiveSymbol: (symbol: string) => {
			currentSymbol = symbol;
		},
		activeChart: vi.fn(() => ({
			onSymbolChanged: vi.fn(() => symbolChanged),
			symbol: vi.fn(() => currentSymbol),
		})),
		applyOverrides: vi.fn(),
		changeTheme: vi.fn(async (nextTheme: "light" | "dark") => {
			currentTheme = nextTheme;
		}),
		createButton: vi.fn(() => document.createElement("button")),
		getTheme: vi.fn(() => currentTheme),
		headerReady: vi.fn(async () => {}),
		onChartReady: vi.fn((callback: () => void) => {
			queueMicrotask(callback);
		}),
		remove: vi.fn(),
		setSymbol: vi.fn((symbol: string, _interval: string, callback: () => void) => {
			currentSymbol = symbol;
			callback();
		}),
	};
}

async function flushChartEffects() {
	await act(async () => {
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
	});
}

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("TradingViewChart", () => {
	let container: HTMLDivElement;
	let root: Root;
	let widgets: MockWidget[];
	let widgetConstructor: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		testState.datafeedOptions = [];
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		widgets = [];
		widgetConstructor = vi.fn(function Widget(this: unknown, options: unknown) {
			void this;
			const widget = createMockWidget(options as { theme?: "light" | "dark" });
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

	it("defers symbol switching while the chart is inactive", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { active: false, symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(1);
		expect(widgets[0]?.setSymbol).not.toHaveBeenCalled();

		act(() => {
			root.render(createElement(TradingViewChart, { active: false, symbol: "ETH", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		expect(widgets[0]?.setSymbol).not.toHaveBeenCalled();

		act(() => {
			root.render(createElement(TradingViewChart, { active: true, symbol: "ETH", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(1);
		expect(widgets[0]?.setSymbol).toHaveBeenCalledTimes(1);
		expect(widgets[0]?.setSymbol).toHaveBeenCalledWith("ETH", "60", expect.any(Function));
	});

	it("does not show a fatal chart error when TradingView symbol switching is slow", async () => {
		vi.useFakeTimers();
		widgetConstructor.mockImplementation(function Widget(this: unknown, options: unknown) {
			void this;
			const widget = createMockWidget(options as { theme?: "light" | "dark" });
			widget.setSymbol.mockImplementation((symbol: string) => {
				widget.__setActiveSymbol(symbol);
			});
			widgets.push(widget);
			return widget;
		});

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "ETH", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		await act(async () => {
			vi.advanceTimersByTime(30_000);
			await Promise.resolve();
		});

		expect(widgetConstructor).toHaveBeenCalledTimes(1);
		expect(widgets[0]?.remove).not.toHaveBeenCalled();
		expect(widgets[0]?.setSymbol).toHaveBeenCalledTimes(1);
		expect(container.textContent).not.toContain("Something went wrong");
	});

	it("does not destroy the widget when TradingView readiness is delayed", async () => {
		vi.useFakeTimers();
		widgetConstructor.mockImplementation(function Widget(this: unknown, options: unknown) {
			void this;
			const widget = createMockWidget(options as { theme?: "light" | "dark" });
			widget.onChartReady.mockImplementation(() => {});
			widgets.push(widget);
			return widget;
		});

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		await act(async () => {
			vi.advanceTimersByTime(60_000);
			await Promise.resolve();
		});

		expect(widgetConstructor).toHaveBeenCalledTimes(1);
		expect(widgets[0]?.remove).not.toHaveBeenCalled();
		expect(container.textContent).not.toContain("Something went wrong");
	});

	it("changes the TradingView theme without rebuilding the iframe", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(1);
		const widget = widgets[0];
		expect(widget).toBeDefined();
		expect(widget?.changeTheme).not.toHaveBeenCalled();

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "light" }));
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(1);
		expect(widget?.remove).not.toHaveBeenCalled();
		expect(widget?.setSymbol).not.toHaveBeenCalled();
		expect(widget?.changeTheme).toHaveBeenCalledTimes(1);
		expect(widget?.changeTheme).toHaveBeenCalledWith("light");
		expect(widget?.applyOverrides).toHaveBeenCalledTimes(1);
	});

	it("ignores a stale async theme switch result", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		const widget = widgets[0];
		const pendingThemeSwitches: Array<() => void> = [];
		widget?.changeTheme.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					pendingThemeSwitches.push(resolve);
				}),
		);

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "light" }));
		});
		await flushChartEffects();

		expect(widget?.changeTheme).toHaveBeenCalledTimes(1);

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		expect(widget?.changeTheme).toHaveBeenCalledTimes(1);

		await act(async () => {
			pendingThemeSwitches[0]?.();
			await Promise.resolve();
		});

		expect(widget?.applyOverrides).not.toHaveBeenCalled();
	});

	it("uses a same-origin theme-aware static stylesheet instead of a blob URL", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledWith(
			expect.objectContaining({
				custom_css_url: "/tradingview-theme.css",
			}),
		);
		expect(widgetConstructor.mock.calls[0]?.[0]).not.toHaveProperty("toolbar_bg");
	});

	it("uses canonical market symbols for TradingView while preserving display metadata", async () => {
		const spotMarket = {
			kind: "spot",
			name: "@235",
			pairName: "ETH/USDH",
			markPx: "68.7000",
			szDecimals: 5,
		} as unknown as UnifiedMarketInfo;
		const perpMarket = {
			kind: "perp",
			name: "BTC",
			pairName: "BTC-USDC",
			markPx: "100000",
			szDecimals: 5,
		} as unknown as UnifiedMarketInfo;

		act(() => {
			root.render(
				createElement(TradingViewChart, {
					symbol: "@235",
					market: spotMarket,
					interval: "60",
					theme: "dark",
				}),
			);
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledWith(
			expect.objectContaining({
				symbol: "@235",
			}),
		);

		act(() => {
			root.render(
				createElement(TradingViewChart, {
					symbol: "BTC",
					market: perpMarket,
					interval: "60",
					theme: "dark",
				}),
			);
		});
		await flushChartEffects();

		expect(widgets[0]?.setSymbol).toHaveBeenCalledWith("BTC", "60", expect.any(Function));

		const options = testState.datafeedOptions[0] as {
			getSymbolInfo: (
				symbolName: string,
				coin: string,
			) => { name: string; ticker: string; pricescale?: number } | undefined;
		};

		expect(options.getSymbolInfo("@235", "@235")).toMatchObject({
			name: "ETH/USDH",
			ticker: "@235",
			pricescale: 100,
		});
		expect(options.getSymbolInfo("ETH/USDH", "ETH")).toMatchObject({
			name: "ETH/USDH",
			ticker: "@235",
			pricescale: 100,
		});
	});

	it("retries a stalled symbol switch without rebuilding the widget", async () => {
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
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(1);
		expect(widget?.remove).not.toHaveBeenCalled();
		expect(widget?.setSymbol).toHaveBeenCalledTimes(2);
		expect(widget?.setSymbol).toHaveBeenLastCalledWith("ETH", "60", expect.any(Function));
		expect(container.textContent).not.toContain("Something went wrong");
		expect(container.textContent).not.toContain("Retry");
	});

	it("cancels a pending symbol retry while the chart is inactive", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { active: true, symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		const widget = widgets[0];
		expect(widget).toBeDefined();
		widget?.setSymbol.mockImplementation(() => {});
		vi.useFakeTimers();

		act(() => {
			root.render(createElement(TradingViewChart, { active: true, symbol: "ETH", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();
		expect(widget?.setSymbol).toHaveBeenCalledTimes(1);

		act(() => {
			root.render(createElement(TradingViewChart, { active: false, symbol: "ETH", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		await act(async () => {
			vi.advanceTimersByTime(16_000);
			await Promise.resolve();
		});
		expect(widget?.setSymbol).toHaveBeenCalledTimes(1);

		act(() => {
			root.render(createElement(TradingViewChart, { active: true, symbol: "ETH", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(1);
		expect(widget?.remove).not.toHaveBeenCalled();
		expect(widget?.setSymbol).toHaveBeenCalledTimes(2);
	});

	it("shows a retry prompt when TradingView never applies the requested symbol", async () => {
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

		await act(async () => {
			vi.advanceTimersByTime(16_000);
			await Promise.resolve();
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(1);
		expect(widget?.remove).not.toHaveBeenCalled();
		expect(widget?.setSymbol).toHaveBeenCalledTimes(2);
		expect(container.textContent).toContain("Something went wrong");
		expect(container.textContent).toContain("Retry");
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

	it("accepts TradingView chart events as symbol switch completion", async () => {
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

		const symbolChanged = widget?.activeChart.mock.results[0]?.value.onSymbolChanged();
		widget?.__setActiveSymbol("ETH");
		symbolChanged?.callbacks[0]?.();

		await act(async () => {
			vi.advanceTimersByTime(4_000);
			await Promise.resolve();
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(1);
		expect(widget?.remove).not.toHaveBeenCalled();
		expect(container.textContent).not.toContain("Something went wrong");
	});

	it("ignores symbol change events for a different market", async () => {
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

		const symbolChanged = widget?.activeChart.mock.results[0]?.value.onSymbolChanged();
		symbolChanged?.callbacks[0]?.();

		await act(async () => {
			vi.advanceTimersByTime(8_000);
			await Promise.resolve();
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(1);
		expect(widget?.setSymbol).toHaveBeenCalledTimes(2);
		expect(container.textContent).not.toContain("Something went wrong");
	});

	it("ignores a setSymbol callback until the requested symbol is active", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		const widget = widgets[0];
		expect(widget).toBeDefined();
		let staleCallback: (() => void) | undefined;
		widget?.setSymbol.mockImplementation((_symbol: string, _interval: string, callback: () => void) => {
			staleCallback = callback;
		});
		vi.useFakeTimers();

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "ETH", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();
		staleCallback?.();

		await act(async () => {
			vi.advanceTimersByTime(8_000);
			await Promise.resolve();
		});
		await flushChartEffects();

		expect(widget?.setSymbol).toHaveBeenCalledTimes(2);
		expect(container.textContent).not.toContain("Something went wrong");
	});
});
