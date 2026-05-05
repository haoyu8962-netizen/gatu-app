import Big from "big.js";
import type { Chart } from "klinecharts";
import { type RefObject, useEffect, useMemo } from "react";
import { useConnection } from "wagmi";
import { HL_ALL_DEXS } from "@/config/app";
import { TRANSPARENT_OVERLAY_STYLES } from "@/lib/chart/kline-styles";
import { ORDER_LINE_NAME } from "@/lib/chart/order-line-overlay";
import { useSubscription } from "@/lib/hyperliquid";
import { getOrderLineLabel } from "@/lib/trade/open-orders";

interface Params {
	chartRef: RefObject<Chart | null>;
	symbol: string;
}

export function useKlineOrderOverlays({ chartRef, symbol }: Params) {
	const { address, isConnected } = useConnection();

	const { data: openOrdersEvent } = useSubscription(
		"openOrders",
		{ user: address ?? "0x0", dex: HL_ALL_DEXS },
		{ enabled: isConnected && !!address },
	);

	const openOrders = openOrdersEvent?.orders;
	const symbolOrders = useMemo(() => openOrders?.filter((order) => order.coin === symbol) ?? [], [openOrders, symbol]);

	useEffect(() => {
		const chart = chartRef.current;
		if (!chart || !symbol) return;

		chart.removeOverlay({ name: ORDER_LINE_NAME });

		for (const order of symbolOrders) {
			const rawPrice = order.isTrigger ? order.triggerPx : order.limitPx;
			const price = Big(rawPrice).toNumber();
			if (!Number.isFinite(price)) continue;

			chart.createOverlay({
				name: ORDER_LINE_NAME,
				points: [{ value: price }],
				modeSensitivity: 0,
				styles: TRANSPARENT_OVERLAY_STYLES,
				extendData: {
					side: order.side,
					label: getOrderLineLabel(order),
				},
			});
		}
	}, [chartRef, symbol, symbolOrders]);
}
