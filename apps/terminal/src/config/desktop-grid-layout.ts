import {
	type Compactor,
	getBreakpointFromWidth,
	type Layout,
	type LayoutItem,
	type ResponsiveLayouts,
} from "react-grid-layout";

export const DESKTOP_GRID_BREAKPOINTS = {
	lg: 1420,
	md: 1000,
} as const;

export const DESKTOP_GRID_COLS = {
	lg: 16,
	md: 14,
} as const;

export const DESKTOP_GRID_ROW_HEIGHT_PX = 30;
export const DESKTOP_GRID_GAP_PX = 3;
export const DESKTOP_GRID_STORAGE_KEY = "trade-desktop-grid-layout-v11";
const LEGACY_DESKTOP_GRID_STORAGE_KEYS = [
	"trade-desktop-grid-layout-v1",
	"trade-desktop-grid-layout-v2",
	"trade-desktop-grid-layout-v3",
	"trade-desktop-grid-layout-v4",
	"trade-desktop-grid-layout-v5",
	"trade-desktop-grid-layout-v6",
	"trade-desktop-grid-layout-v7",
	"trade-desktop-grid-layout-v8",
	"trade-desktop-grid-layout-v9",
	"trade-desktop-grid-layout-v10",
] as const;
const GRID_GEOMETRY_EPSILON = 1e-9;

export type DesktopGridBreakpoint = keyof typeof DESKTOP_GRID_BREAKPOINTS;

export function getDesktopGridBreakpoint(containerWidthPx: number): DesktopGridBreakpoint {
	return getBreakpointFromWidth(DESKTOP_GRID_BREAKPOINTS, containerWidthPx);
}

export const DEFAULT_DESKTOP_GRID_LAYOUTS = {
	lg: [
		{ i: "favoriteCoins", x: 0, y: 0, w: 10, h: 1.3, minH: 1.3, maxH: 2, minW: 9, isDraggable: false },
		{ i: "coinInfo", x: 0, y: 1.3, w: 10, h: 1.4, minH: 1.4, maxH: 1.4, minW: 9, isDraggable: false },
		{
			i: "chart",
			x: 0,
			y: 2.7,
			w: 10,
			h: 17.7,
			minH: 16,
			minW: 4,
			isDraggable: false,
			resizeHandles: ["e", "s", "se"],
		},
		{
			i: "marketData",
			x: 10,
			y: 0,
			w: 3,
			h: 20.4,
			minH: 10,
			minW: 3,
			isDraggable: false,
			resizeHandles: ["w", "e", "s", "sw", "se"],
		},
		{
			i: "tradingInterface",
			x: 13,
			y: 0,
			w: 3,
			h: 20.4,
			minH: 5,
			minW: 3,
			isDraggable: false,
			resizeHandles: ["w"],
		},
		{
			i: "accountTable",
			x: 0,
			y: 20.4,
			w: 13,
			h: 14,
			minH: 5,
			minW: 10,
			isDraggable: false,
			resizeHandles: ["e"],
		},
		{
			i: "accountInfo",
			x: 13,
			y: 20.4,
			w: 3,
			h: 14,
			minH: 14,
			minW: 3,
			isDraggable: false,
			resizeHandles: ["w"],
		},
	],
	md: [
		{ i: "favoriteCoins", x: 0, y: 0, w: 8, h: 1.3, minH: 1.3, maxH: 2, minW: 4, isDraggable: false },
		{ i: "coinInfo", x: 0, y: 1.3, w: 8, h: 1.4, minH: 1.4, maxH: 1.4, minW: 4, isDraggable: false },
		{
			i: "chart",
			x: 0,
			y: 2.7,
			w: 8,
			h: 17.9,
			minH: 16,
			minW: 4,
			isDraggable: false,
			resizeHandles: ["e", "s", "se"],
		},
		{
			i: "marketData",
			x: 8,
			y: 0,
			w: 3,
			h: 20.6,
			minH: 16,
			minW: 3,
			isDraggable: false,
			resizeHandles: ["w", "e", "s", "sw", "se"],
		},
		{
			i: "tradingInterface",
			x: 11,
			y: 0,
			w: 3,
			h: 20.6,
			minH: 5,
			minW: 3,
			isDraggable: false,
			resizeHandles: ["w"],
		},
		{
			i: "accountTable",
			x: 0,
			y: 20.6,
			w: 11,
			h: 14,
			minH: 5,
			minW: 11,
			maxW: 11,
			isDraggable: false,
			resizeHandles: [],
		},
		{
			i: "accountInfo",
			x: 11,
			y: 20.6,
			w: 3,
			h: 14,
			minH: 14,
			minW: 3,
			isDraggable: false,
			resizeHandles: ["w"],
		},
	],
} satisfies ResponsiveLayouts<DesktopGridBreakpoint>;

export type DesktopGridContentHeights = Partial<Record<DesktopGridBreakpoint, Record<string, number>>>;

export const desktopGridCompactor: Compactor = {
	type: "vertical",
	allowOverlap: false,
	compact: (layout) => alignDesktopGridLayout(layout),
};

export function getDesktopGridLayouts(
	layouts: ResponsiveLayouts<DesktopGridBreakpoint>,
	contentHeights: DesktopGridContentHeights = {},
): ResponsiveLayouts<DesktopGridBreakpoint> {
	return Object.fromEntries(
		(["lg", "md"] as const).map((breakpoint) => {
			const measured = layouts[breakpoint]?.map((item) => {
				const contentHeight = contentHeights[breakpoint]?.[item.i];
				if (contentHeight === undefined) return item;
				const minH = Math.max(item.minH ?? 0, pixelsToGridHeight(contentHeight));
				return { ...item, minH, h: Math.max(item.h, minH) };
			});
			return [breakpoint, measured ? alignDesktopGridLayout(measured) : undefined];
		}),
	);
}

export function syncGridItemContentHeight(
	heights: DesktopGridContentHeights,
	breakpoint: DesktopGridBreakpoint,
	itemId: string,
	contentHeightPx: number,
): DesktopGridContentHeights {
	if (!Number.isFinite(contentHeightPx) || contentHeightPx <= 0) return heights;
	if (Math.abs((heights[breakpoint]?.[itemId] ?? 0) - contentHeightPx) < 0.5) return heights;
	return { ...heights, [breakpoint]: { ...heights[breakpoint], [itemId]: contentHeightPx } };
}

export function syncGridItemResize(
	layouts: ResponsiveLayouts<DesktopGridBreakpoint>,
	breakpoint: DesktopGridBreakpoint,
	resizedItem: LayoutItem,
	previousItem?: LayoutItem,
): ResponsiveLayouts<DesktopGridBreakpoint> {
	const activeLayout = layouts[breakpoint];
	if (!activeLayout) return layouts;
	const resized = resizeDesktopGridLayout(activeLayout, resizedItem, DESKTOP_GRID_COLS[breakpoint], previousItem);
	return resized === activeLayout ? layouts : { ...layouts, [breakpoint]: resized };
}

export function resizeDesktopGridLayout(
	layout: Layout,
	resizedItem: LayoutItem,
	cols: number,
	previousItem?: LayoutItem,
): Layout {
	const original = layout.find((item) => item.i === resizedItem.i);
	if (!original) return layout;
	const next = layout.map((item) => ({ ...item }));
	const items = new Map(next.map((item) => [item.i, item]));
	const chart = items.get("chart");
	const marketData = items.get("marketData");
	const trading = items.get("tradingInterface");
	const accountTable = items.get("accountTable");
	const accountInfo = items.get("accountInfo");
	if (!chart || !marketData || !trading || !accountTable || !accountInfo) return layout;

	const handles = original.resizeHandles ?? ["se"];
	const canResizeWidth = handles.some((handle) => /[we]/u.test(handle));
	const canResizeHeight = handles.some((handle) => /[ns]/u.test(handle));
	if (
		canResizeWidth &&
		((previousItem ?? original).w !== resizedItem.w || (previousItem ?? original).x !== resizedItem.x)
	) {
		let leftBoundary = marketData.x;
		let rightBoundary = trading.x;
		if (["favoriteCoins", "coinInfo", "chart"].includes(original.i)) leftBoundary = resizedItem.x + resizedItem.w;
		if (original.i === "marketData") {
			leftBoundary = resizedItem.x;
			rightBoundary = resizedItem.x + resizedItem.w;
		}
		if (original.i === "tradingInterface" || original.i === "accountInfo") rightBoundary = resizedItem.x;
		if (original.i === "accountTable") rightBoundary = resizedItem.x + resizedItem.w;
		for (const item of next) {
			if (["favoriteCoins", "coinInfo", "chart"].includes(item.i)) Object.assign(item, { x: 0, w: leftBoundary });
			if (item.i === "marketData") Object.assign(item, { x: leftBoundary, w: rightBoundary - leftBoundary });
			if (["tradingInterface", "accountInfo"].includes(item.i))
				Object.assign(item, { x: rightBoundary, w: cols - rightBoundary });
			if (item.i === "accountTable") Object.assign(item, { x: 0, w: rightBoundary });
		}
	}
	if (canResizeHeight && (previousItem ?? original).h !== resizedItem.h) {
		let boundary = original.y + resizedItem.h;
		if (["favoriteCoins", "coinInfo"].includes(original.i)) {
			const toolbar = items.get(original.i);
			const favorites = items.get("favoriteCoins");
			const information = items.get("coinInfo");
			if (!toolbar || !favorites || !information) return layout;
			toolbar.h = resizedItem.h;
			information.y = favorites.y + favorites.h;
			chart.y = information.y + information.h;
			boundary = Math.max(marketData.y + marketData.h, chart.y + (chart.minH ?? 0));
		}
		for (const item of next) {
			if (["chart", "marketData", "tradingInterface"].includes(item.i)) item.h = boundary - item.y;
		}
	}
	if (next.some((item) => !hasValidGeometry(item, item, cols))) return layout;
	const aligned = alignDesktopGridLayout(next);
	if (hasCollisions(aligned)) return layout;
	return aligned.every((item, index) => {
		const previous = layout[index];
		return previous && item.x === previous.x && item.y === previous.y && item.w === previous.w && item.h === previous.h;
	})
		? layout
		: aligned;
}

function alignDesktopGridLayout(layout: Layout): Layout {
	const upperIds = ["favoriteCoins", "coinInfo", "chart", "marketData", "tradingInterface"];
	const upperBottom = Math.max(0, ...layout.filter((item) => upperIds.includes(item.i)).map((item) => item.y + item.h));
	const lowerHeight = Math.max(
		0,
		...layout
			.filter((item) => ["accountTable", "accountInfo"].includes(item.i))
			.map((item) => Math.max(item.h, item.minH ?? 0)),
	);
	return layout.map((item) => {
		if (["chart", "marketData", "tradingInterface"].includes(item.i))
			return {
				...item,
				h: Math.abs(upperBottom - item.y - item.h) < GRID_GEOMETRY_EPSILON ? item.h : upperBottom - item.y,
			};
		if (["accountTable", "accountInfo"].includes(item.i)) return { ...item, y: upperBottom, h: lowerHeight };
		return { ...item };
	});
}

function pixelsToGridHeight(height: number): number {
	return Math.ceil(((height + DESKTOP_GRID_GAP_PX) / (DESKTOP_GRID_ROW_HEIGHT_PX + DESKTOP_GRID_GAP_PX)) * 100) / 100;
}

export function readDesktopGridLayouts(): ResponsiveLayouts<DesktopGridBreakpoint> {
	if (typeof window === "undefined") return DEFAULT_DESKTOP_GRID_LAYOUTS;

	try {
		const current = window.localStorage.getItem(DESKTOP_GRID_STORAGE_KEY);
		const legacy = current === null;
		const stored = JSON.parse(
			current ?? window.localStorage.getItem("trade-desktop-grid-layout-v10") ?? "null",
		) as unknown;
		removeLegacyDesktopGridLayouts(legacy);
		if (!isRecord(stored)) return DEFAULT_DESKTOP_GRID_LAYOUTS;

		return {
			lg: restoreLayout(stored.lg, DEFAULT_DESKTOP_GRID_LAYOUTS.lg, DESKTOP_GRID_COLS.lg, legacy),
			md: restoreLayout(stored.md, DEFAULT_DESKTOP_GRID_LAYOUTS.md, DESKTOP_GRID_COLS.md, legacy),
		};
	} catch {
		return DEFAULT_DESKTOP_GRID_LAYOUTS;
	}
}

export function resetDesktopGridLayouts(): void {
	if (typeof window === "undefined") return;

	try {
		window.localStorage.removeItem(DESKTOP_GRID_STORAGE_KEY);
		removeLegacyDesktopGridLayouts();
	} catch {
		return;
	}
}

export function writeDesktopGridLayouts(layouts: ResponsiveLayouts<DesktopGridBreakpoint>): void {
	if (typeof window === "undefined") return;

	try {
		window.localStorage.setItem(DESKTOP_GRID_STORAGE_KEY, JSON.stringify(layouts));
		removeLegacyDesktopGridLayouts();
	} catch {
		return;
	}
}

function restoreLayout(value: unknown, defaults: Layout, cols: number, legacy = false): Layout {
	if (!Array.isArray(value)) return defaults;

	const storedItems = new Map<string, Record<string, unknown>>();
	for (const item of value) {
		if (isRecord(item) && typeof item.i === "string") storedItems.set(item.i, item);
	}

	let isInvalid = false;
	const restored = defaults.map((defaultItem) => {
		const storedItem = storedItems.get(defaultItem.i);
		if (!storedItem || !hasValidGeometry(storedItem, defaultItem, cols)) {
			isInvalid = true;
			return defaultItem;
		}

		return {
			...defaultItem,
			x: storedItem.x as number,
			y: legacy ? defaultItem.y : (storedItem.y as number),
			w: storedItem.w as number,
			h:
				legacy && ["tradingInterface", "accountInfo"].includes(defaultItem.i)
					? (defaultItem.minH ?? defaultItem.h)
					: (storedItem.h as number),
		};
	});

	const aligned = alignDesktopGridLayout(restored);
	return isInvalid || hasCollisions(aligned) ? defaults : aligned;
}

function hasValidGeometry(value: Record<string, unknown>, defaults: Layout[number], cols: number): boolean {
	const { x, y, w, h } = value;
	if (![x, y, w, h].every((part) => typeof part === "number" && Number.isFinite(part))) return false;
	if ((x as number) < 0 || (y as number) < 0 || (w as number) <= 0 || (h as number) <= 0) return false;
	if ((x as number) + (w as number) > cols) return false;
	if (defaults.minW !== undefined && (w as number) < defaults.minW) return false;
	if (defaults.minH !== undefined && (h as number) < defaults.minH) return false;
	if (defaults.maxW !== undefined && (w as number) > defaults.maxW) return false;
	if (defaults.maxH !== undefined && (h as number) > defaults.maxH) return false;
	return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function removeLegacyDesktopGridLayouts(preservePreviousVersion = false): void {
	for (const key of LEGACY_DESKTOP_GRID_STORAGE_KEYS) {
		if (preservePreviousVersion && key === "trade-desktop-grid-layout-v10") continue;
		window.localStorage.removeItem(key);
	}
}

function hasCollisions(layout: Layout): boolean {
	for (let index = 0; index < layout.length; index += 1) {
		const first = layout[index];
		if (!first) continue;

		for (let otherIndex = index + 1; otherIndex < layout.length; otherIndex += 1) {
			const second = layout[otherIndex];
			if (!second) continue;

			const isSeparated =
				first.x + first.w <= second.x + GRID_GEOMETRY_EPSILON ||
				second.x + second.w <= first.x + GRID_GEOMETRY_EPSILON ||
				first.y + first.h <= second.y + GRID_GEOMETRY_EPSILON ||
				second.y + second.h <= first.y + GRID_GEOMETRY_EPSILON;
			if (!isSeparated) return true;
		}
	}

	return false;
}
