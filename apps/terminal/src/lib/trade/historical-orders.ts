import type { HistoricalOrdersResponse } from "@nktkas/hyperliquid";
import Big from "big.js";

type HistoricalOrderPriceFields = Pick<
	HistoricalOrdersResponse[number]["order"],
	"isTrigger" | "limitPx" | "orderType" | "triggerPx"
>;

export type HistoricalOrderPriceDisplay =
	| {
			kind: "price";
			price: string;
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
		return {
			kind: "price",
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
