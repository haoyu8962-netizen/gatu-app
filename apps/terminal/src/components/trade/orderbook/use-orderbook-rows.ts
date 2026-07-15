import { useCallback, useState } from "react";

const ROW_HEIGHT = 23;
const ROW_GAP = 2;
const MIN_ROWS_PER_SIDE = 3;
const MAX_ROWS_PER_SIDE = 20;
const SPREAD_SELECTOR = "[data-slot='orderbook-spread']";

export function getVisibleOrderbookRowCount(containerHeight: number, spreadHeight: number): number {
	const availablePerSide = (containerHeight - spreadHeight) / 2;
	const rows = Math.floor((availablePerSide + ROW_GAP) / (ROW_HEIGHT + ROW_GAP));
	return Math.min(MAX_ROWS_PER_SIDE, Math.max(MIN_ROWS_PER_SIDE, rows));
}

export function useOrderbookRows() {
	const [visibleRows, setVisibleRows] = useState(MAX_ROWS_PER_SIDE);

	const containerRef = useCallback((node: HTMLDivElement | null) => {
		if (!node) return;

		function calculate(el: HTMLDivElement) {
			const height = el.clientHeight;
			if (height === 0) return;
			const spreadHeight = el.querySelector(SPREAD_SELECTOR)?.clientHeight ?? 0;
			setVisibleRows(getVisibleOrderbookRowCount(height, spreadHeight));
		}

		calculate(node);

		const observer = new ResizeObserver(() => calculate(node));
		observer.observe(node);

		return () => observer.disconnect();
	}, []);

	return [visibleRows, containerRef] as const;
}
