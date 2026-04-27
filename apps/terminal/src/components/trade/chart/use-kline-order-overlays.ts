import Big from "big.js";
import type { Chart } from "klinecharts";
import { type RefObject, useEffect } from "react";
import { useConnection } from "wagmi";
import { HL_ALL_DEXS } from "@/config/app";
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

	useEffect(() => {
		const chart = chartRef.current;
		if (!chart) return;

		chart.removeOverlay({ name: ORDER_LINE_NAME });

		const orders = openOrdersEvent?.orders;
		if (!orders) return;

		const symbolOrders = orders.filter((o) => o.coin === symbol);

		for (const order of symbolOrders) {
			const rawPrice = order.isTrigger ? order.triggerPx : order.limitPx;
			const price = Big(rawPrice).toNumber();
			if (!Number.isFinite(price)) continue;

			const label = getOrderLineLabel(order);

			chart.createOverlay({
				name: ORDER_LINE_NAME,
				points: [{ value: price }],
				modeSensitivity: 0,
				styles: {
					rect: { color: "transparent", borderColor: "transparent", borderSize: 0 },
					polygon: { color: "transparent", borderColor: "transparent", borderSize: 0 },
				},
				extendData: {
					side: order.side,
					label,
				},
			});
		}
	}, [openOrdersEvent, symbol]);
}
