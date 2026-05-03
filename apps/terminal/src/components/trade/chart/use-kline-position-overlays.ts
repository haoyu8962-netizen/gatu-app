import Big from "big.js";
import type { Chart } from "klinecharts";
import { type RefObject, useEffect } from "react";
import { LIQUIDATION_LINE_NAME } from "@/lib/chart/liquidation-line-overlay";
import { POSITION_LINE_NAME } from "@/lib/chart/position-line-overlay";
import { useUserPositions } from "@/lib/hyperliquid";

interface Params {
	chartRef: RefObject<Chart | null>;
	symbol: string;
	dex?: string;
}

const TRANSPARENT_OVERLAY_STYLES = {
	rect: { color: "transparent", borderColor: "transparent", borderSize: 0 },
	polygon: { color: "transparent", borderColor: "transparent", borderSize: 0 },
};

export function useKlinePositionOverlays({ chartRef, symbol, dex }: Params) {
	const { getPosition } = useUserPositions();
	const position = getPosition(symbol, dex) ?? getPosition(getShortBuilderSymbol(symbol), dex);
	const szi = position?.szi;
	const entryPx = position?.entryPx;
	const liquidationPx = position?.liquidationPx;

	useEffect(() => {
		const chart = chartRef.current;
		if (!chart) return;

		chart.removeOverlay({ name: POSITION_LINE_NAME });
		chart.removeOverlay({ name: LIQUIDATION_LINE_NAME });

		if (szi == null || entryPx == null) return;

		const sziBig = Big(szi);
		if (sziBig.eq(0)) return;

		chart.createOverlay({
			name: POSITION_LINE_NAME,
			points: [{ value: Big(entryPx).toNumber() }],
			modeSensitivity: 0,
			styles: TRANSPARENT_OVERLAY_STYLES,
			extendData: { isLong: sziBig.gt(0) },
		});

		if (liquidationPx != null) {
			const liqPxBig = Big(liquidationPx);
			if (liqPxBig.gt(0)) {
				chart.createOverlay({
					name: LIQUIDATION_LINE_NAME,
					points: [{ value: liqPxBig.toNumber() }],
					modeSensitivity: 0,
					styles: TRANSPARENT_OVERLAY_STYLES,
				});
			}
		}
	}, [chartRef, symbol, dex, szi, entryPx, liquidationPx]);
}

function getShortBuilderSymbol(symbol: string): string {
	const separatorIndex = symbol.indexOf(":");
	if (separatorIndex === -1) return symbol;
	return symbol.slice(separatorIndex + 1);
}
