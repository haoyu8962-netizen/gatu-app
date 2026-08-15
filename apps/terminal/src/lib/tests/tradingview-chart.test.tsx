// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradingViewChart } from "@/components/trade/chart/tradingview-chart";
import { loadTradingViewScript } from "@/lib/chart/load-tradingview";
import { TradingViewOverlayController } from "@/lib/chart/tradingview-overlays";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";

const testState = vi.hoisted(() => ({
	datafeedDestroys: [] as ReturnType<typeof vi.fn>[],
	datafeedOptions: [] as unknown[],
	datafeedResets: [] as ReturnType<typeof vi.fn>[],
	reconnectListener: undefined as ((generation: number) => void) | undefined,
}));

vi.mock("@/lib/hyperliquid", () => ({
	subscribeWsReconnect: (listener: (generation: number) => void) => {
		testState.reconnectListener = listener;
		return () => {
			if (testState.reconnectListener === listener) testState.reconnectListener = undefined;
		};
	},
}));

vi.mock("@/components/trade/chart/use-tradingview-overlay-lines", () => ({
	useTradingViewOverlayLines: () => [],
}));

vi.mock("@/lib/chart/load-tradingview", () => ({
	loadTradingViewScript: vi.fn(async () => {}),
}));

vi.mock("@/lib/chart/theme-colors", () => ({
	buildChartOverrides: () => ({}),
	colorToHex: (color: string) => color,
	colorToRgba: (color: string, alpha: number) => `${color}:${alpha}`,
	getChartColors: () => ({ green: "green", red: "red", textSecondary: "secondary" }),
	getChartCssUrl: vi.fn((theme: "light" | "dark") => `/tradingview-theme-${theme}.css`),
	getLoadingScreenColors: () => ({}),
	getToolbarBgColor: () => "#000",
}));

vi.mock("@/components/trade/chart/datafeed", () => ({
	createDatafeed: (options: {
		onRealtimeReset?: () => void;
		getSymbolInfo?: (symbolName: string, coin: string) => { ticker: string } | undefined;
	}) => {
		testState.datafeedOptions.push(options);
		const destroy = vi.fn();
		const resetRealtimeCache = vi.fn(() => options.onRealtimeReset?.());
		testState.datafeedDestroys.push(destroy);
		testState.datafeedResets.push(resetRealtimeCache);
		return { destroy, resetRealtimeCache };
	},
}));

type MockWidget = {
	__emitDrawingEvent: (sourceId: string, eventType: MockDrawingEventType) => void;
	__setActiveSymbol: (symbol: string) => void;
	__getTheme: () => "light" | "dark";
	__setTheme: (theme: "light" | "dark") => void;
	activeChart: ReturnType<typeof vi.fn>;
	applyOverrides: ReturnType<typeof vi.fn>;
	changeTheme: ReturnType<typeof vi.fn>;
	createButton: ReturnType<typeof vi.fn>;
	getTheme: ReturnType<typeof vi.fn>;
	headerReady: ReturnType<typeof vi.fn>;
	onChartReady: ReturnType<typeof vi.fn>;
	remove: ReturnType<typeof vi.fn>;
	resetData: ReturnType<typeof vi.fn>;
	save: ReturnType<typeof vi.fn>;
	setSymbol: ReturnType<typeof vi.fn>;
	subscribe: ReturnType<typeof vi.fn>;
	unsubscribe: ReturnType<typeof vi.fn>;
};

type MockDrawingEventType = "click" | "move" | "remove";
type MockDrawingEventCallback = (sourceId: string, eventType: MockDrawingEventType) => void;

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
	const drawingEventCallbacks = new Set<MockDrawingEventCallback>();
	const resetData = vi.fn();
	let currentInterval = (options as { interval?: string }).interval ?? "60";

	return {
		__emitDrawingEvent: (sourceId, eventType) => {
			for (const callback of drawingEventCallbacks) callback(sourceId, eventType);
		},
		__setActiveSymbol: (symbol: string) => {
			currentSymbol = symbol;
		},
		__getTheme: () => currentTheme,
		__setTheme: (theme: "light" | "dark") => {
			currentTheme = theme;
		},
		activeChart: vi.fn(() => ({
			onSymbolChanged: vi.fn(() => symbolChanged),
			resetData,
			resolution: vi.fn(() => currentInterval),
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
		resetData,
		save: vi.fn((callback: (state: object) => void) =>
			callback({
				charts: [{ panes: [{ sources: [{ state: { interval: currentInterval, symbol: currentSymbol } }] }] }],
			}),
		),
		setSymbol: vi.fn((symbol: string, _interval: string, callback: () => void) => {
			currentSymbol = symbol;
			currentInterval = _interval;
			callback();
		}),
		subscribe: vi.fn((event: string, callback: MockDrawingEventCallback) => {
			if (event === "drawing_event") drawingEventCallbacks.add(callback);
		}),
		unsubscribe: vi.fn((event: string, callback: MockDrawingEventCallback) => {
			if (event === "drawing_event") drawingEventCallbacks.delete(callback);
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
		Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
		Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
		vi.mocked(loadTradingViewScript).mockReset().mockResolvedValue(undefined);
		testState.datafeedDestroys = [];
		testState.datafeedOptions = [];
		testState.datafeedResets = [];
		testState.reconnectListener = undefined;
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

	it("rebuilds the widget instead of switching symbols when an old overlay cannot be removed", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();
		const failedClear = vi.spyOn(TradingViewOverlayController.prototype, "clear").mockReturnValueOnce(false);

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "ETH", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		expect(failedClear).toHaveBeenCalled();
		expect(widgets[0]?.save).toHaveBeenCalledWith(expect.any(Function), { includeDrawings: true });
		expect(widgets[0]?.setSymbol).not.toHaveBeenCalled();
		expect(widgets[0]?.remove).toHaveBeenCalledOnce();
		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		expect(widgets[1]?.setSymbol).not.toHaveBeenCalled();
	});

	it("preserves chart state while rebuilding after a fatal overlay sync", async () => {
		let shouldFailClosed = false;
		const sync = vi.spyOn(TradingViewOverlayController.prototype, "sync").mockImplementation(() => {
			if (shouldFailClosed) {
				shouldFailClosed = false;
				return false;
			}
			return null;
		});

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();
		const savedState = { charts: [{ panes: [{ studies: ["Moving Average"], drawings: ["trend"] }] }] };
		widgets[0]?.activeChart.mockReturnValue({
			onSymbolChanged: vi.fn(() => createMockSubscription()),
			resetData: vi.fn(),
			resolution: vi.fn(() => "1D"),
			symbol: vi.fn(() => "BTC"),
		});
		widgets[0]?.save.mockImplementation((callback: (state: object) => void) => callback(savedState));
		shouldFailClosed = true;

		act(() => {
			root.render(
				createElement(TradingViewChart, {
					symbol: "BTC",
					interval: "60",
					theme: "dark",
					yAxisInside: true,
				}),
			);
		});
		await flushChartEffects();

		expect(sync).toHaveBeenCalled();
		expect(widgets[0]?.save).toHaveBeenCalledWith(expect.any(Function), { includeDrawings: true });
		expect(widgets[0]?.remove).toHaveBeenCalledOnce();
		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		expect(widgetConstructor).toHaveBeenLastCalledWith(
			expect.objectContaining({ interval: "1D", saved_data: savedState, symbol: "BTC" }),
		);
	});

	it("commits the initializing mask before removing a widget for a state-preserving rebuild", async () => {
		let failOverlaySync = false;
		vi.spyOn(TradingViewOverlayController.prototype, "sync").mockImplementation(() => {
			if (!failOverlaySync) return null;
			failOverlaySync = false;
			return false;
		});

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		let finishLoading: (() => void) | undefined;
		vi.mocked(loadTradingViewScript).mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					finishLoading = resolve;
				}),
		);
		let stateAtRemoval:
			| {
					ariaBusy: string | null | undefined;
					hasLoadingOutput: boolean;
					maskClassName: string | undefined;
			  }
			| undefined;
		widgets[0]?.remove.mockImplementationOnce(() => {
			stateAtRemoval = {
				ariaBusy: container.firstElementChild?.getAttribute("aria-busy"),
				hasLoadingOutput: container.querySelector("[data-chart-loading]") !== null,
				maskClassName: container.querySelector("[data-chart-initializing]")?.className,
			};
		});
		failOverlaySync = true;

		act(() => {
			root.render(
				createElement(TradingViewChart, {
					symbol: "BTC",
					interval: "60",
					theme: "dark",
					yAxisInside: true,
				}),
			);
		});
		await flushChartEffects();

		expect(stateAtRemoval).toEqual({
			ariaBusy: "true",
			hasLoadingOutput: true,
			maskClassName: expect.stringContaining("opacity-100"),
		});
		expect(widgetConstructor).toHaveBeenCalledOnce();

		act(() => finishLoading?.());
		await flushChartEffects();
		expect(widgetConstructor).toHaveBeenCalledTimes(2);
	});

	it("ignores an old ready callback after a state-preserving rebuild begins", async () => {
		const readyCallbacks: Array<() => void> = [];
		widgetConstructor.mockImplementation(function Widget(this: unknown, options: unknown) {
			void this;
			const widget = createMockWidget(options as { theme?: "light" | "dark" });
			widget.onChartReady.mockImplementation((callback: () => void) => {
				readyCallbacks.push(callback);
			});
			widgets.push(widget);
			return widget;
		});

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "en" }));
		});
		await flushChartEffects();
		act(() => readyCallbacks[0]?.());
		await flushChartEffects();

		let finishSave: ((state: object) => void) | undefined;
		widgets[0]?.save.mockImplementation((callback: (state: object) => void) => {
			finishSave = callback;
		});
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "zh" }));
		});
		await flushChartEffects();

		let finishLoading: (() => void) | undefined;
		vi.mocked(loadTradingViewScript).mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					finishLoading = resolve;
				}),
		);
		await act(async () => {
			finishSave?.({ charts: ["saved layout"] });
			readyCallbacks[0]?.();
			await Promise.resolve();
		});

		expect(widgets[0]?.remove).toHaveBeenCalledOnce();
		expect(container.firstElementChild?.getAttribute("aria-busy")).toBe("true");
		expect(container.querySelector("[data-chart-loading]")).not.toBeNull();

		act(() => finishLoading?.());
		await flushChartEffects();
		act(() => readyCallbacks[1]?.());
		await flushChartEffects();
		expect(container.firstElementChild?.getAttribute("aria-busy")).toBe("false");
	});

	it("closes a failed state-preserving rebuild with an explicit retry state", async () => {
		let failOverlaySync = false;
		vi.spyOn(TradingViewOverlayController.prototype, "sync").mockImplementation(() => {
			if (!failOverlaySync) return null;
			failOverlaySync = false;
			return false;
		});

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();
		vi.mocked(loadTradingViewScript)
			.mockRejectedValueOnce(new Error("rebuild load failed"))
			.mockRejectedValueOnce(new Error("rebuild retry failed"));
		failOverlaySync = true;

		act(() => {
			root.render(
				createElement(TradingViewChart, {
					symbol: "BTC",
					interval: "60",
					theme: "dark",
					yAxisInside: true,
				}),
			);
		});
		await flushChartEffects();
		await flushChartEffects();

		expect(loadTradingViewScript).toHaveBeenCalledTimes(3);
		expect(widgets[0]?.remove).toHaveBeenCalledOnce();
		expect(widgetConstructor).toHaveBeenCalledOnce();
		expect(container.textContent).toContain("Something went wrong");
		expect(container.textContent).toContain("Retry");
		expect(container.querySelector('[role="alert"]')).not.toBeNull();
		expect(container.querySelector("[data-chart-loading]")).toBeNull();
		expect(container.querySelector("[data-chart-initializing]")?.className).toContain("opacity-0");
		expect(container.firstElementChild?.getAttribute("aria-busy")).toBe("false");
	});

	it("keeps the latest requested interval when it changes during overlay state capture", async () => {
		let failOverlaySync = false;
		vi.spyOn(TradingViewOverlayController.prototype, "sync").mockImplementation(() => {
			if (!failOverlaySync) return null;
			failOverlaySync = false;
			return false;
		});

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();
		const widget = widgets[0];
		let finishSave: ((state: object) => void) | undefined;
		const savedState = { charts: ["BTC layout"] };
		widget?.save.mockImplementation((callback: (state: object) => void) => {
			finishSave = callback;
		});
		widget?.setSymbol.mockImplementation(() => {});
		failOverlaySync = true;

		act(() => {
			root.render(
				createElement(TradingViewChart, {
					symbol: "BTC",
					interval: "60",
					theme: "dark",
					yAxisInside: true,
				}),
			);
		});
		await flushChartEffects();
		expect(widgetConstructor).toHaveBeenCalledOnce();

		act(() => {
			root.render(
				createElement(TradingViewChart, {
					symbol: "BTC",
					interval: "15",
					theme: "dark",
					yAxisInside: true,
				}),
			);
		});
		await flushChartEffects();
		expect(widget?.setSymbol).not.toHaveBeenCalled();

		await act(async () => {
			finishSave?.(savedState);
			await Promise.resolve();
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		expect(widgetConstructor).toHaveBeenLastCalledWith(
			expect.objectContaining({ interval: "15", saved_data: savedState, symbol: "BTC" }),
		);
	});

	it("does not let an empty overlay sync reset the one-rebuild recovery budget", async () => {
		let overlayApiThrows = 0;
		const sync = vi.spyOn(TradingViewOverlayController.prototype, "sync").mockImplementation(() => {
			if (overlayApiThrows > 0) {
				overlayApiThrows -= 1;
				throw new Error("overlay API failed");
			}
			return null;
		});

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();
		overlayApiThrows = 1;

		act(() => {
			root.render(
				createElement(TradingViewChart, {
					symbol: "BTC",
					interval: "60",
					theme: "dark",
					yAxisInside: true,
				}),
			);
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		expect(widgets[0]?.remove).toHaveBeenCalledOnce();
		expect(widgets[1]?.remove).not.toHaveBeenCalled();

		overlayApiThrows = 1;
		act(() => {
			root.render(
				createElement(TradingViewChart, {
					symbol: "BTC",
					interval: "60",
					theme: "dark",
					yAxisInside: false,
				}),
			);
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		expect(widgets[1]?.remove).not.toHaveBeenCalled();
		const callsAfterDisable = sync.mock.calls.length;

		act(() => {
			root.render(
				createElement(TradingViewChart, {
					symbol: "BTC",
					interval: "60",
					theme: "dark",
					yAxisInside: true,
				}),
			);
		});
		await flushChartEffects();
		expect(sync).toHaveBeenCalledTimes(callsAfterDisable);

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "ETH", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		expect(widgets[1]?.setSymbol).toHaveBeenCalledWith("ETH", "60", expect.any(Function));
		expect(sync.mock.calls.length).toBeGreaterThan(callsAfterDisable);
	});

	it("resets the overlay recovery budget after a verified market switch", async () => {
		let overlayApiThrows = 0;
		vi.spyOn(TradingViewOverlayController.prototype, "sync").mockImplementation(() => {
			if (overlayApiThrows > 0) {
				overlayApiThrows -= 1;
				throw new Error("overlay API failed");
			}
			return null;
		});

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();
		overlayApiThrows = 1;
		act(() => {
			root.render(
				createElement(TradingViewChart, {
					symbol: "BTC",
					interval: "60",
					theme: "dark",
					yAxisInside: true,
				}),
			);
		});
		await flushChartEffects();
		expect(widgetConstructor).toHaveBeenCalledTimes(2);

		act(() => {
			root.render(
				createElement(TradingViewChart, {
					symbol: "ETH",
					interval: "60",
					theme: "dark",
					yAxisInside: true,
				}),
			);
		});
		await flushChartEffects();
		expect(widgets[1]?.setSymbol).toHaveBeenCalledWith("ETH", "60", expect.any(Function));

		overlayApiThrows = 1;
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "ETH", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(3);
		expect(widgets[1]?.remove).toHaveBeenCalledOnce();
		expect(widgetConstructor).toHaveBeenLastCalledWith(expect.objectContaining({ symbol: "ETH" }));
	});

	it("resets recovery when the target market changes while overlay state capture is pending", async () => {
		let overlayApiThrows = 0;
		vi.spyOn(TradingViewOverlayController.prototype, "sync").mockImplementation(() => {
			if (overlayApiThrows > 0) {
				overlayApiThrows -= 1;
				throw new Error("overlay API failed");
			}
			return null;
		});

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();
		let finishSave: ((state: object) => void) | undefined;
		widgets[0]?.save.mockImplementation((callback: (state: object) => void) => {
			finishSave = callback;
		});
		overlayApiThrows = 1;
		act(() => {
			root.render(
				createElement(TradingViewChart, {
					symbol: "BTC",
					interval: "60",
					theme: "dark",
					yAxisInside: true,
				}),
			);
		});
		await flushChartEffects();

		act(() => {
			root.render(
				createElement(TradingViewChart, {
					symbol: "ETH",
					interval: "60",
					theme: "dark",
					yAxisInside: true,
				}),
			);
		});
		await flushChartEffects();
		await act(async () => {
			finishSave?.({ charts: ["BTC layout"] });
			await Promise.resolve();
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		expect(widgetConstructor).toHaveBeenLastCalledWith(expect.objectContaining({ symbol: "ETH" }));
		expect(widgetConstructor).toHaveBeenLastCalledWith(expect.not.objectContaining({ saved_data: expect.anything() }));

		overlayApiThrows = 1;
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "ETH", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();
		expect(widgetConstructor).toHaveBeenCalledTimes(3);
	});

	it("uses one sanitize rebuild when a second fatal overlay cannot remove stale drawings", async () => {
		let fatalSyncs = 0;
		const sync = vi.spyOn(TradingViewOverlayController.prototype, "sync").mockImplementation(() => {
			if (fatalSyncs > 0) {
				fatalSyncs -= 1;
				return false;
			}
			return null;
		});

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "en" }));
		});
		await flushChartEffects();
		fatalSyncs = 1;
		act(() => {
			root.render(
				createElement(TradingViewChart, {
					symbol: "BTC",
					interval: "60",
					theme: "dark",
					locale: "en",
					yAxisInside: true,
				}),
			);
		});
		await flushChartEffects();
		expect(widgetConstructor).toHaveBeenCalledTimes(2);

		vi.spyOn(TradingViewOverlayController.prototype, "clear").mockReturnValueOnce(false);
		fatalSyncs = 1;
		act(() => {
			root.render(
				createElement(TradingViewChart, {
					symbol: "BTC",
					interval: "60",
					theme: "dark",
					locale: "en",
					yAxisInside: false,
				}),
			);
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(3);
		expect(widgets[1]?.remove).toHaveBeenCalledOnce();
		expect(widgets[2]?.remove).not.toHaveBeenCalled();
		const callsAfterSanitize = sync.mock.calls.length;

		act(() => {
			root.render(
				createElement(TradingViewChart, {
					symbol: "BTC",
					interval: "60",
					theme: "dark",
					locale: "zh",
					yAxisInside: true,
				}),
			);
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(4);
		expect(sync).toHaveBeenCalledTimes(callsAfterSanitize);
		expect(widgets[3]?.remove).not.toHaveBeenCalled();
	});

	it("sanitizes a consumed recovery when overlay cleanup fails during a market switch", async () => {
		let fatalSyncs = 0;
		vi.spyOn(TradingViewOverlayController.prototype, "sync").mockImplementation(() => {
			if (fatalSyncs > 0) {
				fatalSyncs -= 1;
				return false;
			}
			return null;
		});

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();
		fatalSyncs = 1;
		act(() => {
			root.render(
				createElement(TradingViewChart, {
					symbol: "BTC",
					interval: "60",
					theme: "dark",
					yAxisInside: true,
				}),
			);
		});
		await flushChartEffects();
		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		const symbolCallsBeforeSwitch = widgets[1]?.setSymbol.mock.calls.length ?? 0;

		vi.spyOn(TradingViewOverlayController.prototype, "clear").mockReturnValueOnce(false);
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "ETH", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		expect(widgets[1]?.setSymbol).toHaveBeenCalledTimes(symbolCallsBeforeSwitch);
		expect(widgetConstructor).toHaveBeenCalledTimes(3);
		expect(widgetConstructor).toHaveBeenLastCalledWith(expect.objectContaining({ symbol: "ETH" }));
		expect(widgets[2]?.remove).not.toHaveBeenCalled();
	});

	it("recreates a managed overlay after TradingView reports that its drawing was removed", async () => {
		const sync = vi.spyOn(TradingViewOverlayController.prototype, "sync").mockReturnValue(null);
		const handleDrawingRemoved = vi
			.spyOn(TradingViewOverlayController.prototype, "handleDrawingRemoved")
			.mockReturnValue(true);

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "en" }));
		});
		await flushChartEffects();
		const widget = widgets[0];
		const callsBeforeRemoval = sync.mock.calls.length;

		act(() => widget?.__emitDrawingEvent("shape-1", "remove"));
		await flushChartEffects();

		expect(handleDrawingRemoved).toHaveBeenCalledWith("shape-1");
		expect(sync.mock.calls.length).toBeGreaterThan(callsBeforeRemoval);
		const callsAfterRemoval = sync.mock.calls.length;
		act(() => widget?.__emitDrawingEvent("shape-1", "move"));
		await flushChartEffects();
		expect(handleDrawingRemoved).toHaveBeenCalledOnce();
		expect(sync).toHaveBeenCalledTimes(callsAfterRemoval);

		widget?.unsubscribe.mockImplementation(() => {});
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "zh" }));
		});
		await flushChartEffects();
		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		handleDrawingRemoved.mockClear();
		act(() => widget?.__emitDrawingEvent("shape-1", "remove"));
		await flushChartEffects();
		expect(handleDrawingRemoved).not.toHaveBeenCalled();
		expect(widget?.unsubscribe).toHaveBeenCalledWith("drawing_event", expect.any(Function));
	});

	it("automatically retries a failed overlay creation without waiting for another render", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000);
		let mayRecover = false;
		const sync = vi
			.spyOn(TradingViewOverlayController.prototype, "sync")
			.mockImplementation(() => (mayRecover ? null : 2_000));

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();
		const callsBeforeRetry = sync.mock.calls.length;
		expect(callsBeforeRetry).toBeGreaterThan(0);

		mayRecover = true;
		await act(async () => {
			vi.advanceTimersByTime(1_000);
			await Promise.resolve();
		});

		expect(sync.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
		expect(widgetConstructor).toHaveBeenCalledOnce();
	});

	it("destroys the datafeed even when widget removal throws", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		expect(testState.datafeedDestroys).toHaveLength(1);
		widgets[0]?.remove.mockImplementationOnce(() => {
			throw new Error("remove failed");
		});

		act(() => {
			root.render(createElement("div"));
		});

		expect(widgets[0]?.remove).toHaveBeenCalledOnce();
		expect(testState.datafeedDestroys[0]).toHaveBeenCalledOnce();
	});

	it("resolves TradingView HIP-3 display variants to the canonical market ticker", async () => {
		const market = {
			kind: "builderPerp",
			name: "xyz:CXMT",
			pairName: "CXMT-USDC",
			quoteToken: { displayName: "USDC", name: "USDC" },
			szDecimals: 2,
			markPx: "12.34",
		} as UnifiedMarketInfo;

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: market.name, market, interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		const options = testState.datafeedOptions[0] as {
			getSymbolInfo?: (symbolName: string, coin: string) => { ticker: string } | undefined;
		};
		expect(options.getSymbolInfo?.("HYPERLIQUID:CXMT-USDC", "CXMT")?.ticker).toBe("xyz:CXMT");
		expect(options.getSymbolInfo?.("XYZ:CXMT", "XYZ:CXMT")?.ticker).toBe("xyz:CXMT");
		expect(options.getSymbolInfo?.("CXMT", "CXMT")).toBeUndefined();
	});

	it("backfills TradingView data after a shared WebSocket reconnect without rebuilding the widget", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "HYPE", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		expect(testState.reconnectListener).toBeTypeOf("function");
		expect(testState.datafeedResets).toHaveLength(1);

		act(() => testState.reconnectListener?.(1));
		await flushChartEffects();

		expect(testState.datafeedResets[0]).toHaveBeenCalledTimes(1);
		expect(widgets[0]?.resetData).toHaveBeenCalledTimes(1);
		expect(widgets[0]?.remove).not.toHaveBeenCalled();
		expect(widgetConstructor).toHaveBeenCalledTimes(1);
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

	it("recreates a widget once when TradingView readiness stalls, then shows an explicit retry", async () => {
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
			vi.advanceTimersByTime(15_000);
			await Promise.resolve();
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		expect(widgets[0]?.remove).toHaveBeenCalledOnce();
		expect(widgets[1]?.remove).not.toHaveBeenCalled();
		expect(container.textContent).toContain("Loading...");
		expect(container.textContent).not.toContain("Retry");

		await act(async () => {
			vi.advanceTimersByTime(15_000);
			await Promise.resolve();
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		expect(widgets[1]?.remove).toHaveBeenCalledOnce();
		expect(container.textContent).toContain("Something went wrong");
		expect(container.textContent).toContain("Retry");
		expect(container.firstElementChild?.getAttribute("aria-busy")).toBe("false");
	});

	it("keeps a stable background mask until TradingView is ready", async () => {
		let readyCallback: (() => void) | undefined;
		widgetConstructor.mockImplementation(function Widget(this: unknown, options: unknown) {
			void this;
			const widget = createMockWidget(options as { theme?: "light" | "dark" });
			widget.onChartReady.mockImplementation((callback: () => void) => {
				readyCallback = callback;
			});
			widgets.push(widget);
			return widget;
		});

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		const mask = container.querySelector("[data-chart-initializing]");
		expect(container.querySelector("[data-chart-loading]")).not.toBeNull();
		expect(container.textContent).toContain("Loading...");
		expect(mask?.className).toContain("bg-background");
		expect(mask?.className).toContain("opacity-100");
		expect(container.firstElementChild?.getAttribute("aria-busy")).toBe("true");

		act(() => readyCallback?.());
		await flushChartEffects();

		expect(mask?.className).toContain("opacity-0");
		expect(container.querySelector("[data-chart-loading]")).toBeNull();
		expect(container.firstElementChild?.getAttribute("aria-busy")).toBe("false");
		expect(widgets[0]?.remove).not.toHaveBeenCalled();
	});

	it("restores the stable background mask when retrying after initialization fails", async () => {
		let keepRetryPending: (() => void) | undefined;
		vi.mocked(loadTradingViewScript)
			.mockRejectedValueOnce(new Error("script load failed"))
			.mockRejectedValueOnce(new Error("script load failed again"))
			.mockImplementationOnce(
				() =>
					new Promise<void>((resolve) => {
						keepRetryPending = resolve;
					}),
			);

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		const chart = container.firstElementChild;
		const mask = container.querySelector("[data-chart-initializing]");
		const retry = [...container.querySelectorAll("button")].find((button) => button.textContent === "Retry");
		expect(mask?.className).toContain("opacity-0");
		expect(chart?.getAttribute("aria-busy")).toBe("false");

		act(() => retry?.click());
		await act(async () => Promise.resolve());

		expect(loadTradingViewScript).toHaveBeenCalledTimes(3);
		expect(mask?.className).toContain("opacity-100");
		expect(chart?.getAttribute("aria-busy")).toBe("true");

		act(() => keepRetryPending?.());
		await flushChartEffects();
	});

	it("automatically retries a script-loader failure once and recovers", async () => {
		vi.mocked(loadTradingViewScript)
			.mockRejectedValueOnce(new Error("script load failed"))
			.mockResolvedValue(undefined);

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();
		await flushChartEffects();

		expect(loadTradingViewScript).toHaveBeenCalledTimes(2);
		expect(widgetConstructor).toHaveBeenCalledOnce();
		expect(container.textContent).not.toContain("Something went wrong");
	});

	it("automatically retries a widget-constructor exception once and recovers", async () => {
		widgetConstructor.mockImplementationOnce(function FailedWidget(this: unknown) {
			void this;
			throw new Error("constructor failed");
		});

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		expect(widgets).toHaveLength(1);
		expect(container.textContent).not.toContain("Something went wrong");
	});

	it("does not silently hang when the loader resolves without exposing TradingView", async () => {
		delete (window as { TradingView?: unknown }).TradingView;

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();
		await flushChartEffects();

		expect(loadTradingViewScript).toHaveBeenCalledTimes(2);
		expect(widgetConstructor).not.toHaveBeenCalled();
		expect(container.textContent).toContain("Something went wrong");
		expect(container.textContent).toContain("Retry");
	});

	it("pauses the readiness deadline while the page is hidden", async () => {
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
			vi.advanceTimersByTime(5_000);
			Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
			document.dispatchEvent(new Event("visibilitychange"));
			vi.advanceTimersByTime(60_000);
			await Promise.resolve();
		});
		expect(widgetConstructor).toHaveBeenCalledOnce();
		expect(widgets[0]?.remove).not.toHaveBeenCalled();

		await act(async () => {
			Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
			document.dispatchEvent(new Event("visibilitychange"));
			vi.advanceTimersByTime(10_000);
			await Promise.resolve();
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		expect(widgets[0]?.remove).toHaveBeenCalledOnce();
	});

	it("pauses the readiness deadline while the browser is offline", async () => {
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
			vi.advanceTimersByTime(3_000);
			Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
			window.dispatchEvent(new Event("offline"));
			vi.advanceTimersByTime(60_000);
			await Promise.resolve();
		});
		expect(widgetConstructor).toHaveBeenCalledOnce();
		expect(widgets[0]?.remove).not.toHaveBeenCalled();

		await act(async () => {
			Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
			window.dispatchEvent(new Event("online"));
			vi.advanceTimersByTime(12_000);
			await Promise.resolve();
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		expect(widgets[0]?.remove).toHaveBeenCalledOnce();
	});

	it("ignores a late ready callback from a widget that the watchdog replaced", async () => {
		vi.useFakeTimers();
		const readyCallbacks: Array<() => void> = [];
		widgetConstructor.mockImplementation(function Widget(this: unknown, options: unknown) {
			void this;
			const widget = createMockWidget(options as { theme?: "light" | "dark" });
			widget.onChartReady.mockImplementation((callback: () => void) => {
				readyCallbacks.push(callback);
			});
			widgets.push(widget);
			return widget;
		});

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		await act(async () => {
			vi.advanceTimersByTime(15_000);
			await Promise.resolve();
		});
		await flushChartEffects();
		expect(widgetConstructor).toHaveBeenCalledTimes(2);

		act(() => readyCallbacks[0]?.());
		await flushChartEffects();
		expect(container.firstElementChild?.getAttribute("aria-busy")).toBe("true");
		expect(container.querySelector("[data-chart-loading]")).not.toBeNull();

		act(() => readyCallbacks[1]?.());
		await flushChartEffects();
		expect(container.firstElementChild?.getAttribute("aria-busy")).toBe("false");
		expect(container.querySelector("[data-chart-loading]")).toBeNull();
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
		expect(widget?.changeTheme).toHaveBeenCalledWith("light", { disableUndo: true });
		expect(widget?.applyOverrides).toHaveBeenCalledTimes(1);
	});

	it("defers overlay synchronization until an in-flight theme switch has unlocked", async () => {
		const sync = vi.spyOn(TradingViewOverlayController.prototype, "sync").mockReturnValue(null);
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		const widget = widgets[0];
		let resolveTheme: (() => void) | undefined;
		widget?.changeTheme.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveTheme = resolve;
				}),
		);
		const callsBeforeThemeSwitch = sync.mock.calls.length;

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "light" }));
		});
		await flushChartEffects();

		expect(sync).toHaveBeenCalledTimes(callsBeforeThemeSwitch);

		await act(async () => {
			widget?.__setTheme("light");
			resolveTheme?.();
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(sync).toHaveBeenCalledTimes(callsBeforeThemeSwitch + 1);
	});

	it("defers overlay cleanup and symbol changes until an in-flight theme switch unlocks", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		const widget = widgets[0];
		const clear = vi.spyOn(TradingViewOverlayController.prototype, "clear");
		let resolveTheme: (() => void) | undefined;
		widget?.changeTheme.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveTheme = resolve;
				}),
		);

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "ETH", interval: "15", theme: "light" }));
		});
		await flushChartEffects();

		expect(widget?.changeTheme).toHaveBeenCalledOnce();
		expect(clear).not.toHaveBeenCalled();
		expect(widget?.setSymbol).not.toHaveBeenCalled();

		await act(async () => {
			widget?.__setTheme("light");
			resolveTheme?.();
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(clear).toHaveBeenCalled();
		expect(widget?.setSymbol).toHaveBeenCalledWith("ETH", "15", expect.any(Function));
	});

	it("applies a deferred symbol after a stale theme switch rejects back to the current theme", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		const widget = widgets[0];
		let rejectTheme: ((error: Error) => void) | undefined;
		widget?.changeTheme.mockImplementation(
			() =>
				new Promise<void>((_resolve, reject) => {
					rejectTheme = reject;
				}),
		);
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "light" }));
		});
		await flushChartEffects();

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "ETH", interval: "15", theme: "dark" }));
		});
		await flushChartEffects();
		expect(widget?.setSymbol).not.toHaveBeenCalled();

		await act(async () => {
			rejectTheme?.(new Error("stale light theme failed"));
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(widget?.getTheme).toHaveBeenLastCalledWith();
		expect(widget?.setSymbol).toHaveBeenCalledWith("ETH", "15", expect.any(Function));
		expect(widgetConstructor).toHaveBeenCalledOnce();
	});

	it("serializes and coalesces rapid async theme switches", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		const widget = widgets[0];
		const pendingThemeSwitches: Array<{ resolve: () => void; theme: "light" | "dark" }> = [];
		widget?.changeTheme.mockImplementation(
			(nextTheme: "light" | "dark") =>
				new Promise<void>((resolve) => {
					pendingThemeSwitches.push({ resolve, theme: nextTheme });
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
			widget?.__setTheme(pendingThemeSwitches[0]?.theme ?? "light");
			pendingThemeSwitches[0]?.resolve();
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(widget?.applyOverrides).not.toHaveBeenCalled();
		expect(widget?.changeTheme).toHaveBeenCalledTimes(2);
		expect(widget?.changeTheme).toHaveBeenLastCalledWith("dark", { disableUndo: true });

		await act(async () => {
			widget?.__setTheme(pendingThemeSwitches[1]?.theme ?? "dark");
			pendingThemeSwitches[1]?.resolve();
			await Promise.resolve();
		});

		expect(widget?.applyOverrides).toHaveBeenCalledTimes(1);
	});

	it("retries a rejected theme switch once and applies the target theme", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		const widget = widgets[0];
		widget?.changeTheme
			.mockRejectedValueOnce(new Error("theme failed"))
			.mockImplementationOnce(async (nextTheme: "light" | "dark") => {
				widget.__setTheme(nextTheme);
			});

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "light" }));
		});
		await flushChartEffects();

		expect(widget?.changeTheme).toHaveBeenCalledTimes(2);
		expect(widget?.changeTheme).toHaveBeenNthCalledWith(1, "light", { disableUndo: true });
		expect(widget?.changeTheme).toHaveBeenNthCalledWith(2, "light", { disableUndo: true });
		expect(widget?.applyOverrides).toHaveBeenCalledOnce();
		expect(widget?.__getTheme()).toBe("light");
	});

	it("rebuilds the widget after two rejected theme switches", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		const widget = widgets[0];
		const savedState = { charts: [{ panes: [{ studies: ["Moving Average"], drawings: ["trend"] }] }] };
		widget?.activeChart.mockReturnValue({
			onSymbolChanged: vi.fn(() => createMockSubscription()),
			resetData: vi.fn(),
			resolution: vi.fn(() => "1D"),
			symbol: vi.fn(() => "BTC"),
		});
		widget?.save.mockImplementation((callback: (state: object) => void) => callback(savedState));
		widget?.changeTheme.mockRejectedValue(new Error("theme failed"));

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "light" }));
		});
		await flushChartEffects();

		expect(widget?.changeTheme).toHaveBeenCalledTimes(2);
		expect(widget?.applyOverrides).not.toHaveBeenCalled();
		expect(widget?.remove).toHaveBeenCalledOnce();
		expect(testState.datafeedDestroys[0]).toHaveBeenCalledOnce();
		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		expect(widgets[1]?.__getTheme()).toBe("light");
		expect(widgetConstructor).toHaveBeenLastCalledWith(
			expect.objectContaining({ interval: "1D", saved_data: savedState, symbol: "BTC", theme: "light" }),
		);
	});

	it("rebuilds a widget when a theme switch never settles and ignores its late completion", async () => {
		vi.useFakeTimers();
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		const widget = widgets[0];
		let resolveTheme: (() => void) | undefined;
		widget?.changeTheme.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveTheme = resolve;
				}),
		);

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "light" }));
		});
		await flushChartEffects();

		await act(async () => {
			vi.advanceTimersByTime(5_000);
			await Promise.resolve();
		});
		await flushChartEffects();

		expect(widget?.remove).toHaveBeenCalledOnce();
		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		expect(widgets[1]?.__getTheme()).toBe("light");

		await act(async () => {
			widget?.__setTheme("light");
			resolveTheme?.();
			await Promise.resolve();
		});

		expect(widget?.applyOverrides).not.toHaveBeenCalled();
		expect(widgets[1]?.remove).not.toHaveBeenCalled();
		expect(widgets[1]?.applyOverrides).toHaveBeenCalledOnce();
	});

	it("counts the theme timeout only while the page is visible and online", async () => {
		vi.useFakeTimers();
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		const widget = widgets[0];
		widget?.changeTheme.mockImplementation(() => new Promise<void>(() => {}));
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "light" }));
		});
		await flushChartEffects();

		await act(async () => {
			vi.advanceTimersByTime(1_000);
			Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
			document.dispatchEvent(new Event("visibilitychange"));
			vi.advanceTimersByTime(60_000);
			Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
			document.dispatchEvent(new Event("visibilitychange"));
			vi.advanceTimersByTime(1_000);
			Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
			window.dispatchEvent(new Event("offline"));
			vi.advanceTimersByTime(60_000);
			await Promise.resolve();
		});

		expect(widget?.remove).not.toHaveBeenCalled();
		expect(widgetConstructor).toHaveBeenCalledOnce();

		await act(async () => {
			Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
			window.dispatchEvent(new Event("online"));
			vi.advanceTimersByTime(2_999);
			await Promise.resolve();
		});
		expect(widgetConstructor).toHaveBeenCalledOnce();

		await act(async () => {
			vi.advanceTimersByTime(1);
			await Promise.resolve();
		});
		await flushChartEffects();

		expect(widget?.remove).toHaveBeenCalledOnce();
		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		expect(widgets[1]?.__getTheme()).toBe("light");
	});

	it("does not restore a theme-recovery snapshot into a newly selected market", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		const widget = widgets[0];
		let finishSave: ((state: object) => void) | undefined;
		widget?.save.mockImplementation((callback: (state: object) => void) => {
			finishSave = callback;
		});
		widget?.changeTheme.mockRejectedValue(new Error("theme failed"));

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "light" }));
		});
		await flushChartEffects();
		expect(widgetConstructor).toHaveBeenCalledOnce();

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "ETH", interval: "60", theme: "light" }));
		});
		await act(async () => {
			finishSave?.({ charts: ["BTC layout"] });
			await Promise.resolve();
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		expect(widgetConstructor).toHaveBeenLastCalledWith(expect.objectContaining({ symbol: "ETH", theme: "light" }));
		expect(widgetConstructor).toHaveBeenLastCalledWith(expect.not.objectContaining({ saved_data: expect.anything() }));
	});

	it("rebuilds after synchronous theme API failures", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		const widget = widgets[0];
		widget?.changeTheme.mockImplementation(() => {
			throw new Error("theme failed synchronously");
		});

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "light" }));
		});
		await flushChartEffects();

		expect(widget?.changeTheme).toHaveBeenCalledTimes(2);
		expect(widget?.remove).toHaveBeenCalledOnce();
		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		expect(widgets[1]?.__getTheme()).toBe("light");
	});

	it("rebuilds after synchronous theme inspection failures", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		const widget = widgets[0];
		widget?.getTheme.mockClear().mockImplementation(() => {
			throw new Error("theme inspection failed");
		});

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "light" }));
		});
		await flushChartEffects();

		expect(widget?.getTheme).toHaveBeenCalledTimes(2);
		expect(widget?.remove).toHaveBeenCalledOnce();
		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		expect(widgets[1]?.__getTheme()).toBe("light");
	});

	it("keeps an initialized inactive widget aligned with the latest theme", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { active: false, symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		const widget = widgets[0];
		act(() => {
			root.render(createElement(TradingViewChart, { active: false, symbol: "BTC", interval: "60", theme: "light" }));
		});
		await flushChartEffects();

		expect(widget?.changeTheme).toHaveBeenCalledOnce();
		expect(widget?.changeTheme).toHaveBeenCalledWith("light", { disableUndo: true });

		act(() => {
			root.render(createElement(TradingViewChart, { active: true, symbol: "BTC", interval: "60", theme: "light" }));
		});
		await flushChartEffects();

		expect(widget?.changeTheme).toHaveBeenCalledOnce();
	});

	it("applies custom overrides when an in-flight theme switch completes while inactive", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { active: true, symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		const widget = widgets[0];
		let resolveTheme: (() => void) | undefined;
		widget?.changeTheme.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveTheme = resolve;
				}),
		);

		act(() => {
			root.render(createElement(TradingViewChart, { active: true, symbol: "BTC", interval: "60", theme: "light" }));
		});
		await flushChartEffects();

		act(() => {
			root.render(createElement(TradingViewChart, { active: false, symbol: "BTC", interval: "60", theme: "light" }));
		});
		await flushChartEffects();

		await act(async () => {
			widget?.__setTheme("light");
			resolveTheme?.();
			await Promise.resolve();
		});
		expect(widget?.applyOverrides).toHaveBeenCalledOnce();

		act(() => {
			root.render(createElement(TradingViewChart, { active: true, symbol: "BTC", interval: "60", theme: "light" }));
		});
		await flushChartEffects();

		expect(widget?.changeTheme).toHaveBeenCalledOnce();
		expect(widget?.applyOverrides).toHaveBeenCalledOnce();
	});

	it("rebuilds the widget when the TradingView locale changes", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "en" }));
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledWith(expect.objectContaining({ locale: "en" }));

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "zh" }));
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		expect(widgets[0]?.remove).toHaveBeenCalledOnce();
		expect(testState.datafeedDestroys[0]).toHaveBeenCalledOnce();
		expect(widgetConstructor).toHaveBeenLastCalledWith(expect.objectContaining({ locale: "zh" }));
	});

	it("preserves the current chart layout and interval when the locale changes", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "en" }));
		});
		await flushChartEffects();

		const widget = widgets[0];
		const savedState = { charts: [{ panes: [{ studies: ["Moving Average"], drawings: ["trend"] }] }] };
		widget?.activeChart.mockReturnValue({
			onSymbolChanged: vi.fn(() => createMockSubscription()),
			resetData: vi.fn(),
			resolution: vi.fn(() => "1D"),
			symbol: vi.fn(() => "BTC"),
		});
		widget?.save.mockImplementation((callback: (state: object) => void) => callback(savedState));

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "zh" }));
		});
		await flushChartEffects();

		expect(widget?.save).toHaveBeenCalledWith(expect.any(Function), { includeDrawings: true });
		expect(widgetConstructor).toHaveBeenLastCalledWith(
			expect.objectContaining({ interval: "1D", locale: "zh", saved_data: savedState, symbol: "BTC" }),
		);
	});

	it("does not restore the previous market layout when market and locale change in one commit", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "en" }));
		});
		await flushChartEffects();
		const savedState = { charts: ["BTC layout"] };
		widgets[0]?.save.mockImplementation((callback: (state: object) => void) => callback(savedState));

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "ETH", interval: "60", theme: "dark", locale: "zh" }));
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		expect(widgetConstructor).toHaveBeenLastCalledWith(expect.objectContaining({ locale: "zh", symbol: "ETH" }));
		expect(widgetConstructor).toHaveBeenLastCalledWith(expect.not.objectContaining({ saved_data: expect.anything() }));
	});

	it("keeps the restored user interval across inactive and active transitions", async () => {
		act(() => {
			root.render(
				createElement(TradingViewChart, { active: true, symbol: "BTC", interval: "60", theme: "dark", locale: "en" }),
			);
		});
		await flushChartEffects();
		widgets[0]?.activeChart.mockReturnValue({
			onSymbolChanged: vi.fn(() => createMockSubscription()),
			resetData: vi.fn(),
			resolution: vi.fn(() => "1D"),
			symbol: vi.fn(() => "BTC"),
		});

		act(() => {
			root.render(
				createElement(TradingViewChart, { active: true, symbol: "BTC", interval: "60", theme: "dark", locale: "zh" }),
			);
		});
		await flushChartEffects();
		const rebuiltWidget = widgets[1];
		expect(rebuiltWidget?.setSymbol).toHaveBeenLastCalledWith("BTC", "1D", expect.any(Function));

		act(() => {
			root.render(
				createElement(TradingViewChart, { active: false, symbol: "BTC", interval: "60", theme: "dark", locale: "zh" }),
			);
		});
		act(() => {
			root.render(
				createElement(TradingViewChart, { active: true, symbol: "BTC", interval: "60", theme: "dark", locale: "zh" }),
			);
		});
		await flushChartEffects();

		expect(rebuiltWidget?.setSymbol).toHaveBeenCalledTimes(1);
		expect(rebuiltWidget?.setSymbol).not.toHaveBeenCalledWith("BTC", "60", expect.any(Function));
	});

	it("still applies an explicit interval prop change after restoring user state", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "en" }));
		});
		await flushChartEffects();
		widgets[0]?.activeChart.mockReturnValue({
			onSymbolChanged: vi.fn(() => createMockSubscription()),
			resetData: vi.fn(),
			resolution: vi.fn(() => "1D"),
			symbol: vi.fn(() => "BTC"),
		});

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "zh" }));
		});
		await flushChartEffects();
		const rebuiltWidget = widgets[1];

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "240", theme: "dark", locale: "zh" }));
		});
		await flushChartEffects();

		expect(rebuiltWidget?.setSymbol).toHaveBeenLastCalledWith("BTC", "240", expect.any(Function));
	});

	it("prefers a new interval prop over a captured interval before widget construction", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "en" }));
		});
		await flushChartEffects();
		widgets[0]?.activeChart.mockReturnValue({
			onSymbolChanged: vi.fn(() => createMockSubscription()),
			resetData: vi.fn(),
			resolution: vi.fn(() => "1D"),
			symbol: vi.fn(() => "BTC"),
		});
		let finishLoading: (() => void) | undefined;
		vi.mocked(loadTradingViewScript).mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					finishLoading = resolve;
				}),
		);

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "zh" }));
		});
		await flushChartEffects();
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "240", theme: "dark", locale: "zh" }));
		});
		await act(async () => {
			finishLoading?.();
			await Promise.resolve();
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenLastCalledWith(expect.objectContaining({ interval: "240", locale: "zh" }));
		expect(widgets[1]?.setSymbol).toHaveBeenLastCalledWith("BTC", "240", expect.any(Function));
	});

	it("rebuilds without saved data if locale state capture times out", async () => {
		vi.useFakeTimers();
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "en" }));
		});
		await flushChartEffects();
		widgets[0]?.save.mockImplementation(() => {});

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "zh" }));
		});
		await flushChartEffects();
		expect(widgetConstructor).toHaveBeenCalledOnce();

		await act(async () => {
			vi.advanceTimersByTime(2_000);
			await Promise.resolve();
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		expect(widgetConstructor).toHaveBeenLastCalledWith(expect.not.objectContaining({ saved_data: expect.anything() }));
	});

	it("counts the locale state-save timeout only while visible and online", async () => {
		vi.useFakeTimers();
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "en" }));
		});
		await flushChartEffects();
		widgets[0]?.save.mockImplementation(() => {});

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "zh" }));
		});
		await flushChartEffects();

		await act(async () => {
			vi.advanceTimersByTime(500);
			Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
			document.dispatchEvent(new Event("visibilitychange"));
			vi.advanceTimersByTime(60_000);
			Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
			document.dispatchEvent(new Event("visibilitychange"));
			vi.advanceTimersByTime(500);
			Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
			window.dispatchEvent(new Event("offline"));
			vi.advanceTimersByTime(60_000);
			await Promise.resolve();
		});
		expect(widgetConstructor).toHaveBeenCalledOnce();

		await act(async () => {
			Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
			window.dispatchEvent(new Event("online"));
			vi.advanceTimersByTime(999);
			await Promise.resolve();
		});
		expect(widgetConstructor).toHaveBeenCalledOnce();

		await act(async () => {
			vi.advanceTimersByTime(1);
			await Promise.resolve();
		});
		await flushChartEffects();
		expect(widgetConstructor).toHaveBeenCalledTimes(2);
	});

	it("does not restore a saved locale layout into a newly selected market", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "en" }));
		});
		await flushChartEffects();
		let finishSave: ((state: object) => void) | undefined;
		widgets[0]?.save.mockImplementation((callback: (state: object) => void) => {
			finishSave = callback;
		});

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "zh" }));
		});
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "ETH", interval: "60", theme: "dark", locale: "zh" }));
		});
		await act(async () => {
			finishSave?.({ charts: ["BTC layout"] });
			await Promise.resolve();
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenLastCalledWith(expect.objectContaining({ locale: "zh", symbol: "ETH" }));
		expect(widgetConstructor).toHaveBeenLastCalledWith(expect.not.objectContaining({ saved_data: expect.anything() }));
	});

	it("revalidates a captured locale snapshot if the market changes before widget construction", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "en" }));
		});
		await flushChartEffects();
		let finishLoading: (() => void) | undefined;
		vi.mocked(loadTradingViewScript).mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					finishLoading = resolve;
				}),
		);

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "zh" }));
		});
		await flushChartEffects();
		expect(widgetConstructor).toHaveBeenCalledOnce();

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "ETH", interval: "60", theme: "dark", locale: "zh" }));
		});
		await act(async () => {
			finishLoading?.();
			await Promise.resolve();
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		expect(widgetConstructor).toHaveBeenLastCalledWith(expect.objectContaining({ locale: "zh", symbol: "ETH" }));
		expect(widgetConstructor).toHaveBeenLastCalledWith(expect.not.objectContaining({ saved_data: expect.anything() }));
	});

	it("coalesces rapid locale changes into one rebuild for the latest locale", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "en" }));
		});
		await flushChartEffects();
		let finishSave: ((state: object) => void) | undefined;
		widgets[0]?.save.mockImplementation((callback: (state: object) => void) => {
			finishSave = callback;
		});

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "zh" }));
		});
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "fr" }));
		});
		await act(async () => {
			finishSave?.({ charts: ["layout"] });
			await Promise.resolve();
		});
		await flushChartEffects();

		expect(widgets[0]?.save).toHaveBeenCalledOnce();
		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		expect(widgetConstructor).toHaveBeenLastCalledWith(
			expect.objectContaining({ locale: "fr", saved_data: { charts: ["layout"] } }),
		);
	});

	it("ignores a late locale state callback after unmount", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "en" }));
		});
		await flushChartEffects();
		let finishSave: ((state: object) => void) | undefined;
		widgets[0]?.save.mockImplementation((callback: (state: object) => void) => {
			finishSave = callback;
		});

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "zh" }));
		});
		act(() => root.render(createElement("div")));
		await act(async () => {
			finishSave?.({ charts: ["late layout"] });
			await Promise.resolve();
		});

		expect(widgetConstructor).toHaveBeenCalledOnce();
		expect(widgets[0]?.remove).toHaveBeenCalledOnce();
	});

	it("lets a locale rebuild supersede a pending theme switch", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark", locale: "en" }));
		});
		await flushChartEffects();

		const widget = widgets[0];
		let resolveTheme: (() => void) | undefined;
		widget?.changeTheme.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveTheme = resolve;
				}),
		);

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "light", locale: "en" }));
		});
		await flushChartEffects();

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "light", locale: "zh" }));
		});
		await flushChartEffects();

		expect(widget?.remove).toHaveBeenCalledOnce();
		expect(widgetConstructor).toHaveBeenCalledTimes(2);
		expect(widgetConstructor).toHaveBeenLastCalledWith(expect.objectContaining({ locale: "zh", theme: "light" }));

		await act(async () => {
			widget?.__setTheme("light");
			resolveTheme?.();
			await Promise.resolve();
		});

		expect(widget?.applyOverrides).not.toHaveBeenCalled();
		expect(widgets[1]?.remove).not.toHaveBeenCalled();
	});

	it("ignores a pending theme switch after unmount", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		const widget = widgets[0];
		let resolveTheme: (() => void) | undefined;
		widget?.changeTheme.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveTheme = resolve;
				}),
		);

		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "light" }));
		});
		await flushChartEffects();

		act(() => {
			root.render(createElement("div"));
		});

		await act(async () => {
			widget?.__setTheme("light");
			resolveTheme?.();
			await Promise.resolve();
		});

		expect(widget?.remove).toHaveBeenCalledOnce();
		expect(widget?.applyOverrides).not.toHaveBeenCalled();
		expect(widgetConstructor).toHaveBeenCalledOnce();
	});

	it("uses a same-origin theme-aware static stylesheet instead of a blob URL", async () => {
		act(() => {
			root.render(createElement(TradingViewChart, { symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		expect(widgetConstructor).toHaveBeenCalledWith(
			expect.objectContaining({
				custom_css_url: "/tradingview-theme-dark.css",
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

	it("does not resolve PURR spot through a stale PURR perp mapping", async () => {
		const perpMarket = {
			kind: "perp",
			name: "PURR",
			pairName: "PURR-USDC",
			routeName: "PURR",
			markPx: "0.2",
			szDecimals: 0,
		} as UnifiedMarketInfo;
		const spotMarket = {
			kind: "spot",
			name: "PURR/USDC",
			pairName: "PURR/USDC",
			routeName: "PURR/USDC",
			markPx: "0.2",
			szDecimals: 0,
		} as UnifiedMarketInfo;

		act(() => {
			root.render(
				createElement(TradingViewChart, {
					symbol: perpMarket.name,
					market: perpMarket,
					interval: "60",
					theme: "dark",
				}),
			);
		});
		await flushChartEffects();

		const options = testState.datafeedOptions[0] as {
			getSymbolInfo: (symbolName: string, coin: string) => { ticker: string } | undefined;
		};
		expect(options.getSymbolInfo("PURR", "PURR")?.ticker).toBe("PURR");

		act(() => {
			root.render(
				createElement(TradingViewChart, {
					symbol: spotMarket.name,
					market: spotMarket,
					interval: "60",
					theme: "dark",
				}),
			);
		});
		await flushChartEffects();

		expect(options.getSymbolInfo("PURR/USDC", "PURR")?.ticker).toBe("PURR/USDC");
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

	it("re-applies with verification when the target loops back after an inactive cancel", async () => {
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

		act(() => {
			root.render(createElement(TradingViewChart, { active: false, symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		act(() => {
			root.render(createElement(TradingViewChart, { active: true, symbol: "BTC", interval: "60", theme: "dark" }));
		});
		await flushChartEffects();

		expect(widget?.setSymbol).toHaveBeenCalledTimes(2);
		expect(widget?.setSymbol).toHaveBeenLastCalledWith("BTC", "60", expect.any(Function));
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
