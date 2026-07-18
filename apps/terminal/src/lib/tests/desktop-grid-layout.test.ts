// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
	DEFAULT_DESKTOP_GRID_LAYOUTS,
	DESKTOP_GRID_BREAKPOINTS,
	DESKTOP_GRID_COLS,
	DESKTOP_GRID_STORAGE_KEY,
	readDesktopGridLayouts,
	resetDesktopGridLayouts,
	writeDesktopGridLayouts,
} from "@/config/desktop-grid-layout";
import { MOBILE_BREAKPOINT_PX } from "@/config/layout";
import { MOBILE_MEDIA_QUERY } from "@/hooks/use-mobile";

describe("desktop grid layout", () => {
	beforeEach(() => window.localStorage.clear());

	it("uses the official desktop and mobile thresholds", () => {
		expect(MOBILE_BREAKPOINT_PX).toBe(1000);
		expect(MOBILE_MEDIA_QUERY).toBe("(max-width: 1000px)");
		expect(DESKTOP_GRID_BREAKPOINTS).toEqual({ lg: 1420, md: 1000 });
		expect(DESKTOP_GRID_COLS).toEqual({ lg: 16, md: 14 });
		expect(DESKTOP_GRID_STORAGE_KEY).toBe("trade-desktop-grid-layout-v3");
	});

	it("removes saved geometry when the desktop layout is reset", () => {
		writeDesktopGridLayouts(DEFAULT_DESKTOP_GRID_LAYOUTS);
		window.localStorage.setItem("trade-desktop-grid-layout-v1", "legacy");
		window.localStorage.setItem("trade-desktop-grid-layout-v2", "legacy");

		resetDesktopGridLayouts();

		expect(window.localStorage.getItem(DESKTOP_GRID_STORAGE_KEY)).toBeNull();
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v1")).toBeNull();
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v2")).toBeNull();
		expect(readDesktopGridLayouts()).toBe(DEFAULT_DESKTOP_GRID_LAYOUTS);
	});

	it("keeps the market toolbar compact without changing the workspace height", () => {
		for (const breakpoint of ["lg", "md"] as const) {
			const layout = DEFAULT_DESKTOP_GRID_LAYOUTS[breakpoint];
			const marketToolbar = layout.find((item) => item.i === "coinInfo");
			const chart = layout.find((item) => item.i === "chart");
			const topBoundary = breakpoint === "lg" ? 20.4 : 20.6;

			expect(marketToolbar).toMatchObject({ y: 1.3, h: 1.4, minH: 1.4, maxH: 1.4 });
			expect(chart?.y).toBe(2.7);
			expect((chart?.y ?? 0) + (chart?.h ?? 0)).toBeCloseTo(topBoundary);
		}
	});

	it("places market data beside trading on wide screens and below it on compact desktop", () => {
		const wideMarketData = DEFAULT_DESKTOP_GRID_LAYOUTS.lg?.find((item) => item.i === "marketData");
		const wideTrading = DEFAULT_DESKTOP_GRID_LAYOUTS.lg?.find((item) => item.i === "tradingInterface");
		const compactMarketData = DEFAULT_DESKTOP_GRID_LAYOUTS.md?.find((item) => item.i === "marketData");
		const compactTrading = DEFAULT_DESKTOP_GRID_LAYOUTS.md?.find((item) => item.i === "tradingInterface");

		expect(wideMarketData).toMatchObject({ x: 10, y: 0, w: 3, h: 20.4 });
		expect(wideTrading).toMatchObject({ x: 13, y: 0, w: 3, h: 20.4 });
		expect(compactTrading).toMatchObject({ x: 10, y: 0, w: 4, h: 20.6 });
		expect(compactMarketData).toMatchObject({ x: 10, y: 20.6, w: 4, h: 20.4 });
	});

	it("restores valid geometry while retaining current constraints", () => {
		const lg = DEFAULT_DESKTOP_GRID_LAYOUTS.lg?.map((item) =>
			item.i === "chart" ? { ...item, x: 0, w: 9, minW: 1 } : item,
		);
		writeDesktopGridLayouts({ ...DEFAULT_DESKTOP_GRID_LAYOUTS, lg });

		const restoredChart = readDesktopGridLayouts().lg?.find((item) => item.i === "chart");
		expect(restoredChart).toMatchObject({ x: 0, w: 9, minW: 4 });
	});

	it("rejects stored geometry that exceeds the active column bounds", () => {
		window.localStorage.setItem(
			DESKTOP_GRID_STORAGE_KEY,
			JSON.stringify({
				...DEFAULT_DESKTOP_GRID_LAYOUTS,
				md: DEFAULT_DESKTOP_GRID_LAYOUTS.md?.map((item) =>
					item.i === "tradingInterface" ? { ...item, x: 13, w: 4 } : item,
				),
			}),
		);

		const restoredTrading = readDesktopGridLayouts().md?.find((item) => item.i === "tradingInterface");
		expect(restoredTrading).toMatchObject({ x: 10, w: 4 });
	});

	it("rejects stored geometry that causes panel collisions", () => {
		window.localStorage.setItem(
			DESKTOP_GRID_STORAGE_KEY,
			JSON.stringify({
				...DEFAULT_DESKTOP_GRID_LAYOUTS,
				md: DEFAULT_DESKTOP_GRID_LAYOUTS.md?.map((item) =>
					item.i === "tradingInterface" ? { ...item, x: 8, w: 4 } : item,
				),
			}),
		);

		const restoredTrading = readDesktopGridLayouts().md?.find((item) => item.i === "tradingInterface");
		expect(restoredTrading).toMatchObject({ x: 10, w: 4 });
	});
});
