import type { HistoricalOrdersResponse } from "@nktkas/hyperliquid";
import { shouldReplaceHistoricalOrder } from "@sairn/hl-react/registries/historical-orders";
import Big from "big.js";

const UNSIGNED_DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

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

export function isValidHistoricalOrderHistoryItem(item: unknown): item is HistoricalOrdersResponse[number] {
	if (!isRecord(item) || !isRecord(item.order)) return false;
	const { order } = item;
	return (
		typeof item.status === "string" &&
		item.status.length > 0 &&
		typeof item.statusTimestamp === "number" &&
		Number.isSafeInteger(item.statusTimestamp) &&
		item.statusTimestamp >= 0 &&
		typeof order.oid === "number" &&
		Number.isSafeInteger(order.oid) &&
		order.oid >= 0 &&
		typeof order.timestamp === "number" &&
		Number.isSafeInteger(order.timestamp) &&
		order.timestamp >= 0 &&
		typeof order.coin === "string" &&
		order.coin.length > 0 &&
		typeof order.isTrigger === "boolean" &&
		typeof order.limitPx === "string" &&
		UNSIGNED_DECIMAL_PATTERN.test(order.limitPx) &&
		typeof order.orderType === "string" &&
		order.orderType.length > 0 &&
		typeof order.origSz === "string" &&
		UNSIGNED_DECIMAL_PATTERN.test(order.origSz) &&
		typeof order.reduceOnly === "boolean" &&
		(order.side === "A" || order.side === "B") &&
		typeof order.triggerPx === "string" &&
		UNSIGNED_DECIMAL_PATTERN.test(order.triggerPx)
	);
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
