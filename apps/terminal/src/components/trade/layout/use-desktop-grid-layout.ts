import { useEffect, useMemo, useState } from "react";
import type { ResponsiveGridLayoutProps } from "react-grid-layout";
import {
	DESKTOP_GRID_BREAKPOINTS,
	DESKTOP_GRID_COLS,
	DESKTOP_GRID_GAP_PX,
	DESKTOP_GRID_ROW_HEIGHT_PX,
	type DesktopGridContentHeights,
	desktopGridCompactor,
	getDesktopGridBreakpoint,
	getDesktopGridLayouts,
	readDesktopGridLayouts,
	resizeDesktopGridLayout,
	syncGridItemResize,
	writeDesktopGridLayouts,
} from "@/config/desktop-grid-layout";
import { useGridContentHeight } from "./use-grid-content-height";

const spacing = [DESKTOP_GRID_GAP_PX, DESKTOP_GRID_GAP_PX] as const;

export function useDesktopGridLayout(width: number, mounted: boolean) {
	const [layouts, setLayouts] = useState(readDesktopGridLayouts);
	const [contentHeights, setContentHeights] = useState<DesktopGridContentHeights>({});
	const renderedLayouts = useMemo(() => getDesktopGridLayouts(layouts, contentHeights), [layouts, contentHeights]);
	const breakpoint = getDesktopGridBreakpoint(width);
	const accountContentRef = useGridContentHeight(mounted, breakpoint, "accountInfo", setContentHeights);

	useEffect(() => writeDesktopGridLayouts(layouts), [layouts]);

	const gridProps = {
		width,
		layouts: renderedLayouts,
		compactor: desktopGridCompactor,
		breakpoints: DESKTOP_GRID_BREAKPOINTS,
		cols: DESKTOP_GRID_COLS,
		rowHeight: DESKTOP_GRID_ROW_HEIGHT_PX,
		margin: spacing,
		containerPadding: spacing,
		dragConfig: { enabled: false },
		resizeConfig: { enabled: true },
		onResize(layout, _oldItem, resizedItem) {
			if (!resizedItem) return;
			const resized = resizeDesktopGridLayout(
				renderedLayouts[breakpoint] ?? [],
				resizedItem,
				DESKTOP_GRID_COLS[breakpoint],
			);
			for (const item of layout) {
				const aligned = resized.find((candidate) => candidate.i === item.i);
				if (aligned) Object.assign(item, aligned);
			}
		},
		onResizeStop(_layout, oldItem, resizedItem) {
			if (!resizedItem) return;
			setLayouts((previous) => syncGridItemResize(previous, breakpoint, resizedItem, oldItem ?? undefined));
		},
	} satisfies Omit<ResponsiveGridLayoutProps, "children">;

	return { gridProps, accountContentRef };
}
