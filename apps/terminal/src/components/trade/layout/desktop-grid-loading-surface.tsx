import type { CSSProperties, ReactNode } from "react";

const GRID_ROW_HEIGHT_PX = 30;
const GRID_GAP_PX = 3;
const GRID_PADDING_PX = 3;

const GRID_COLS = {
	lg: 16,
	md: 14,
} as const;

export const DEFAULT_DESKTOP_GRID_LOADING_LAYOUTS = {
	lg: [
		{ i: "favoriteCoins", x: 0, y: 0, w: 10, h: 1.3 },
		{ i: "coinInfo", x: 0, y: 1.3, w: 10, h: 1.4 },
		{ i: "chart", x: 0, y: 2.7, w: 10, h: 17.7 },
		{ i: "marketData", x: 10, y: 0, w: 3, h: 20.4 },
		{ i: "tradingInterface", x: 13, y: 0, w: 3, h: 20.4 },
		{ i: "accountTable", x: 0, y: 20.4, w: 13, h: 14 },
		{ i: "accountInfo", x: 13, y: 20.4, w: 3, h: 14 },
	],
	md: [
		{ i: "favoriteCoins", x: 0, y: 0, w: 8, h: 1.3 },
		{ i: "coinInfo", x: 0, y: 1.3, w: 8, h: 1.4 },
		{ i: "chart", x: 0, y: 2.7, w: 8, h: 17.9 },
		{ i: "marketData", x: 8, y: 0, w: 3, h: 20.6 },
		{ i: "tradingInterface", x: 11, y: 0, w: 3, h: 20.6 },
		{ i: "accountTable", x: 0, y: 20.6, w: 11, h: 14 },
		{ i: "accountInfo", x: 11, y: 20.6, w: 3, h: 14 },
	],
} as const;

export type DesktopGridLoadingBreakpoint = keyof typeof DEFAULT_DESKTOP_GRID_LOADING_LAYOUTS;
export type DesktopGridLoadingPanelId = (typeof DEFAULT_DESKTOP_GRID_LOADING_LAYOUTS.md)[number]["i"];

type GridItem = (typeof DEFAULT_DESKTOP_GRID_LOADING_LAYOUTS)[DesktopGridLoadingBreakpoint][number];
type PanelPosition = {
	leftPercent: number;
	leftPx: number;
	widthPercent: number;
	widthPx: number;
	topPx: number;
	heightPx: number;
};
type PanelCssVariable = `--dgl-${DesktopGridLoadingBreakpoint}-${"h" | "l" | "t" | "w"}`;
type PanelStyle = CSSProperties & Record<PanelCssVariable, string>;
type ContainerStyle = CSSProperties & Record<"--dgl-lg-container-h" | "--dgl-md-container-h", string>;

const PANEL_CLASS_NAME =
	"absolute [left:var(--dgl-md-l)] [top:var(--dgl-md-t)] [width:var(--dgl-md-w)] [height:var(--dgl-md-h)] min-[1421px]:[left:var(--dgl-lg-l)] min-[1421px]:[top:var(--dgl-lg-t)] min-[1421px]:[width:var(--dgl-lg-w)] min-[1421px]:[height:var(--dgl-lg-h)]";

const CONTAINER_STYLE: ContainerStyle = {
	"--dgl-lg-container-h": `${getDesktopGridLoadingContainerHeight("lg")}px`,
	"--dgl-md-container-h": `${getDesktopGridLoadingContainerHeight("md")}px`,
};

const PANEL_PRESENTATIONS = DEFAULT_DESKTOP_GRID_LOADING_LAYOUTS.md.map((mdItem) => {
	const lgItem = DEFAULT_DESKTOP_GRID_LOADING_LAYOUTS.lg.find((item) => item.i === mdItem.i);
	if (!lgItem) throw new Error(`Missing lg loading geometry for ${mdItem.i}`);
	const style: PanelStyle = {
		...getPanelCssVariables("md", mdItem),
		...getPanelCssVariables("lg", lgItem),
	};

	return {
		i: mdItem.i,
		style,
	};
});

export function DesktopGridLoadingSurface({
	markShellPanels = false,
	panelClassName,
	renderPanel,
}: {
	markShellPanels?: boolean;
	panelClassName: string;
	renderPanel?: (panelId: DesktopGridLoadingPanelId) => ReactNode;
}) {
	return (
		<div
			aria-hidden="true"
			data-desktop-grid-loading-surface
			className="relative w-full [height:var(--dgl-md-container-h)] min-[1421px]:[height:var(--dgl-lg-container-h)]"
			style={CONTAINER_STYLE}
		>
			{PANEL_PRESENTATIONS.map((panel) => (
				<div
					key={panel.i}
					data-desktop-grid-loading-panel={panel.i}
					data-shell-panel={markShellPanels ? "" : undefined}
					className={`${panelClassName} ${PANEL_CLASS_NAME}`}
					style={panel.style}
				>
					{renderPanel?.(panel.i)}
				</div>
			))}
		</div>
	);
}

export function getDesktopGridLoadingContainerHeight(breakpoint: DesktopGridLoadingBreakpoint): number {
	const rows = Math.max(...DEFAULT_DESKTOP_GRID_LOADING_LAYOUTS[breakpoint].map((item) => item.y + item.h));
	return rows * GRID_ROW_HEIGHT_PX + (rows - 1) * GRID_GAP_PX + GRID_PADDING_PX * 2;
}

export function getDesktopGridLoadingPanelRect(
	breakpoint: DesktopGridLoadingBreakpoint,
	containerWidthPx: number,
	panelId: DesktopGridLoadingPanelId,
) {
	const item = DEFAULT_DESKTOP_GRID_LOADING_LAYOUTS[breakpoint].find((candidate) => candidate.i === panelId);
	if (!item) throw new Error(`Missing ${breakpoint} loading geometry for ${panelId}`);

	const position = getPanelPosition(breakpoint, item);
	return {
		left: (containerWidthPx * position.leftPercent) / 100 + position.leftPx,
		top: position.topPx,
		width: (containerWidthPx * position.widthPercent) / 100 + position.widthPx,
		height: position.heightPx,
	};
}

function getPanelCssVariables(breakpoint: DesktopGridLoadingBreakpoint, item: GridItem) {
	const position = getPanelPosition(breakpoint, item);
	return {
		[`--dgl-${breakpoint}-l`]: toCssLength(position.leftPercent, position.leftPx),
		[`--dgl-${breakpoint}-t`]: `${position.topPx}px`,
		[`--dgl-${breakpoint}-w`]: toCssLength(position.widthPercent, position.widthPx),
		[`--dgl-${breakpoint}-h`]: `${position.heightPx}px`,
	} as Record<PanelCssVariable, string>;
}

function getPanelPosition(breakpoint: DesktopGridLoadingBreakpoint, item: GridItem): PanelPosition {
	const cols = GRID_COLS[breakpoint];
	const unavailableWidth = GRID_PADDING_PX * 2 + GRID_GAP_PX * (cols - 1);
	const topPx = Math.round((GRID_ROW_HEIGHT_PX + GRID_GAP_PX) * item.y + GRID_PADDING_PX);
	const bottomPx = Math.round((GRID_ROW_HEIGHT_PX + GRID_GAP_PX) * (item.y + item.h) + GRID_PADDING_PX);

	return {
		leftPercent: (item.x / cols) * 100,
		leftPx: GRID_PADDING_PX + item.x * GRID_GAP_PX - (item.x / cols) * unavailableWidth,
		widthPercent: (item.w / cols) * 100,
		widthPx: Math.max(0, item.w - 1) * GRID_GAP_PX - (item.w / cols) * unavailableWidth,
		topPx,
		heightPx: bottomPx - topPx - GRID_GAP_PX,
	};
}

function toCssLength(percent: number, pixels: number): string {
	const formattedPercent = formatCssNumber(percent);
	const formattedPixels = formatCssNumber(Math.abs(pixels));
	const operator = pixels < 0 ? "-" : "+";
	return `calc(${formattedPercent}% ${operator} ${formattedPixels}px)`;
}

function formatCssNumber(value: number): string {
	return String(Math.round(value * 1_000_000) / 1_000_000);
}
