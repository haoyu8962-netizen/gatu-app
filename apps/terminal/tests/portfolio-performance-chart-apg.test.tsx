/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortfolioPerformanceChart } from "@/components/portfolio/portfolio-performance-chart";
import type { PortfolioSnapshot } from "@/domain/portfolio";

type History = PortfolioSnapshot["pnlHistory"];

const START_TIMESTAMP = new Date(2026, 7, 9, 0, 30).getTime();
const PLOT_LEFT = 100;
const PLOT_TOP = 50;
const PLOT_WIDTH = 600;
const PLOT_HEIGHT = 180;
const HISTORY: History = [
	[START_TIMESTAMP, "-7"],
	[START_TIMESTAMP + 60 * 60 * 1000, "3"],
	[START_TIMESTAMP + 2 * 60 * 60 * 1000, "1"],
	[START_TIMESTAMP + 3 * 60 * 60 * 1000, "5"],
];

class ResizeObserverMock {
	constructor(_callback: ResizeObserverCallback) {}
	observe() {}
	unobserve() {}
	disconnect() {}
}

describe("PortfolioPerformanceChart APG scrubber contract", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.stubGlobal("ResizeObserver", ResizeObserverMock);
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
			if (this.hasAttribute("data-portfolio-chart-plot")) {
				return createRect(PLOT_WIDTH, PLOT_HEIGHT, PLOT_LEFT, PLOT_TOP);
			}
			return createRect(0, 0, 0, 0);
		});
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		renderChart(root);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("represents no selection with a distinct in-range sentinel", () => {
		const plot = getPlot(container);

		expect(plot.getAttribute("role")).toBe("slider");
		expect(plot.getAttribute("aria-valuemin")).toBe("-1");
		expect(plot.getAttribute("aria-valuemax")).toBe(String(HISTORY.length - 1));
		expect(plot.getAttribute("aria-valuenow")).toBe("-1");
		expect(plot.getAttribute("aria-valuetext")).toBe("No data point selected");
		expect(container.querySelector("[data-active-point]")).toBeNull();
	});

	it("supports the APG vertical arrow aliases", () => {
		const plot = getPlot(container);
		dispatchKey(plot, "ArrowRight");
		expect(plot.getAttribute("aria-valuenow")).toBe("0");

		const increase = dispatchKey(plot, "ArrowUp");
		expect(increase.defaultPrevented).toBe(true);
		expect(plot.getAttribute("aria-valuenow")).toBe("1");
		expect(getActiveTimestamp(container)).toBe(HISTORY[1][0]);

		const decrease = dispatchKey(plot, "ArrowDown");
		expect(decrease.defaultPrevented).toBe(true);
		expect(plot.getAttribute("aria-valuenow")).toBe("0");
		expect(getActiveTimestamp(container)).toBe(HISTORY[0][0]);
	});

	it("supports Home and End at the declared range boundaries", () => {
		const plot = getPlot(container);
		dispatchKey(plot, "ArrowRight");

		const end = dispatchKey(plot, "End");
		expect(end.defaultPrevented).toBe(true);
		expect(plot.getAttribute("aria-valuenow")).toBe(String(HISTORY.length - 1));
		expect(getActiveTimestamp(container)).toBe(HISTORY.at(-1)?.[0]);

		const home = dispatchKey(plot, "Home");
		expect(home.defaultPrevented).toBe(true);
		expect(plot.getAttribute("aria-valuenow")).toBe("-1");
		expect(plot.getAttribute("aria-valuetext")).toBe("No data point selected");
		expect(container.querySelector("[data-active-point]")).toBeNull();
	});

	it("advertises every supported keyboard command", () => {
		const shortcuts = new Set((getPlot(container).getAttribute("aria-keyshortcuts") ?? "").split(/\s+/).filter(Boolean));

		expect(shortcuts).toEqual(
			new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Escape"]),
		);
	});

	it("selects a point on a touch pointer down and cancels back to the sentinel", () => {
		const plot = getPlot(container);
		const secondPointLocalX = 60 + (PLOT_WIDTH - 8 - 60) / (HISTORY.length - 1);

		dispatchTouchPointer(plot, "pointerdown", PLOT_LEFT + secondPointLocalX, PLOT_TOP + PLOT_HEIGHT / 2);
		expect(plot.getAttribute("aria-valuenow")).toBe("1");
		expect(getActiveTimestamp(container)).toBe(HISTORY[1][0]);

		dispatchTouchPointer(plot, "pointercancel", PLOT_LEFT + secondPointLocalX, PLOT_TOP + PLOT_HEIGHT / 2);
		expect(plot.getAttribute("aria-valuenow")).toBe("-1");
		expect(plot.getAttribute("aria-valuetext")).toBe("No data point selected");
		expect(container.querySelector("[data-active-point]")).toBeNull();
	});
});

function renderChart(root: Root) {
	act(() => {
		root.render(
			<I18nProvider i18n={i18n}>
				<PortfolioPerformanceChart
					accountValueHistory={HISTORY.map(([timestamp, value]) => [timestamp, value.replace("-", "")] as const)}
					pnlHistory={HISTORY}
					perpsPnlHistory={HISTORY}
					isLoading={false}
					isUnavailable={false}
					hasConfirmedHistory={true}
					onRetry={vi.fn()}
					period="day"
				/>
			</I18nProvider>,
		);
	});
}

function getPlot(container: HTMLElement): HTMLDivElement {
	const plot = container.querySelector<HTMLDivElement>("[data-portfolio-chart-plot]");
	if (!plot) throw new Error("Expected portfolio chart plot");
	return plot;
}

function getActiveTimestamp(container: HTMLElement): number | null {
	const value = container.querySelector("[data-active-point]")?.getAttribute("data-active-point");
	return value === null || value === undefined ? null : Number(value);
}

function dispatchKey(plot: HTMLElement, key: string): KeyboardEvent {
	const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
	act(() => plot.dispatchEvent(event));
	return event;
}

function dispatchTouchPointer(plot: HTMLElement, type: "pointerdown" | "pointercancel", clientX: number, clientY: number) {
	const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
	Object.defineProperties(event, {
		pointerId: { configurable: true, value: 7 },
		pointerType: { configurable: true, value: "touch" },
	});
	act(() => plot.dispatchEvent(event));
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
