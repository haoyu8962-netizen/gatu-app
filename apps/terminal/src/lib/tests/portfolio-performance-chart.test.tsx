// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortfolioPerformanceChart } from "@/components/portfolio/portfolio-performance-chart";
import type { PortfolioPeriod, PortfolioSnapshot } from "@/domain/portfolio";

type History = PortfolioSnapshot["pnlHistory"];

const LOCAL_DATE_TIMESTAMP = new Date(2026, 7, 9, 0, 30).getTime();
const PLOT_LEFT = 100;
const PLOT_TOP = 50;
const resizeObservers: ResizeObserverMock[] = [];
let plotWidth = 600;
let plotHeight = 180;

class ResizeObserverMock {
	readonly callback: ResizeObserverCallback;

	constructor(callback: ResizeObserverCallback) {
		this.callback = callback;
		resizeObservers.push(this);
	}

	observe() {}
	unobserve() {}
	disconnect() {}

	emit() {
		this.callback([], this as unknown as ResizeObserver);
	}
}

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("PortfolioPerformanceChart", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		plotWidth = 600;
		plotHeight = 180;
		resizeObservers.length = 0;
		vi.stubGlobal("ResizeObserver", ResizeObserverMock);
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
			if (this.hasAttribute("data-portfolio-chart-plot")) {
				return createRect(plotWidth, plotHeight, PLOT_LEFT, PLOT_TOP);
			}
			return createRect(0, 0, 0, 0);
		});
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("renders a real empty state without an axis skeleton", () => {
		renderChart(root, { history: [] });

		expect(container.textContent).toContain("No performance history");
		expect(container.querySelector("svg")).toBeNull();
		expect(container.querySelector("[data-x-axis]")).toBeNull();
	});

	it("does not infer empty history before a confirmed response", () => {
		renderChart(root, { history: [], hasConfirmedHistory: false });
		expect(container.textContent).not.toContain("No performance history");
		renderChart(root, { history: [], hasConfirmedHistory: true });
		expect(container.textContent).toContain("No performance history");
	});

	it.each(["loading", "unavailable"])("keeps passive %s feedback desktop-only", (state) => {
		renderChart(root, {
			history: [],
			hasConfirmedHistory: false,
			isLoading: state === "loading",
			isUnavailable: state === "unavailable",
		});
		const notice = container.querySelector('[role="alert"], [role="status"]');
		expect(container.querySelector("[data-portfolio-latest-value]")?.textContent).toBe("$0.00");
		expect(notice?.classList.contains("hidden")).toBe(true);
		expect(notice?.classList.contains("min-[1001px]:flex")).toBe(true);
		expect(container.textContent).not.toContain("No performance history");
	});

	it("renders and reads a single local-time point", () => {
		renderChart(root, { history: [[LOCAL_DATE_TIMESTAMP, "-7"]], period: "day" });

		const point = container.querySelector<SVGCircleElement>("[data-single-point]");
		expect(Number.isFinite(Number(point?.getAttribute("cx")))).toBe(true);
		expect(Number.isFinite(Number(point?.getAttribute("cy")))).toBe(true);
		const plot = getPlot(container);
		act(() => plot.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));

		expect(getTooltip(container)?.textContent).toBe("August 9, 2026 · -$7.00");
		expect(container.querySelector("[data-crosshair]")).not.toBeNull();
	});

	it("formats the complete tooltip date in Chinese local time", () => {
		i18n.loadAndActivate({ locale: "zh", messages: {} });
		renderChart(root, { history: [[LOCAL_DATE_TIMESTAMP, "-7"]], period: "day" });

		const plot = getPlot(container);
		act(() => plot.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));

		expect(getTooltip(container)?.textContent).toBe("2026年8月9日 · -$7.00");
	});

	it("creates finite adaptive ticks for an all-zero series", () => {
		renderChart(root, {
			history: [
				[LOCAL_DATE_TIMESTAMP, "0"],
				[LOCAL_DATE_TIMESTAMP + 60 * 60 * 1000, "0"],
			],
		});

		const tickValues = [...container.querySelectorAll("[data-y-tick]")].map((tick) => tick.getAttribute("data-y-tick"));
		expect(tickValues.filter((value) => value === "0")).toHaveLength(1);
		expect(container.querySelector("[data-y-tick] text")?.classList).toContain("text-3xs");
		expect(container.querySelector("[data-zero-line='true']")?.classList).toContain("stroke-stroke-strong");
		const path = container.querySelector("[data-chart-path]")?.getAttribute("d") ?? "";
		expect(path).not.toMatch(/NaN|Infinity/);
	});

	it("uses market direction colors for PNL while account value stays neutral", () => {
		renderChart(root, {
			history: [
				[LOCAL_DATE_TIMESTAMP, "-1"],
				[LOCAL_DATE_TIMESTAMP + 60 * 60 * 1000, "2"],
			],
		});
		const latest = container.querySelector("[data-portfolio-latest-value]");
		expect(latest?.classList).toContain("text-market-up");

		const accountValueTab = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Account Value",
		);
		act(() => accountValueTab?.click());
		expect(latest?.classList).toContain("text-fg");

		const pnlTab = [...container.querySelectorAll("button")].find((button) => button.textContent === "PNL");
		act(() => pnlTab?.click());
		renderChart(root, {
			history: [
				[LOCAL_DATE_TIMESTAMP, "1"],
				[LOCAL_DATE_TIMESTAMP + 60 * 60 * 1000, "-2"],
			],
		});
		expect(container.querySelector("[data-portfolio-latest-value]")?.classList).toContain("text-market-down");
	});

	it("keeps zero visible and visually distinct for an all-negative series", () => {
		renderChart(root, {
			history: [
				[LOCAL_DATE_TIMESTAMP, "-7"],
				[LOCAL_DATE_TIMESTAMP + 60 * 60 * 1000, "-3"],
			],
		});

		const tickValues = [...container.querySelectorAll("[data-y-tick]")].map((tick) =>
			Number(tick.getAttribute("data-y-tick")),
		);
		expect(tickValues.some((value) => value < 0)).toBe(true);
		expect(tickValues).toContain(0);
		expect(container.querySelector("[data-zero-line='true']")?.classList).toContain("stroke-stroke-strong");
		expect(container.querySelector("[data-y-tick]:not([data-y-tick='0']) line")?.classList).toContain(
			"stroke-stroke-weak",
		);
	});

	it("preserves the precision of fractional nice-step labels", () => {
		renderChart(root, {
			history: [
				[LOCAL_DATE_TIMESTAMP, "-0.4"],
				[LOCAL_DATE_TIMESTAMP + 60 * 60 * 1000, "0.4"],
			],
		});

		expect(container.querySelector("[data-y-tick='-0.25'] text")?.textContent).toBe("-$0.25");
		expect(container.querySelector("[data-y-tick='0.25'] text")?.textContent).toBe("$0.25");

		renderChart(root, {
			history: [
				[LOCAL_DATE_TIMESTAMP, "-0.0000004"],
				[LOCAL_DATE_TIMESTAMP + 60 * 60 * 1000, "0.0000004"],
			],
		});
		expect(container.querySelector("[data-y-tick='-2.5e-7'] text")?.textContent).toBe("-$0.00000025");
		expect(container.querySelector("[data-y-tick='2.5e-7'] text")?.textContent).toBe("$0.00000025");
	});

	it("positions irregular samples by timestamp instead of array index", () => {
		renderChart(root, {
			history: [
				[LOCAL_DATE_TIMESTAMP, "0"],
				[LOCAL_DATE_TIMESTAMP + 60 * 60 * 1000, "1"],
				[LOCAL_DATE_TIMESTAMP + 10 * 60 * 60 * 1000, "2"],
			],
		});

		const path = container.querySelector("[data-chart-path]")?.getAttribute("d") ?? "";
		const xCoordinates = [...path.matchAll(/[ML](-?\d+(?:\.\d+)?),/g)].map((match) => Number(match[1]));
		expect(xCoordinates).toHaveLength(3);
		expect(xCoordinates[1] - xCoordinates[0]).toBeLessThan((xCoordinates[2] - xCoordinates[1]) / 4);
	});

	it.each([
		["day", /^\d{2}:\d{2}$/],
		["week", /^\d{2}-\d{2}$/],
		["month", /^\d{2}-\d{2}$/],
		["allTime", /^\d{4}-\d{2}$/],
	] as const)("formats %s ticks for the selected period in local time", (period, expectedPattern) => {
		renderChart(root, {
			history: [
				[LOCAL_DATE_TIMESTAMP, "-7"],
				[LOCAL_DATE_TIMESTAMP + getPeriodSpan(period), "3"],
			],
			period,
		});

		const labels = getTimeTickLabels(container);
		expect(labels.length).toBeGreaterThan(1);
		expect(labels.filter((label, index) => index > 0 && label === labels[index - 1])).toEqual([]);
		for (const label of labels) expect(label).toMatch(expectedPattern);
	});

	it("reduces time tick density when the chart container narrows", () => {
		const history: History = [
			[LOCAL_DATE_TIMESTAMP, "-7"],
			[LOCAL_DATE_TIMESTAMP + 15 * 24 * 60 * 60 * 1000, "3"],
			[LOCAL_DATE_TIMESTAMP + getPeriodSpan("month"), "1"],
		];
		renderChart(root, { history, period: "month" });
		const desktopTickCount = getTimeTickLabels(container).length;

		plotWidth = 320;
		act(() => resizeObservers.at(-1)?.emit());

		expect(getTimeTickLabels(container).length).toBeLessThan(desktopTickCount);
	});

	it("measures the plot when data becomes renderable after loading", () => {
		const history = createHistory();
		renderChart(root, { history, period: "month", isLoading: true });
		expect(container.querySelector("[data-portfolio-chart-plot]")).toBeNull();

		plotWidth = 320;
		renderChart(root, { history, period: "month", isLoading: false });

		expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 320 180");
		expect(resizeObservers).toHaveLength(1);
	});

	it("snaps hover to the nearest point and clamps the tooltip to every edge", () => {
		const history: History = [
			[LOCAL_DATE_TIMESTAMP, "-7"],
			[LOCAL_DATE_TIMESTAMP + 60 * 60 * 1000, "3"],
		];
		renderChart(root, { history, period: "day" });
		const plot = getPlot(container);

		movePointer(plot, 0, 0);
		expect(container.querySelector("[data-active-point]")?.getAttribute("data-active-point")).toBe(
			String(LOCAL_DATE_TIMESTAMP),
		);
		expect(getTooltip(container)?.textContent).toBe("August 9, 2026 · -$7.00");
		expectTooltipInsideChart(container, plotWidth, plotHeight);

		movePointer(plot, plotWidth, plotHeight);
		expect(container.querySelector("[data-active-point]")?.getAttribute("data-active-point")).toBe(
			String(LOCAL_DATE_TIMESTAMP + 60 * 60 * 1000),
		);
		expect(getTooltip(container)?.textContent).toBe("August 9, 2026 · +$3.00");
		expectTooltipInsideChart(container, plotWidth, plotHeight);

		movePointer(plot, 220, 90);
		const firstTooltipLeft = Number.parseFloat(getTooltip(container)?.style.left ?? "NaN");
		movePointer(plot, 240, 90);
		expect(container.querySelector("[data-active-point]")?.getAttribute("data-active-point")).toBe(
			String(LOCAL_DATE_TIMESTAMP),
		);
		expect(Number.parseFloat(getTooltip(container)?.style.left ?? "NaN")).toBeGreaterThan(firstTooltipLeft);
	});

	it("keeps a pointer tooltip aligned when the chart resizes", () => {
		renderChart(root, { history: createHistory(), period: "day" });
		movePointer(getPlot(container), 200, 90);
		const desktopLeft = Number.parseFloat(getTooltip(container)?.style.left ?? "NaN");

		plotWidth = 320;
		act(() => resizeObservers.at(-1)?.emit());

		const mobileLeft = Number.parseFloat(getTooltip(container)?.style.left ?? "NaN");
		expect(mobileLeft).toBeLessThan(desktopLeft);
		expectTooltipInsideChart(container, plotWidth, plotHeight);
	});

	it("moves point-by-point with arrow keys and exits on Escape", () => {
		const history = createHistory();
		renderChart(root, { history, period: "day" });
		const plot = getPlot(container);
		plot.focus();
		expect(document.activeElement).toBe(plot);
		expect(plot.getAttribute("role")).toBe("slider");
		const firstArrow = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });

		act(() => plot.dispatchEvent(firstArrow));
		expect(firstArrow.defaultPrevented).toBe(true);
		expect(container.querySelector("[data-active-point]")?.getAttribute("data-active-point")).toBe(
			String(history[0][0]),
		);
		expect(plot.getAttribute("aria-valuetext")).toBe("August 9, 2026 · -$7.00");
		act(() => plot.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
		expect(container.querySelector("[data-active-point]")?.getAttribute("data-active-point")).toBe(
			String(history[1][0]),
		);
		act(() => plot.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
		expect(container.querySelector("[data-active-point]")?.getAttribute("data-active-point")).toBe(
			String(history[0][0]),
		);
		act(() => plot.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
		expect(getTooltip(container)).toBeNull();
		expect(container.querySelector("[data-crosshair]")).toBeNull();
		expect(plot.getAttribute("aria-valuetext")).toBe("No data point selected");
	});

	it("resets the reading state when the metric or period changes", () => {
		const history = createHistory();
		renderChart(root, { history, period: "day" });
		movePointer(getPlot(container), 80, 90);
		expect(getTooltip(container)).not.toBeNull();

		const accountValueTab = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Account Value",
		);
		act(() => accountValueTab?.click());
		expect(getTooltip(container)).toBeNull();
		act(() => getPlot(container).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
		expect(getTooltip(container)?.textContent).toBe("August 9, 2026 · +$7.00");

		const pnlTab = [...container.querySelectorAll("button")].find((button) => button.textContent === "PNL");
		act(() => pnlTab?.click());
		movePointer(getPlot(container), 80, 90);
		expect(getTooltip(container)).not.toBeNull();

		renderChart(root, { history, period: "week" });
		expect(getTooltip(container)).toBeNull();
		expect(container.querySelector("[data-crosshair]")).toBeNull();

		renderChart(root, { history, period: "day" });
		expect(getTooltip(container)).toBeNull();
		expect(container.querySelector("[data-crosshair]")).toBeNull();
	});
});

function renderChart(
	root: Root,
	{
		history,
		period = "day",
		isLoading = false,
		isUnavailable = false,
		hasConfirmedHistory = true,
	}: {
		history: History;
		period?: PortfolioPeriod;
		isLoading?: boolean;
		isUnavailable?: boolean;
		hasConfirmedHistory?: boolean;
	},
) {
	act(() =>
		root.render(
			<I18nProvider i18n={i18n}>
				<PortfolioPerformanceChart
					accountValueHistory={history.map(([timestamp, value]) => [timestamp, absoluteString(value)] as const)}
					pnlHistory={history}
					perpsPnlHistory={history}
					isLoading={isLoading}
					isUnavailable={isUnavailable}
					hasConfirmedHistory={hasConfirmedHistory}
					onRetry={vi.fn()}
					period={period}
				/>
			</I18nProvider>,
		),
	);
}

function absoluteString(value: string): string {
	return value.startsWith("-") ? value.slice(1) : value;
}

function createHistory(): History {
	return [
		[LOCAL_DATE_TIMESTAMP, "-7"],
		[LOCAL_DATE_TIMESTAMP + 60 * 60 * 1000, "3"],
		[LOCAL_DATE_TIMESTAMP + 2 * 60 * 60 * 1000, "1"],
	];
}

function getPeriodSpan(period: PortfolioPeriod): number {
	if (period === "day") return 24 * 60 * 60 * 1000;
	if (period === "week") return 7 * 24 * 60 * 60 * 1000;
	if (period === "month") return 30 * 24 * 60 * 60 * 1000;
	return 365 * 24 * 60 * 60 * 1000;
}

function getPlot(container: HTMLElement): HTMLDivElement {
	const plot = container.querySelector<HTMLDivElement>("[data-portfolio-chart-plot]");
	if (!plot) throw new Error("Expected chart plot");
	return plot;
}

function getTooltip(container: HTMLElement): HTMLElement | null {
	return container.querySelector<HTMLElement>("[data-tooltip]");
}

function getTimeTickLabels(container: HTMLElement): string[] {
	return [...container.querySelectorAll("[data-x-tick] text")].map((label) => label.textContent ?? "");
}

function movePointer(plot: HTMLElement, localX: number, localY: number) {
	act(() =>
		plot.dispatchEvent(
			new MouseEvent("pointermove", {
				bubbles: true,
				clientX: PLOT_LEFT + localX,
				clientY: PLOT_TOP + localY,
			}),
		),
	);
}

function expectTooltipInsideChart(container: HTMLElement, width: number, height: number) {
	const tooltip = getTooltip(container);
	if (!tooltip) throw new Error("Expected tooltip");
	const left = Number.parseFloat(tooltip.style.left);
	const top = Number.parseFloat(tooltip.style.top);
	const tooltipWidth = Number.parseFloat(tooltip.style.width);
	expect(left).toBeGreaterThanOrEqual(0);
	expect(top).toBeGreaterThanOrEqual(0);
	expect(left + tooltipWidth).toBeLessThanOrEqual(width);
	expect(top + 32).toBeLessThanOrEqual(height);
}

function createRect(width: number, height: number, left: number, top: number): DOMRect {
	return {
		bottom: top + height,
		height,
		left,
		right: left + width,
		top,
		width,
		x: left,
		y: top,
		toJSON: () => ({}),
	};
}
