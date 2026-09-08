import { type Dispatch, type SetStateAction, useCallback } from "react";
import {
	type DesktopGridBreakpoint,
	type DesktopGridContentHeights,
	syncGridItemContentHeight,
} from "@/config/desktop-grid-layout";

export function useGridContentHeight(
	mounted: boolean,
	breakpoint: DesktopGridBreakpoint,
	itemId: string,
	setContentHeights: Dispatch<SetStateAction<DesktopGridContentHeights>>,
) {
	return useCallback(
		(node: HTMLDivElement | null) => {
			if (!mounted || !node) return;

			let animationFrame: number | null = null;
			let measuredNodes = getMeasuredNodes(node);
			const heights = new Map<Element, number>();
			function scheduleHeight() {
				if (measuredNodes.some((part) => !heights.has(part))) return;
				const contentHeight = measuredNodes.reduce((total, part) => total + (heights.get(part) ?? 0), 0);
				if (!Number.isFinite(contentHeight) || contentHeight <= 0) return;
				if (animationFrame !== null) cancelAnimationFrame(animationFrame);
				animationFrame = requestAnimationFrame(() => {
					setContentHeights((prev) => syncGridItemContentHeight(prev, breakpoint, itemId, contentHeight));
					animationFrame = null;
				});
			}
			const observer = new ResizeObserver((entries) => {
				for (const entry of entries) {
					const target = entry.target ?? measuredNodes[0];
					if (target) heights.set(target, entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
				}
				scheduleHeight();
			});
			for (const part of measuredNodes) observer.observe(part);
			const mutationObserver = new MutationObserver(() => {
				const nextNodes = getMeasuredNodes(node);
				if (
					nextNodes.length === measuredNodes.length &&
					nextNodes.every((part, index) => part === measuredNodes[index])
				)
					return;
				if (animationFrame !== null) cancelAnimationFrame(animationFrame);
				observer.disconnect();
				heights.clear();
				measuredNodes = nextNodes;
				for (const part of measuredNodes) observer.observe(part);
			});
			mutationObserver.observe(node, { childList: true, subtree: true });

			return () => {
				if (animationFrame !== null) cancelAnimationFrame(animationFrame);
				observer.disconnect();
				mutationObserver.disconnect();
			};
		},
		[breakpoint, itemId, mounted, setContentHeights],
	);
}

function getMeasuredNodes(node: HTMLDivElement): Element[] {
	const parts = [...node.querySelectorAll("[data-grid-content-part]")];
	return parts.length ? parts : [node];
}
