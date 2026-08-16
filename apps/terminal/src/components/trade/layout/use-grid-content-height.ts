import { type Dispatch, type SetStateAction, useCallback } from "react";
import type { ResponsiveLayouts } from "react-grid-layout";
import { type DesktopGridBreakpoint, syncGridItemContentHeight } from "@/config/desktop-grid-layout";

/**
 * Syncs a grid item's height to its rendered content.
 *
 * Returns a callback ref so the observer attaches only while the measured node is
 * mounted. Attach it *inside* the panel's Suspense boundary — measuring a wrapper
 * that also hosts the fallback would feed the placeholder's height into the layout
 * and persist that transient geometry.
 */
export function useGridContentHeight(
	mounted: boolean,
	breakpoint: DesktopGridBreakpoint,
	itemId: string,
	setLayouts: Dispatch<SetStateAction<ResponsiveLayouts<DesktopGridBreakpoint>>>,
) {
	return useCallback(
		(node: HTMLDivElement | null) => {
			if (!mounted || !node) return;

			const observer = new ResizeObserver(([entry]) => {
				if (!entry) return;
				const contentHeight = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
				if (!Number.isFinite(contentHeight) || contentHeight <= 0) return;
				setLayouts((prev) => syncGridItemContentHeight(prev, breakpoint, itemId, contentHeight));
			});
			observer.observe(node);

			return () => observer.disconnect();
		},
		[breakpoint, itemId, mounted, setLayouts],
	);
}
