// @vitest-environment jsdom

import { calcGridItemPosition } from "react-grid-layout";
import { beforeEach, describe, expect, it } from "vitest";
import {
	DEFAULT_DESKTOP_GRID_LOADING_LAYOUTS,
	getDesktopGridLoadingContainerHeight,
	getDesktopGridLoadingPanelRect,
} from "@/components/trade/layout/desktop-grid-loading-surface";
import {
	DEFAULT_DESKTOP_GRID_LAYOUTS,
	DESKTOP_GRID_BREAKPOINTS,
	DESKTOP_GRID_COLS,
	DESKTOP_GRID_GAP_PX,
	DESKTOP_GRID_ROW_HEIGHT_PX,
	DESKTOP_GRID_STORAGE_KEY,
	getDesktopGridBreakpoint,
	readDesktopGridLayouts,
	resetDesktopGridLayouts,
	syncGridItemContentHeight,
	syncGridItemResize,
	writeDesktopGridLayouts,
} from "@/config/desktop-grid-layout";
import { MOBILE_BREAKPOINT_PX } from "@/config/layout";
import { MOBILE_MEDIA_QUERY, MOBILE_QR_SURFACE_MEDIA_QUERY } from "@/hooks/use-mobile";

describe("desktop grid layout", () => {
	beforeEach(() => window.localStorage.clear());

	it("uses the official desktop and mobile thresholds", () => {
		expect(MOBILE_BREAKPOINT_PX).toBe(1000);
		expect(MOBILE_MEDIA_QUERY).toBe("(max-width: 1000px)");
		expect(MOBILE_QR_SURFACE_MEDIA_QUERY).toBe("(max-width: 1000px), (pointer: coarse), (display-mode: standalone)");
		expect(DESKTOP_GRID_BREAKPOINTS).toEqual({ lg: 1420, md: 1000 });
		expect(DESKTOP_GRID_COLS).toEqual({ lg: 16, md: 14 });
		expect(DESKTOP_GRID_STORAGE_KEY).toBe("trade-desktop-grid-layout-v8");
	});

	it("keeps 1420px in md and switches to lg only above the breakpoint", () => {
		expect(getDesktopGridBreakpoint(1000)).toBe("md");
		expect(getDesktopGridBreakpoint(1420)).toBe("md");
		expect(getDesktopGridBreakpoint(1420.01)).toBe("lg");
	});

	it("projects the exact default lg and md geometry into the loading surface", () => {
		for (const breakpoint of ["lg", "md"] as const) {
			expect(DEFAULT_DESKTOP_GRID_LOADING_LAYOUTS[breakpoint]).toEqual(
				DEFAULT_DESKTOP_GRID_LAYOUTS[breakpoint].map(({ i, x, y, w, h }) => ({ i, x, y, w, h })),
			);

			const rows = Math.max(...DEFAULT_DESKTOP_GRID_LAYOUTS[breakpoint].map((item) => item.y + item.h));
			const expectedHeight =
				rows * DESKTOP_GRID_ROW_HEIGHT_PX + (rows - 1) * DESKTOP_GRID_GAP_PX + DESKTOP_GRID_GAP_PX * 2;
			expect(getDesktopGridLoadingContainerHeight(breakpoint)).toBeCloseTo(expectedHeight);
		}
	});

	it("keeps every default loading panel within one pixel of RGL at production desktop widths", () => {
		const cases = [
			{ breakpoint: "md", width: 1001 },
			{ breakpoint: "md", width: 1280 },
			{ breakpoint: "md", width: 1420 },
			{ breakpoint: "lg", width: 1421 },
			{ breakpoint: "lg", width: 1440 },
			{ breakpoint: "lg", width: 1920 },
		] as const;

		for (const { breakpoint, width } of cases) {
			for (const loadingItem of DEFAULT_DESKTOP_GRID_LOADING_LAYOUTS[breakpoint]) {
				const expected = calcGridItemPosition(
					{
						cols: DESKTOP_GRID_COLS[breakpoint],
						containerPadding: [DESKTOP_GRID_GAP_PX, DESKTOP_GRID_GAP_PX],
						containerWidth: width,
						margin: [DESKTOP_GRID_GAP_PX, DESKTOP_GRID_GAP_PX],
						maxRows: Number.POSITIVE_INFINITY,
						rowHeight: DESKTOP_GRID_ROW_HEIGHT_PX,
					},
					loadingItem.x,
					loadingItem.y,
					loadingItem.w,
					loadingItem.h,
				);
				const actual = getDesktopGridLoadingPanelRect(breakpoint, width, loadingItem.i);

				for (const dimension of ["left", "top", "width", "height"] as const) {
					expect(
						Math.abs(actual[dimension] - expected[dimension]),
						`${breakpoint}/${width}/${loadingItem.i}/${dimension}`,
					).toBeLessThanOrEqual(1);
				}
			}
		}
	});

	it("syncs content height only into the active breakpoint", () => {
		const layouts = cloneDefaultLayouts();
		const originalLg = layouts.lg;
		const originalMd = layouts.md;

		const next = syncGridItemContentHeight(layouts, "md", "tradingInterface", 850);

		expect(next).not.toBe(layouts);
		expect(next.lg).toBe(originalLg);
		expect(next.md).not.toBe(originalMd);
		expect(next.md?.find((item) => item.i === "chart")).toMatchObject({ x: 0, y: 2.7, w: 10, h: 17.9 });
		expect(next.md?.find((item) => item.i === "tradingInterface")?.h).toBe(25.85);
		expect(next.md?.find((item) => item.i === "marketData")?.y).toBe(25.85);
		expect(next.lg?.find((item) => item.i === "tradingInterface")?.h).toBe(20.4);
	});

	it("clamps observed heights to the active item's minH and maxH", () => {
		const layouts = cloneDefaultLayouts();
		const belowMinimum = syncGridItemContentHeight(layouts, "md", "tradingInterface", 1);
		const aboveMaximum = syncGridItemContentHeight(layouts, "lg", "favoriteCoins", 10_000);

		expect(belowMinimum.md?.find((item) => item.i === "tradingInterface")?.h).toBe(5);
		expect(aboveMaximum.lg?.find((item) => item.i === "favoriteCoins")?.h).toBe(2);
		expect(syncGridItemContentHeight(layouts, "lg", "missing", 850)).toBe(layouts);
		expect(syncGridItemContentHeight(layouts, "lg", "tradingInterface", Number.NaN)).toBe(layouts);
	});

	it("removes saved geometry when the desktop layout is reset", () => {
		writeDesktopGridLayouts(DEFAULT_DESKTOP_GRID_LAYOUTS);
		window.localStorage.setItem("trade-desktop-grid-layout-v1", "legacy");
		window.localStorage.setItem("trade-desktop-grid-layout-v2", "legacy");
		window.localStorage.setItem("trade-desktop-grid-layout-v3", "legacy");
		window.localStorage.setItem("trade-desktop-grid-layout-v4", "legacy");
		window.localStorage.setItem("trade-desktop-grid-layout-v5", "legacy");
		window.localStorage.setItem("trade-desktop-grid-layout-v6", "legacy");
		window.localStorage.setItem("trade-desktop-grid-layout-v7", "legacy");

		resetDesktopGridLayouts();

		expect(window.localStorage.getItem(DESKTOP_GRID_STORAGE_KEY)).toBeNull();
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v1")).toBeNull();
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v2")).toBeNull();
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v3")).toBeNull();
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v4")).toBeNull();
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v5")).toBeNull();
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v6")).toBeNull();
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v7")).toBeNull();
		expect(readDesktopGridLayouts()).toBe(DEFAULT_DESKTOP_GRID_LAYOUTS);
	});

	it("discards the incompatible v7 geometry when the new layout is read", () => {
		window.localStorage.setItem("trade-desktop-grid-layout-v7", JSON.stringify(DEFAULT_DESKTOP_GRID_LAYOUTS));

		expect(readDesktopGridLayouts()).toBe(DEFAULT_DESKTOP_GRID_LAYOUTS);
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v7")).toBeNull();
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
		expect(compactMarketData).toMatchObject({ x: 10, y: 20.6, w: 4, h: 18.4 });
	});

	it("gives the compact positions table the lower-left viewport while retaining the right-side panel stack", () => {
		const compactAccountTable = DEFAULT_DESKTOP_GRID_LAYOUTS.md?.find((item) => item.i === "accountTable");
		const compactAccountInfo = DEFAULT_DESKTOP_GRID_LAYOUTS.md?.find((item) => item.i === "accountInfo");
		const compactMarketData = DEFAULT_DESKTOP_GRID_LAYOUTS.md?.find((item) => item.i === "marketData");

		expect(compactAccountTable).toMatchObject({
			x: 0,
			y: 20.6,
			w: 10,
			h: 26.4,
			minW: 10,
			maxW: 10,
			resizeHandles: [],
		});
		expect(compactAccountInfo).toMatchObject({
			x: 10,
			y: 39,
			w: 4,
			h: 8,
			minW: 4,
			resizeHandles: ["w"],
		});
		expect((compactMarketData?.y ?? 0) + (compactMarketData?.h ?? 0)).toBeCloseTo(compactAccountInfo?.y ?? 0);
		expect((compactAccountTable?.y ?? 0) + (compactAccountTable?.h ?? 0)).toBeCloseTo(
			(compactAccountInfo?.y ?? 0) + (compactAccountInfo?.h ?? 0),
		);

		const gridSpan = Math.max(...(DEFAULT_DESKTOP_GRID_LAYOUTS.md ?? []).map((item) => item.y + item.h));
		const spanHeight = (rows: number) => rows * DESKTOP_GRID_ROW_HEIGHT_PX + (rows - 1) * DESKTOP_GRID_GAP_PX;

		expect(gridSpan).toBeCloseTo(47);
		expect(spanHeight(compactAccountTable?.h ?? 0)).toBeCloseTo(868.2);
		expect(spanHeight(compactMarketData?.h ?? 0)).toBeCloseTo(604.2);
		expect(spanHeight(compactAccountInfo?.h ?? 0)).toBeCloseTo(261);
	});

	it("restores valid geometry while retaining current constraints", () => {
		const lg = DEFAULT_DESKTOP_GRID_LAYOUTS.lg?.map((item) =>
			item.i === "chart" ? { ...item, x: 0, w: 9, minW: 1 } : item,
		);
		writeDesktopGridLayouts({ ...DEFAULT_DESKTOP_GRID_LAYOUTS, lg });

		const restoredChart = readDesktopGridLayouts().lg?.find((item) => item.i === "chart");
		expect(restoredChart).toMatchObject({ x: 0, w: 9, minW: 4 });
	});

	it("resets a previously narrowed compact account table to the fixed column width", () => {
		const md = DEFAULT_DESKTOP_GRID_LAYOUTS.md?.map((item) =>
			item.i === "accountTable" ? { ...item, w: 8, minW: 4 } : item,
		);
		writeDesktopGridLayouts({ ...DEFAULT_DESKTOP_GRID_LAYOUTS, md });

		const restoredAccountTable = readDesktopGridLayouts().md?.find((item) => item.i === "accountTable");
		expect(restoredAccountTable).toMatchObject({ x: 0, w: 10, minW: 10, maxW: 10 });
	});

	it("restores a valid compact table resize independently of the right-side panel stack", () => {
		const md = DEFAULT_DESKTOP_GRID_LAYOUTS.md?.map((item) => {
			if (item.i === "accountTable") return { ...item, h: 14 };
			return item;
		});
		writeDesktopGridLayouts({ ...DEFAULT_DESKTOP_GRID_LAYOUTS, md });

		const restored = readDesktopGridLayouts().md;
		expect(restored?.find((item) => item.i === "accountTable")).toMatchObject({ y: 20.6, h: 14 });
		expect(restored?.find((item) => item.i === "accountInfo")).toMatchObject({ x: 10, y: 39, h: 8 });
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

	it("round-trips an atomically compacted content height without losing user geometry", () => {
		const layouts = cloneDefaultLayouts();
		layouts.md = layouts.md?.map((item) => (item.i === "accountTable" ? { ...item, h: 14 } : item));

		const observed = syncGridItemContentHeight(layouts, "md", "tradingInterface", 850);
		writeDesktopGridLayouts(observed);

		const restored = readDesktopGridLayouts().md;
		expect(restored?.find((item) => item.i === "tradingInterface")).toMatchObject({ y: 0, h: 25.85 });
		expect(restored?.find((item) => item.i === "marketData")?.y).toBe(25.85);
		expect(restored?.find((item) => item.i === "accountTable")?.h).toBe(14);
		expect(restored?.find((item) => item.i === "accountInfo")?.y).toBe(44.25);
	});

	it("preserves inactive breakpoint user geometry through active compaction and persistence", () => {
		const layouts = cloneDefaultLayouts();
		layouts.md = layouts.md?.map((item) => (item.i === "accountTable" ? { ...item, h: 14 } : item));
		const originalMd = layouts.md;

		const observed = syncGridItemContentHeight(layouts, "lg", "tradingInterface", 850);
		expect(observed.md).toBe(originalMd);

		writeDesktopGridLayouts(observed);

		const restoredMd = readDesktopGridLayouts().md;
		expect(restoredMd?.find((item) => item.i === "accountTable")?.h).toBe(14);
		expect(restoredMd?.find((item) => item.i === "tradingInterface")?.h).toBe(20.6);
	});

	it("merges a user resize into the latest active layout instead of accepting a stale responsive snapshot", () => {
		const layouts = cloneDefaultLayouts();
		const withMeasuredContent = syncGridItemContentHeight(layouts, "md", "tradingInterface", 850);
		const staleChart = DEFAULT_DESKTOP_GRID_LAYOUTS.md.find((item) => item.i === "chart");
		if (!staleChart) throw new Error("Expected the compact desktop chart layout");

		const resized = syncGridItemResize(withMeasuredContent, "md", { ...staleChart, w: 9, h: 18 });

		expect(resized.lg).toBe(withMeasuredContent.lg);
		expect(resized.md?.find((item) => item.i === "chart")).toMatchObject({ w: 9, h: 18 });
		expect(resized.md?.find((item) => item.i === "tradingInterface")?.h).toBe(25.85);
		expect(resized.md?.find((item) => item.i === "marketData")?.y).toBe(25.85);
	});

	it("rejects invalid or unknown resize results", () => {
		const layouts = cloneDefaultLayouts();
		const chart = DEFAULT_DESKTOP_GRID_LAYOUTS.md.find((item) => item.i === "chart");
		if (!chart) throw new Error("Expected the compact desktop chart layout");

		expect(syncGridItemResize(layouts, "md", { ...chart, w: 100 })).toBe(layouts);
		expect(syncGridItemResize(layouts, "md", { ...chart, i: "missing", w: 9 })).toBe(layouts);
	});
});

function cloneDefaultLayouts() {
	return {
		lg: DEFAULT_DESKTOP_GRID_LAYOUTS.lg?.map((item) => ({ ...item })),
		md: DEFAULT_DESKTOP_GRID_LAYOUTS.md?.map((item) => ({ ...item })),
	};
}
