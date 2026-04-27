import Big from "big.js";
import type { Chart } from "klinecharts";
import { type RefObject, useEffect } from "react";
import { useConnection } from "wagmi";
import { POSITION_LINE_NAME } from "@/lib/chart/position-line-overlay";
import { useSubscription } from "@/lib/hyperliquid";

interface Params {
	chartRef: RefObject<Chart | null>;
	symbol: string;
}

export function useKlinePositionOverlays({ chartRef, symbol }: Params) {
	const { address, isConnected } = useConnection();

	const { data: clearinghouseEvent } = useSubscription(
		"allDexsClearinghouseState",
		{ user: address ?? "" },
		{ enabled: isConnected && !!address },
	);

	useEffect(() => {
		const chart = chartRef.current;
		if (!chart) return;

		chart.removeOverlay({ name: POSITION_LINE_NAME });

		const states = clearinghouseEvent?.clearinghouseStates;
		if (!states) return;

		const mainDex = states.find(([dex]) => dex === "")?.[1];
		if (!mainDex) return;

		const position = mainDex.assetPositions.find((p) => p.position.coin === symbol);
		if (!position) return;

		const entryPxBig = Big(position.position.entryPx);
		const sziBig = Big(position.position.szi);
		if (sziBig.eq(0)) return;
		const entryPx = entryPxBig.toNumber();

		chart.createOverlay({
			name: POSITION_LINE_NAME,
			points: [{ value: entryPx }],
			modeSensitivity: 0,
			styles: {
				rect: { color: "transparent", borderColor: "transparent", borderSize: 0 },
				polygon: { color: "transparent", borderColor: "transparent", borderSize: 0 },
			},
			extendData: {
				isLong: sziBig.gt(0),
			},
		});
	}, [clearinghouseEvent, symbol]);
}
