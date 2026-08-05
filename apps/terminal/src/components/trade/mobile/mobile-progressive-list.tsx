import { type ReactNode, useEffect, useRef, useState } from "react";

export const MOBILE_PROGRESSIVE_LIST_BATCH_SIZE = 24;

interface Props<T> {
	items: readonly T[];
	children: (visibleItems: readonly T[]) => ReactNode;
}

function getScrollRoot(element: HTMLElement): Element | null {
	let ancestor = element.parentElement;
	while (ancestor) {
		const overflowY = window.getComputedStyle(ancestor).overflowY;
		if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") return ancestor;
		ancestor = ancestor.parentElement;
	}
	return null;
}

export function MobileProgressiveList<T>({ items, children }: Props<T>) {
	const [visibleCount, setVisibleCount] = useState(MOBILE_PROGRESSIVE_LIST_BATCH_SIZE);
	const sentinelRef = useRef<HTMLDivElement>(null);
	const visibleItems = items.slice(0, visibleCount);
	const hasMore = visibleItems.length < items.length;

	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!hasMore || !sentinel) return;
		if (typeof IntersectionObserver === "undefined") {
			setVisibleCount(items.length);
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				observer.disconnect();
				setVisibleCount(Math.min(visibleCount + MOBILE_PROGRESSIVE_LIST_BATCH_SIZE, items.length));
			},
			{ root: getScrollRoot(sentinel), rootMargin: "480px 0px" },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [hasMore, items.length, visibleCount]);

	return (
		<>
			{children(visibleItems)}
			{hasMore ? (
				<div
					ref={sentinelRef}
					data-testid="mobile-progressive-list-sentinel"
					aria-hidden="true"
					className="-mt-2.5 h-px w-full"
				/>
			) : null}
		</>
	);
}
