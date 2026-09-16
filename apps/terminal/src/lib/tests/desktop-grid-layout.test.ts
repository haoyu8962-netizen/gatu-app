// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
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
		expect(DESKTOP_GRID_STORAGE_KEY).toBe("trade-desktop-grid-layout-v12");
	});

	it("keeps 1420px in md and switches to lg only above the breakpoint", () => {
		expect(getDesktopGridBreakpoint(1000)).toBe("md");
		expect(getDesktopGridBreakpoint(1420)).toBe("md");
		expect(getDesktopGridBreakpoint(1420.01)).toBe("lg");
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
		window.localStorage.setItem("trade-desktop-grid-layout-v10", "legacy");
		window.localStorage.setItem("trade-desktop-grid-layout-v11", "legacy");

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
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v10")).toBeNull();
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v11")).toBeNull();
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
			expectAligned(layout, DESKTOP_GRID_COLS[breakpoint]);
		}
	});

	it("keeps market data and trading beside the chart at the lg desktop breakpoint", () => {
		const wideMarketData = DEFAULT_DESKTOP_GRID_LAYOUTS.lg?.find((item) => item.i === "marketData");
		const wideTrading = DEFAULT_DESKTOP_GRID_LAYOUTS.lg?.find((item) => item.i === "tradingInterface");

		expect(wideMarketData).toMatchObject({ x: 10, y: 0, w: 3, h: 20.4 });
		expect(wideTrading).toMatchObject({ x: 13, y: 0, w: 3, h: 20.4 });
	});

	it("stacks trading, market data and account information in the md right column", () => {
		const layout = DEFAULT_DESKTOP_GRID_LAYOUTS.md;
		expect(layout.map((item) => item.i)).toEqual([
			"favoriteCoins",
			"coinInfo",
			"chart",
			"marketData",
			"tradingInterface",
			"accountTable",
			"accountInfo",
		]);
		expect(layout.find((item) => item.i === "favoriteCoins")).toMatchObject({
			x: 0,
			y: 0,
			w: 10,
			h: 1.3,
			minH: 1.3,
			maxH: 2,
			minW: 7,
			isDraggable: false,
		});
		expect(layout.find((item) => item.i === "coinInfo")).toMatchObject({
			x: 0,
			y: 1.3,
			w: 10,
			h: 1.4,
			minH: 1.4,
			maxH: 1.4,
			minW: 7,
			isDraggable: false,
		});
		expect(layout.find((item) => item.i === "chart")).toMatchObject({
			x: 0,
			y: 2.7,
			w: 10,
			h: 17.9,
			minH: 16,
			minW: 7,
			resizeHandles: ["e", "s", "se"],
		});
		const trading = layout.find((item) => item.i === "tradingInterface");
		const marketData = layout.find((item) => item.i === "marketData");
		const table = layout.find((item) => item.i === "accountTable");
		expect(trading).toMatchObject({ x: 10, y: 0, w: 4, h: 20.6, minH: 5, minW: 3, resizeHandles: ["w"] });
		expect(marketData).toMatchObject({
			x: 10,
			y: 20.6,
			w: 4,
			h: 20.4,
			minH: 10,
			minW: 3,
			resizeHandles: ["w", "s", "sw"],
		});
		expect(table).toMatchObject({ x: 0, y: 20.6, w: 10, h: 14, minH: 5, minW: 7, resizeHandles: [] });
		expect(table).not.toHaveProperty("maxW");
		expect(layout.find((item) => item.i === "accountInfo")).toMatchObject({
			x: 10,
			y: 41,
			w: 4,
			h: 14,
			minH: 14,
			minW: 3,
			resizeHandles: ["w"],
		});
		expect(Math.max(...layout.map((item) => item.y + item.h))).toBe(55);
		expect(spanHeight(trading?.h ?? 0)).toBeCloseTo(676.8);
		expect(spanHeight(marketData?.h ?? 0)).toBeCloseTo(670.2);
		expect(spanHeight(table?.h ?? 0)).toBeCloseTo(459);
		expectAligned(layout, 14);
		const compacted = desktopGridCompactor.compact(layout, 14);
		expect(compacted).toEqual(layout);
		expect(desktopGridCompactor.compact(compacted, 14)).toEqual(layout);
		expectAligned(compacted, 14);
	});

	it("restores valid geometry while retaining current constraints", () => {
		const lg = DEFAULT_DESKTOP_GRID_LAYOUTS.lg?.map((item) =>
			item.i === "chart" ? { ...item, x: 0, w: 9, minW: 1 } : item,
		);
		writeDesktopGridLayouts({ ...DEFAULT_DESKTOP_GRID_LAYOUTS, lg });

		const restoredChart = readDesktopGridLayouts().lg?.find((item) => item.i === "chart");
		expect(restoredChart).toMatchObject({ x: 0, w: 9, minW: 4 });
	});

	it("rejects stored md geometry with inconsistent left column widths", () => {
		const md = DEFAULT_DESKTOP_GRID_LAYOUTS.md.map((item) => {
			if (["favoriteCoins", "coinInfo", "chart"].includes(item.i)) return { ...item, w: 9 };
			if (["marketData", "tradingInterface", "accountInfo"].includes(item.i)) return { ...item, x: 9, w: 5 };
			return item;
		});
		writeDesktopGridLayouts({ ...DEFAULT_DESKTOP_GRID_LAYOUTS, md });

		const restored = readDesktopGridLayouts().md ?? [];
		expect(restored).toEqual(DEFAULT_DESKTOP_GRID_LAYOUTS.md);
		expectAligned(restored, 14);
	});

	it("restores and aligns stored md geometry with a consistent column boundary", () => {
		const md = DEFAULT_DESKTOP_GRID_LAYOUTS.md.map((item) => {
			if (["favoriteCoins", "coinInfo", "chart", "accountTable"].includes(item.i)) return { ...item, w: 9 };
			if (item.i === "tradingInterface") return { ...item, x: 9, w: 5, h: 22 };
			return { ...item, x: 9, w: 5 };
		});
		writeDesktopGridLayouts({ ...DEFAULT_DESKTOP_GRID_LAYOUTS, md });

		const restored = readDesktopGridLayouts().md ?? [];
		expectStackedColumns(restored, 9);
		expect(restored.find((item) => item.i === "accountTable")?.y).toBe(22);
		expect(restored.find((item) => item.i === "accountInfo")?.y).toBeCloseTo(42.4);
		expectAligned(restored, 14);
		expect(desktopGridCompactor.compact(restored, 14)).toEqual(restored);
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

		const restored = readDesktopGridLayouts().md ?? [];
		expect(restored.find((item) => item.i === "tradingInterface")).toMatchObject({ x: 10, w: 4 });
		expectAligned(restored, 14);
	});

	it("rejects stored geometry that causes panel collisions", () => {
		window.localStorage.setItem(
			DESKTOP_GRID_STORAGE_KEY,
			JSON.stringify({
				...DEFAULT_DESKTOP_GRID_LAYOUTS,
				md: DEFAULT_DESKTOP_GRID_LAYOUTS.md?.map((item) =>
					item.i === "tradingInterface" ? { ...item, x: 9, w: 5 } : item,
				),
			}),
		);

		const restored = readDesktopGridLayouts().md ?? [];
		expect(restored.find((item) => item.i === "tradingInterface")).toMatchObject({ x: 10, w: 4 });
		expectAligned(restored, 14);
	});

	it("rejects invalid or unknown resize results", () => {
		const layouts = cloneDefaultLayouts();
		const chart = DEFAULT_DESKTOP_GRID_LAYOUTS.md.find((item) => item.i === "chart");
		if (!chart) throw new Error("Expected the compact desktop chart layout");

		expect(syncGridItemResize(layouts, "md", { ...chart, w: 100 })).toBe(layouts);
		expect(syncGridItemResize(layouts, "md", { ...chart, i: "missing", w: 9 })).toBe(layouts);
		expectAligned(layouts.md, 14);
	});
	it.each(["lg", "md"] as const)("ignores trading content heights in %s", (breakpoint) => {
		const layouts = cloneDefaultLayouts();
		for (const tradingInterface of [850, 166, 1400]) {
			const heights = { [breakpoint]: { accountInfo: 200, tradingInterface } };
			const rendered = getDesktopGridLayouts(layouts, heights);
			expect(rendered).toEqual(layouts);
			expectAligned(rendered[breakpoint] ?? [], DESKTOP_GRID_COLS[breakpoint]);
		}
		expect(layouts).toEqual(cloneDefaultLayouts());
	});

	it("keeps measurements separate from saved user geometry and inactive breakpoints", () => {
		const layouts = cloneDefaultLayouts();
		const heights = syncGridItemContentHeight({}, "md", "accountInfo", 700);
		const rendered = getDesktopGridLayouts(layouts, heights);
		expect(rendered.md?.find((item) => item.i === "accountInfo")?.h).toBe(21.31);
		expect(rendered.md?.find((item) => item.i === "accountTable")?.h).toBe(14);
		expect(rendered.lg).toEqual(layouts.lg);
		expectAligned(rendered.md ?? [], 14);
		writeDesktopGridLayouts(layouts);
		expect(readDesktopGridLayouts()).toEqual(layouts);
		const shrunk = getDesktopGridLayouts(layouts, syncGridItemContentHeight(heights, "md", "accountInfo", 100));
		expect(shrunk.md?.find((item) => item.i === "accountTable")?.h).toBe(14);
		expect(shrunk.md?.find((item) => item.i === "accountInfo")?.h).toBe(14);
		expect(shrunk.lg).toEqual(layouts.lg);
		expectAligned(shrunk.md ?? [], 14);
		expect(syncGridItemContentHeight(heights, "md", "accountInfo", 700.2)).toBe(heights);
		expect(syncGridItemContentHeight(heights, "md", "accountInfo", Number.NaN)).toBe(heights);
	});

	it("keeps shared boundaries through repeated library compaction and restored unequal heights", () => {
		const layouts = cloneDefaultLayouts();
		layouts.lg = layouts.lg.map((item) => {
			if (item.i === "tradingInterface") return { ...item, h: 19.6 };
			if (item.i === "accountInfo") return { ...item, y: 19.6, h: 15 };
			return item;
		});
		writeDesktopGridLayouts(layouts);
		const restored = readDesktopGridLayouts().lg ?? [];
		expectAligned(restored, 16);
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
		legacy.md = legacy.md.map((item) => {
			if (["favoriteCoins", "coinInfo", "chart"].includes(item.i)) return { ...item, w: 8, minW: 4 };
			if (item.i === "marketData") return { ...item, x: 8, y: 0, w: 3, h: 20.6, minH: 16 };
			if (item.i === "accountTable") return { ...item, w: 11, minW: 11, maxW: 11 };
			if (item.i === "accountInfo") return { ...item, x: 11, y: 20.6, w: 3 };
			return { ...item, x: 11, w: 3, y: 0 };
		});
		window.localStorage.setItem("trade-desktop-grid-layout-v11", JSON.stringify(legacy));
		const migrated = readDesktopGridLayouts();
		expect(migrated.lg?.find((item) => item.i === "chart")).toMatchObject({ w: 9, h: 21 });
		expect(migrated.lg?.find((item) => item.i === "tradingInterface")?.h).toBe(23.7);
		expect(migrated.lg?.find((item) => item.i === "accountInfo")?.h).toBe(14);
		expect(migrated.md).toEqual(DEFAULT_DESKTOP_GRID_LAYOUTS.md);
		expectAligned(migrated.md ?? [], 14);
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v11")).toBe(JSON.stringify(legacy));
		expect(readDesktopGridLayouts()).toEqual(migrated);
		writeDesktopGridLayouts(migrated);
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v11")).toBeNull();
		expect(readDesktopGridLayouts()).toEqual(migrated);
	});

	it("resizes a shared vertical boundary in both directions and preserves the saved preference", () => {
		const layouts = cloneDefaultLayouts();
		const chart = layouts.lg.find((item) => item.i === "chart");
		if (!chart) throw new Error("Missing chart");
		const larger = syncGridItemResize(layouts, "lg", { ...chart, h: 22 });
		expectAligned(larger.lg ?? [], 16);
		expect(larger.lg?.find((item) => item.i === "marketData")?.h).toBe(24.7);
		const smaller = syncGridItemResize(larger, "lg", { ...chart, h: 17 });
		expectAligned(smaller.lg ?? [], 16);
		expect(smaller.lg?.find((item) => item.i === "marketData")?.h).toBe(19.7);
		writeDesktopGridLayouts(smaller);
		expect(readDesktopGridLayouts()).toEqual(smaller);
	});

	it("does not save a content-expanded height when a user only resizes width", () => {
		const layouts = cloneDefaultLayouts();
		const rendered = getDesktopGridLayouts(layouts, { lg: { accountInfo: 850 } });
		const chart = rendered.lg?.find((item) => item.i === "chart");
		if (!chart) throw new Error("Missing chart");
		const next = syncGridItemResize(layouts, "lg", { ...chart, w: 9 }, chart);
		expect(next.lg?.find((item) => item.i === "chart")?.h).toBe(17.7);
		expect(next.lg?.find((item) => item.i === "accountInfo")?.h).toBe(14);
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
		expectAligned(resized, 16);
	});
	it("discards v10 geometry without reading it", () => {
		window.localStorage.setItem("trade-desktop-grid-layout-v10", JSON.stringify(cloneDefaultLayouts()));
		const getItem = vi.spyOn(Storage.prototype, "getItem");
		try {
			const restored = readDesktopGridLayouts();
			expect(restored).toBe(DEFAULT_DESKTOP_GRID_LAYOUTS);
			expectAligned(restored.md ?? [], 14);
			expect(getItem.mock.calls).toEqual([[DESKTOP_GRID_STORAGE_KEY], ["trade-desktop-grid-layout-v11"]]);
		} finally {
			getItem.mockRestore();
		}
		expect(window.localStorage.getItem("trade-desktop-grid-layout-v10")).toBeNull();
	});

	it("moves the md shared boundary when the chart height changes", () => {
		const layout = cloneDefaultLayouts().md;
		const chart = layout.find((item) => item.i === "chart");
		if (!chart) throw new Error("Missing chart");
		const resized = resizeDesktopGridLayout(layout, { ...chart, h: 20 }, 14);
		expect(resized.find((item) => item.i === "chart")?.h).toBe(20);
		expect(resized.find((item) => item.i === "tradingInterface")?.h).toBeCloseTo(22.7);
		expect(resized.find((item) => item.i === "marketData")?.y).toBeCloseTo(22.7);
		expect(resized.find((item) => item.i === "accountTable")?.y).toBeCloseTo(22.7);
		expect(resized.find((item) => item.i === "accountInfo")?.y).toBeCloseTo(43.1);
		expectAligned(resized, 14);
		const smaller = resizeDesktopGridLayout(resized, chart, 14);
		for (const item of layout) {
			const restored = smaller.find((candidate) => candidate.i === item.i);
			expect(restored).toMatchObject({ x: item.x, w: item.w });
			expect(restored?.y).toBeCloseTo(item.y, 9);
			expect(restored?.h).toBeCloseTo(item.h, 9);
		}
		expectAligned(smaller, 14);
	});

	it("resizes md market data height without changing the account table", () => {
		const layout = cloneDefaultLayouts().md;
		const marketData = layout.find((item) => item.i === "marketData");
		if (!marketData) throw new Error("Missing market data");
		const resized = resizeDesktopGridLayout(layout, { ...marketData, h: 25 }, 14);
		expect(resized.find((item) => item.i === "marketData")?.h).toBe(25);
		expect(resized.find((item) => item.i === "accountInfo")?.y).toBeCloseTo(45.6);
		for (const item of layout.filter((item) => !["marketData", "accountInfo"].includes(item.i))) {
			expect(resized.find((candidate) => candidate.i === item.i)).toEqual(item);
		}
		expectAligned(resized, 14);
	});

	it.each(["chart", "marketData", "tradingInterface", "accountInfo"])(
		"moves every md column boundary when resizing %s width",
		(id) => {
			const layout = cloneDefaultLayouts().md;
			const item = layout.find((item) => item.i === id);
			if (!item) throw new Error("Missing resized item");
			const geometry = id === "chart" ? { x: 0, w: 9 } : { x: 9, w: 5 };
			const resized = resizeDesktopGridLayout(layout, { ...item, ...geometry }, 14);
			expectStackedColumns(resized, 9);
			expectAligned(resized, 14);
			writeDesktopGridLayouts({ ...cloneDefaultLayouts(), md: resized });
			const restored = readDesktopGridLayouts().md ?? [];
			expect(restored).toEqual(resized);
			expectAligned(restored, 14);
		},
	);

	it.each([6, 12])("rejects the md chart width %s outside the shared column constraints", (w) => {
		const layout = cloneDefaultLayouts().md;
		const chart = layout.find((item) => item.i === "chart");
		if (!chart) throw new Error("Missing chart");
		const resized = resizeDesktopGridLayout(layout, { ...chart, w }, 14);
		expect(resized).toBe(layout);
		expectAligned(resized, 14);
	});

	it("preserves the md shared boundary when resizing the favorite toolbar height", () => {
		const layout = cloneDefaultLayouts().md;
		const favorites = layout.find((item) => item.i === "favoriteCoins");
		if (!favorites) throw new Error("Missing favorites");
		const resized = resizeDesktopGridLayout(layout, { ...favorites, h: 2 }, 14);
		expect(resized.find((item) => item.i === "favoriteCoins")?.h).toBe(2);
		expect(resized.find((item) => item.i === "coinInfo")?.y).toBe(2);
		expect(resized.find((item) => item.i === "chart")?.y).toBe(3.4);
		expect(resized.find((item) => item.i === "tradingInterface")?.h).toBe(20.6);
		expect(resized.find((item) => item.i === "accountTable")?.y).toBe(20.6);
		expectAligned(resized, 14);
	});
});

function cloneDefaultLayouts() {
	return {
		lg: DEFAULT_DESKTOP_GRID_LAYOUTS.lg?.map((item) => ({ ...item })),
		md: DEFAULT_DESKTOP_GRID_LAYOUTS.md?.map((item) => ({ ...item })),
	};
}

function spanHeight(rows: number): number {
	return rows * DESKTOP_GRID_ROW_HEIGHT_PX + (rows - 1) * DESKTOP_GRID_GAP_PX;
}

function expectStackedColumns(layout: ReadonlyArray<{ i: string; x: number; w: number }>, boundary: number) {
	for (const item of layout) {
		if (["favoriteCoins", "coinInfo", "chart", "accountTable"].includes(item.i)) {
			expect(item).toMatchObject({ x: 0, w: boundary });
		} else {
			expect(item).toMatchObject({ x: boundary, w: DESKTOP_GRID_COLS.md - boundary });
		}
	}
}

function expectAligned(layout: ReadonlyArray<{ i: string; y: number; h: number }>, cols: number) {
	const chart = layout.find((item) => item.i === "chart");
	const upperBottom = (chart?.y ?? 0) + (chart?.h ?? 0);
	const table = layout.find((item) => item.i === "accountTable");
	const account = layout.find((item) => item.i === "accountInfo");
	if (cols === DESKTOP_GRID_COLS.md) {
		const trading = layout.find((item) => item.i === "tradingInterface");
		const marketData = layout.find((item) => item.i === "marketData");
		expect((trading?.y ?? 0) + (trading?.h ?? 0)).toBeCloseTo(upperBottom);
		expect(table?.y).toBeCloseTo(upperBottom);
		expect(marketData?.y).toBeCloseTo(upperBottom);
		expect(account?.y).toBeCloseTo((marketData?.y ?? 0) + (marketData?.h ?? 0));
		return;
	}
	for (const id of ["marketData", "tradingInterface"]) {
		const item = layout.find((candidate) => candidate.i === id);
		expect((item?.y ?? 0) + (item?.h ?? 0)).toBeCloseTo(upperBottom);
	}
	expect(table?.y).toBeCloseTo(upperBottom);
	expect(account?.y).toBeCloseTo(upperBottom);
	expect(table?.h).toBe(account?.h);
}
