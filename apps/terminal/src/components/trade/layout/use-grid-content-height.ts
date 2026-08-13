import { type Dispatch, type SetStateAction, useEffect, useRef } from "react";
import type { ResponsiveLayouts } from "react-grid-layout";
import { type DesktopGridBreakpoint, syncGridItemContentHeight } from "@/config/desktop-grid-layout";

export function useGridContentHeight(
	mounted: boolean,
	breakpoint: DesktopGridBreakpoint,
	itemId: string,
	setLayouts: Dispatch<SetStateAction<ResponsiveLayouts<DesktopGridBreakpoint>>>,
) {
	const contentRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!mounted) return;
		const node = contentRef.current;
		if (!node) return;

		const observer = new ResizeObserver(([entry]) => {
			if (!entry) return;
			const contentHeight = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
			if (!Number.isFinite(contentHeight) || contentHeight <= 0) return;
			setLayouts((prev) => syncGridItemContentHeight(prev, breakpoint, itemId, contentHeight));
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, [breakpoint, itemId, mounted, setLayouts]);

	return contentRef;
}
