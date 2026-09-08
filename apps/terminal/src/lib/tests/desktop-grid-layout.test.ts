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
	desktopGridCompactor,
	getDesktopGridBreakpoint,
	getDesktopGridLayouts,
	readDesktopGridLayouts,
	resetDesktopGridLayouts,
	resizeDesktopGridLayout,
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
		expect(DESKTOP_GRID_STORAGE_KEY).toBe("trade-desktop-grid-layout-v11");
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

	it("removes saved geometry when the desktop layout is reset", () => {
		writeDesktopGridLayouts(DEFAULT_DESKTOP_GRID_LAYOUTS);
		window.localStorage.setItem("trade-desktop-grid-layout-v1", "legacy");
		window.localStorage.setItem("trade-desktop-grid-layout-v2", "legacy");
		window.localStorage.setItem("trade-desktop-grid-layout-v3", "legacy");
		window.localStorage.setItem("trade-desktop-grid-layout-v4", "legacy");
		window.localStorage.setItem("trade-desktop-grid-layout-v5", "legacy");
		window.localStorage.setItem("trade-desktop-grid-layout-v6", "legacy");
		window.localStorage.setItem("trade-desktop-grid-layout-v7", "legacy");
		window.localStorage.setItem("trade-desktop-grid-layout-v8", "legacy");
		window.localStorage.setItem("trade-desktop-grid-layout-v9", "legacy");

		resetDesktopGridLayouts();

		expect(window.localStorage.getItem(DESKTOP_GRID_STORAGE_KEY)).toBeNull();
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v1")).toBeNull();
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v2")).toBeNull();
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v3")).toBeNull();
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v4")).toBeNull();
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v5")).toBeNull();
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v6")).toBeNull();
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v7")).toBeNull();
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v8")).toBeNull();
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v9")).toBeNull();
		expect(readDesktopGridLayouts()).toBe(DEFAULT_DESKTOP_GRID_LAYOUTS);
	});

	it("discards the incompatible v9 geometry when the new layout is read", () => {
		window.localStorage.setItem("trade-desktop-grid-layout-v9", JSON.stringify(DEFAULT_DESKTOP_GRID_LAYOUTS));

		expect(readDesktopGridLayouts()).toBe(DEFAULT_DESKTOP_GRID_LAYOUTS);
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v9")).toBeNull();
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

	it("keeps market data and trading beside the chart at both desktop breakpoints", () => {
		const wideMarketData = DEFAULT_DESKTOP_GRID_LAYOUTS.lg?.find((item) => item.i === "marketData");
		const wideTrading = DEFAULT_DESKTOP_GRID_LAYOUTS.lg?.find((item) => item.i === "tradingInterface");
		const compactMarketData = DEFAULT_DESKTOP_GRID_LAYOUTS.md?.find((item) => item.i === "marketData");
		const compactTrading = DEFAULT_DESKTOP_GRID_LAYOUTS.md?.find((item) => item.i === "tradingInterface");

		expect(wideMarketData).toMatchObject({ x: 10, y: 0, w: 3, h: 20.4 });
		expect(wideTrading).toMatchObject({ x: 13, y: 0, w: 3, h: 20.4 });
		expect(compactMarketData).toMatchObject({ x: 8, y: 0, w: 3, h: 20.6 });
		expect(compactTrading).toMatchObject({ x: 11, y: 0, w: 3, h: 20.6 });
	});

	it("uses an eleven-three lower row beneath the compact desktop workspace", () => {
		const compactAccountTable = DEFAULT_DESKTOP_GRID_LAYOUTS.md?.find((item) => item.i === "accountTable");
		const compactAccountInfo = DEFAULT_DESKTOP_GRID_LAYOUTS.md?.find((item) => item.i === "accountInfo");
		const compactMarketData = DEFAULT_DESKTOP_GRID_LAYOUTS.md?.find((item) => item.i === "marketData");

		expect(compactAccountTable).toMatchObject({
			x: 0,
			y: 20.6,
			w: 11,
			h: 14,
			minW: 11,
			maxW: 11,
			resizeHandles: [],
		});
		expect(compactAccountInfo).toMatchObject({
			x: 11,
			y: 20.6,
			w: 3,
			h: 14,
			minW: 3,
			resizeHandles: ["w"],
		});
		expect((compactMarketData?.y ?? 0) + (compactMarketData?.h ?? 0)).toBeCloseTo(compactAccountInfo?.y ?? 0);
		expect((compactAccountTable?.y ?? 0) + (compactAccountTable?.h ?? 0)).toBeCloseTo(
			(compactAccountInfo?.y ?? 0) + (compactAccountInfo?.h ?? 0),
		);

		const gridSpan = Math.max(...(DEFAULT_DESKTOP_GRID_LAYOUTS.md ?? []).map((item) => item.y + item.h));
		const spanHeight = (rows: number) => rows * DESKTOP_GRID_ROW_HEIGHT_PX + (rows - 1) * DESKTOP_GRID_GAP_PX;

		expect(gridSpan).toBeCloseTo(34.6);
		expect(spanHeight(compactAccountTable?.h ?? 0)).toBeCloseTo(459);
		expect(spanHeight(compactMarketData?.h ?? 0)).toBeCloseTo(676.8);
		expect(spanHeight(compactAccountInfo?.h ?? 0)).toBeCloseTo(459);
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
			item.i === "accountTable" ? { ...item, w: 9, minW: 4 } : item,
		);
		writeDesktopGridLayouts({ ...DEFAULT_DESKTOP_GRID_LAYOUTS, md });

		const restoredAccountTable = readDesktopGridLayouts().md?.find((item) => item.i === "accountTable");
		expect(restoredAccountTable).toMatchObject({ x: 0, w: 11, minW: 11, maxW: 11 });
	});

	it("rejects stored geometry that exceeds the active column bounds", () => {
		window.localStorage.setItem(
			DESKTOP_GRID_STORAGE_KEY,
			JSON.stringify({
				...DEFAULT_DESKTOP_GRID_LAYOUTS,
				md: DEFAULT_DESKTOP_GRID_LAYOUTS.md?.map((item) =>
					item.i === "tradingInterface" ? { ...item, x: 12, w: 3 } : item,
				),
			}),
		);

		const restoredTrading = readDesktopGridLayouts().md?.find((item) => item.i === "tradingInterface");
		expect(restoredTrading).toMatchObject({ x: 11, w: 3 });
	});

	it("rejects stored geometry that causes panel collisions", () => {
		window.localStorage.setItem(
			DESKTOP_GRID_STORAGE_KEY,
			JSON.stringify({
				...DEFAULT_DESKTOP_GRID_LAYOUTS,
				md: DEFAULT_DESKTOP_GRID_LAYOUTS.md?.map((item) =>
					item.i === "tradingInterface" ? { ...item, x: 10, w: 3 } : item,
				),
			}),
		);

		const restoredTrading = readDesktopGridLayouts().md?.find((item) => item.i === "tradingInterface");
		expect(restoredTrading).toMatchObject({ x: 11, w: 3 });
	});

	it("rejects invalid or unknown resize results", () => {
		const layouts = cloneDefaultLayouts();
		const chart = DEFAULT_DESKTOP_GRID_LAYOUTS.md.find((item) => item.i === "chart");
		if (!chart) throw new Error("Expected the compact desktop chart layout");

		expect(syncGridItemResize(layouts, "md", { ...chart, w: 100 })).toBe(layouts);
		expect(syncGridItemResize(layouts, "md", { ...chart, i: "missing", w: 9 })).toBe(layouts);
	});
	it.each(["lg", "md"] as const)(
		"aligns both tiers in %s and shrinks after natural content contracts",
		(breakpoint) => {
			const layouts = cloneDefaultLayouts();
			const heights = syncGridItemContentHeight({}, breakpoint, "tradingInterface", 850);
			const large = getDesktopGridLayouts(layouts, heights)[breakpoint];
			expect(large?.find((item) => item.i === "tradingInterface")?.h).toBe(25.85);
			expectAligned(large ?? []);
			const small = getDesktopGridLayouts(
				layouts,
				syncGridItemContentHeight(heights, breakpoint, "tradingInterface", 166),
			);
			expect(small[breakpoint]?.find((item) => item.i === "tradingInterface")?.h).toBe(
				DEFAULT_DESKTOP_GRID_LAYOUTS[breakpoint].find((item) => item.i === "tradingInterface")?.h,
			);
			expectAligned(small[breakpoint] ?? []);
			expect(layouts).toEqual(cloneDefaultLayouts());
		},
	);

	it("keeps measurements separate from saved user geometry and inactive breakpoints", () => {
		const layouts = cloneDefaultLayouts();
		const heights = syncGridItemContentHeight({}, "md", "accountInfo", 700);
		const rendered = getDesktopGridLayouts(layouts, heights);
		expect(rendered.md?.find((item) => item.i === "accountTable")?.h).toBe(21.31);
		expect(rendered.lg).toEqual(layouts.lg);
		expectAligned(rendered.md ?? []);
		writeDesktopGridLayouts(layouts);
		expect(readDesktopGridLayouts()).toEqual(layouts);
		const shrunk = getDesktopGridLayouts(layouts, syncGridItemContentHeight(heights, "md", "accountInfo", 100));
		expect(shrunk.md?.find((item) => item.i === "accountTable")?.h).toBe(14);
		expect(syncGridItemContentHeight(heights, "md", "accountInfo", 700.2)).toBe(heights);
		expect(syncGridItemContentHeight(heights, "md", "accountInfo", Number.NaN)).toBe(heights);
	});

	it("keeps shared boundaries through repeated library compaction and restored unequal heights", () => {
		const layouts = cloneDefaultLayouts();
		layouts.lg = layouts.lg.map((item) =>
			item.i === "tradingInterface"
				? { ...item, h: 19.6 }
				: item.i === "accountInfo"
					? { ...item, y: 19.6, h: 15 }
					: item,
		);
		writeDesktopGridLayouts(layouts);
		const restored = readDesktopGridLayouts().lg ?? [];
		expectAligned(restored);
		expect(restored.find((item) => item.i === "accountInfo")?.y).toBe(20.4);
		expect(desktopGridCompactor.compact(restored, 16)).toEqual(restored);
		expect(restored.find((item) => item.i === "accountTable")?.h).toBe(15);
	});

	it("migrates prior column widths and manual chart sizes without retaining observed content expansion", () => {
		const legacy = cloneDefaultLayouts();
		legacy.lg = legacy.lg.map((item) => {
			if (item.i === "chart") return { ...item, w: 9, h: 21 };
			if (item.i === "tradingInterface") return { ...item, h: 28 };
			if (item.i === "accountInfo") return { ...item, y: 28, h: 23 };
			return item;
		});
		window.localStorage.setItem("trade-desktop-grid-layout-v10", JSON.stringify(legacy));
		const migrated = readDesktopGridLayouts();
		expect(migrated.lg?.find((item) => item.i === "chart")).toMatchObject({ w: 9, h: 21 });
		expect(migrated.lg?.find((item) => item.i === "tradingInterface")?.h).toBe(23.7);
		expect(migrated.lg?.find((item) => item.i === "accountInfo")?.h).toBe(14);
		expect(readDesktopGridLayouts()).toEqual(migrated);
		writeDesktopGridLayouts(migrated);
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v10")).toBeNull();
		expect(readDesktopGridLayouts()).toEqual(migrated);
	});

	it("resizes a shared vertical boundary in both directions and preserves the saved preference", () => {
		const layouts = cloneDefaultLayouts();
		const chart = layouts.lg.find((item) => item.i === "chart");
		if (!chart) throw new Error("Missing chart");
		const larger = syncGridItemResize(layouts, "lg", { ...chart, h: 22 });
		expectAligned(larger.lg ?? []);
		expect(larger.lg?.find((item) => item.i === "marketData")?.h).toBe(24.7);
		const smaller = syncGridItemResize(larger, "lg", { ...chart, h: 17 });
		expectAligned(smaller.lg ?? []);
		expect(smaller.lg?.find((item) => item.i === "marketData")?.h).toBe(19.7);
		writeDesktopGridLayouts(smaller);
		expect(readDesktopGridLayouts()).toEqual(smaller);
	});

	it("does not save a content-expanded height when a user only resizes width", () => {
		const layouts = cloneDefaultLayouts();
		const rendered = getDesktopGridLayouts(layouts, { lg: { tradingInterface: 850 } });
		const chart = rendered.lg?.find((item) => item.i === "chart");
		if (!chart) throw new Error("Missing chart");
		const next = syncGridItemResize(layouts, "lg", { ...chart, w: 9 }, chart);
		expect(next.lg?.find((item) => item.i === "chart")?.h).toBe(17.7);
		expect(next.lg?.find((item) => item.i === "chart")?.w).toBe(9);
		expect(next.lg?.find((item) => item.i === "marketData")).toMatchObject({ x: 9, w: 4 });
	});

	it("moves adjacent column boundaries together and rejects constrained resizes", () => {
		const layout = cloneDefaultLayouts().lg;
		const chart = layout.find((item) => item.i === "chart");
		if (!chart) throw new Error("Missing chart");
		const narrower = resizeDesktopGridLayout(layout, { ...chart, w: 9 }, 16);
		expect(narrower.find((item) => item.i === "favoriteCoins")?.w).toBe(9);
		expect(narrower.find((item) => item.i === "marketData")).toMatchObject({ x: 9, w: 4 });
		expect(resizeDesktopGridLayout(narrower, chart, 16)).toEqual(layout);
		expect(resizeDesktopGridLayout(layout, { ...chart, w: 11 }, 16)).toBe(layout);
		const compact = cloneDefaultLayouts().md;
		const account = compact.find((item) => item.i === "accountInfo");
		if (!account) throw new Error("Missing account");
		expect(resizeDesktopGridLayout(compact, { ...account, x: 10, w: 4 }, 14)).toBe(compact);
	});

	it("preserves the existing favorite-toolbar height handle without moving the shared lower boundary", () => {
		const layout = cloneDefaultLayouts().lg;
		const favorites = layout.find((item) => item.i === "favoriteCoins");
		if (!favorites) throw new Error("Missing favorites");
		const resized = resizeDesktopGridLayout(layout, { ...favorites, h: 2 }, 16);
		expect(resized.find((item) => item.i === "favoriteCoins")?.h).toBe(2);
		expect(resized.find((item) => item.i === "coinInfo")?.y).toBe(2);
		expect(resized.find((item) => item.i === "chart")?.y).toBe(3.4);
		expect(resized.find((item) => item.i === "accountTable")?.y).toBe(20.4);
		expectAligned(resized);
	});
});

function cloneDefaultLayouts() {
	return {
		lg: DEFAULT_DESKTOP_GRID_LAYOUTS.lg?.map((item) => ({ ...item })),
		md: DEFAULT_DESKTOP_GRID_LAYOUTS.md?.map((item) => ({ ...item })),
	};
}

function expectAligned(layout: ReadonlyArray<{ i: string; y: number; h: number }>) {
	const chart = layout.find((item) => item.i === "chart");
	const upperBottom = (chart?.y ?? 0) + (chart?.h ?? 0);
	for (const id of ["marketData", "tradingInterface"]) {
		const item = layout.find((candidate) => candidate.i === id);
		expect((item?.y ?? 0) + (item?.h ?? 0)).toBeCloseTo(upperBottom);
	}
	const table = layout.find((item) => item.i === "accountTable");
	const account = layout.find((item) => item.i === "accountInfo");
	expect(table?.y).toBeCloseTo(upperBottom);
	expect(account?.y).toBeCloseTo(upperBottom);
	expect(table?.h).toBe(account?.h);
}
