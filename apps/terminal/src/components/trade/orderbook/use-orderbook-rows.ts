import { useCallback, useState } from "react";
import { getOrderbookLadderLayout, ORDERBOOK_ROW_METRICS } from "@/lib/ui/orderbook-layout";

const SPREAD_SELECTOR = "[data-slot='orderbook-spread']";

export function useOrderbookRows() {
	const [sideHeight, setSideHeight] = useState(0);

	const containerRef = useCallback((node: HTMLDivElement | null) => {
		if (!node) return;
		const spread = node.querySelector(SPREAD_SELECTOR);

		function measure() {
			if (!node) return;
			const height = node.getBoundingClientRect().height;
			const spreadHeight = spread?.getBoundingClientRect().height ?? 0;
			setSideHeight((height - spreadHeight) / 2);
		}

		measure();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(measure);
		observer.observe(node);
		if (spread) observer.observe(spread);
		return () => observer.disconnect();
	}, []);

	const layout =
		sideHeight > 0
			? getOrderbookLadderLayout(sideHeight, ORDERBOOK_ROW_METRICS.default)
			: { rowCount: 20, fullRowCount: 0, rowHeightPx: ORDERBOOK_ROW_METRICS.default.rowHeightPx };
	return [layout, containerRef] as const;
}
