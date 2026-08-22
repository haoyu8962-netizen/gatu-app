// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileChartView } from "@/components/trade/mobile/mobile-chart-view";

vi.mock("@/components/trade/chart/chart-panel", () => ({
	ChartPanel: ({ active }: { active: boolean }) => <div data-testid="chart-panel" data-active={String(active)} />,
}));

describe("MobileChartView", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function render(active: boolean) {
		act(() => root.render(<MobileChartView active={active} />));
	}

	it("mounts TradingView only after the chart is first visible and then keeps the widget alive", () => {
		render(false);
		expect(container.querySelector('[data-testid="chart-panel"]')).toBeNull();

		render(true);
		expect(container.querySelector('[data-testid="chart-panel"]')?.getAttribute("data-active")).toBe("true");

		render(false);
		expect(container.querySelector('[data-testid="chart-panel"]')?.getAttribute("data-active")).toBe("false");
	});
});
