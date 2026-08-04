import type { Layout, ResponsiveLayouts } from "react-grid-layout";

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
export const DESKTOP_GRID_STORAGE_KEY = "trade-desktop-grid-layout-v4";
const LEGACY_DESKTOP_GRID_STORAGE_KEYS = [
	"trade-desktop-grid-layout-v1",
	"trade-desktop-grid-layout-v2",
	"trade-desktop-grid-layout-v3",
] as const;
const GRID_GEOMETRY_EPSILON = 1e-9;

export type DesktopGridBreakpoint = keyof typeof DESKTOP_GRID_BREAKPOINTS;

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
			minH: 20.3,
			minW: 3,
			isDraggable: false,
			resizeHandles: ["w", "s", "sw"],
		},
		{
			i: "accountTable",
			x: 0,
			y: 20.4,
			w: 13,
			h: 14,
			minH: 10,
			minW: 10,
			isDraggable: false,
			resizeHandles: ["n", "e", "ne"],
		},
		{
			i: "accountInfo",
			x: 13,
			y: 20.4,
			w: 3,
			h: 14,
			minH: 10,
			minW: 3,
			isDraggable: false,
			resizeHandles: ["n", "w", "nw"],
		},
	],
	md: [
		{ i: "favoriteCoins", x: 0, y: 0, w: 10, h: 1.3, minH: 1.3, maxH: 2, minW: 4, isDraggable: false },
		{ i: "coinInfo", x: 0, y: 1.3, w: 10, h: 1.4, minH: 1.4, maxH: 1.4, minW: 4, isDraggable: false },
		{
			i: "chart",
			x: 0,
			y: 2.7,
			w: 10,
			h: 17.9,
			minH: 16,
			minW: 4,
			isDraggable: false,
			resizeHandles: ["e", "s", "se"],
		},
		{
			i: "marketData",
			x: 10,
			y: 20.6,
			w: 4,
			h: 20.4,
			minH: 16,
			minW: 4,
			isDraggable: false,
			resizeHandles: ["n", "w", "nw"],
		},
		{
			i: "tradingInterface",
			x: 10,
			y: 0,
			w: 4,
			h: 20.6,
			minH: 5,
			minW: 4,
			isDraggable: false,
			resizeHandles: ["w", "s", "sw"],
		},
		{
			i: "accountTable",
			x: 0,
			y: 20.6,
			w: 10,
			h: 30.4,
			minH: 10,
			minW: 4,
			maxW: 10,
			isDraggable: false,
			resizeHandles: ["e", "s", "se"],
		},
		{
			i: "accountInfo",
			x: 10,
			y: 41,
			w: 4,
			h: 10,
			minH: 8,
			minW: 4,
			isDraggable: false,
			resizeHandles: ["n", "w", "nw"],
		},
	],
} satisfies ResponsiveLayouts<DesktopGridBreakpoint>;

export function readDesktopGridLayouts(): ResponsiveLayouts<DesktopGridBreakpoint> {
	if (typeof window === "undefined") return DEFAULT_DESKTOP_GRID_LAYOUTS;

	try {
		removeLegacyDesktopGridLayouts();
		const stored = JSON.parse(window.localStorage.getItem(DESKTOP_GRID_STORAGE_KEY) ?? "null") as unknown;
		if (!isRecord(stored)) return DEFAULT_DESKTOP_GRID_LAYOUTS;

		return {
			lg: restoreLayout(stored.lg, DEFAULT_DESKTOP_GRID_LAYOUTS.lg, DESKTOP_GRID_COLS.lg),
			md: restoreLayout(stored.md, DEFAULT_DESKTOP_GRID_LAYOUTS.md, DESKTOP_GRID_COLS.md),
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
	} catch {
		return;
	}
}

function restoreLayout(value: unknown, defaults: Layout, cols: number): Layout {
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
			y: storedItem.y as number,
			w: storedItem.w as number,
			h: storedItem.h as number,
		};
	});

	return isInvalid || hasCollisions(restored) ? defaults : restored;
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

function removeLegacyDesktopGridLayouts(): void {
	for (const key of LEGACY_DESKTOP_GRID_STORAGE_KEYS) window.localStorage.removeItem(key);
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
