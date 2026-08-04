import { shouldReplaceHistoricalOrder } from "@gatu/hl-react/registries/historical-orders";
import type { HistoricalOrdersResponse } from "@nktkas/hyperliquid";
import Big from "big.js";

type HistoricalOrderPriceFields = Pick<
	HistoricalOrdersResponse[number]["order"],
	"isTrigger" | "limitPx" | "orderType" | "triggerPx"
>;

export type HistoricalOrderPriceDisplay =
	| {
			kind: "limit";
			price: string;
	  }
	| {
			kind: "market";
			protectionPrice: string;
	  }
	| {
			kind: "trigger";
			triggerPrice: string | null;
			execution:
				| {
						kind: "market";
						protectionPrice: string;
				  }
				| {
						kind: "limit";
						price: string;
				  };
	  };

function isTriggerOrderType(orderType: HistoricalOrderPriceFields["orderType"]): boolean {
	return orderType.startsWith("Stop ") || orderType.startsWith("Take Profit ");
}

function getPositivePrice(price: string): string | null {
	try {
		return new Big(price).gt(0) ? price : null;
	} catch {
		return null;
	}
}

export function getHistoricalOrderPriceDisplay(order: HistoricalOrderPriceFields): HistoricalOrderPriceDisplay {
	if (!order.isTrigger && !isTriggerOrderType(order.orderType)) {
		if (order.orderType === "Market") {
			return {
				kind: "market",
				protectionPrice: order.limitPx,
			};
		}

		return {
			kind: "limit",
			price: order.limitPx,
		};
	}

	return {
		kind: "trigger",
		triggerPrice: getPositivePrice(order.triggerPx),
		execution: order.orderType.endsWith("Market")
			? {
					kind: "market",
					protectionPrice: order.limitPx,
				}
			: {
					kind: "limit",
					price: order.limitPx,
				},
	};
}

export function mergeHistoricalOrderSources(
	...sources: ReadonlyArray<HistoricalOrdersResponse | undefined>
): HistoricalOrdersResponse {
	const ordersById = new Map<number, HistoricalOrdersResponse[number]>();

	for (const source of sources) {
		for (const incoming of source ?? []) {
			const existing = ordersById.get(incoming.order.oid);
			if (!existing || shouldReplaceHistoricalOrder(existing, incoming)) {
				ordersById.set(incoming.order.oid, incoming);
			}
		}
	}

	return [...ordersById.values()].sort((a, b) => b.statusTimestamp - a.statusTimestamp);
}
