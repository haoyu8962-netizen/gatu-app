import type { FrontendOpenOrdersResponse } from "@nktkas/hyperliquid";
import { OPEN_ORDER_TYPE_PREFIXES } from "@/config/trade";
import { toBig } from "@/lib/trade/numbers";

export type OpenOrder = FrontendOpenOrdersResponse[number];

export type OrderSide = OpenOrder["side"];

export interface TpSlOrderInfo {
	tpPrice?: number;
	slPrice?: number;
	tpOrderId?: number;
	slOrderId?: number;
}

function optionalPricesEqual(left: number | undefined, right: number | undefined): boolean {
	if (left === undefined || right === undefined) return left === right;
	const leftPrice = toBig(left);
	const rightPrice = toBig(right);
	return leftPrice !== null && rightPrice !== null && leftPrice.eq(rightPrice);
}

export function areTpSlOrderInfosEqual(left: TpSlOrderInfo | undefined, right: TpSlOrderInfo | undefined): boolean {
	return (
		left?.tpOrderId === right?.tpOrderId &&
		left?.slOrderId === right?.slOrderId &&
		optionalPricesEqual(left?.tpPrice, right?.tpPrice) &&
		optionalPricesEqual(left?.slPrice, right?.slPrice)
	);
}

export function isTakeProfitOrder(order: OpenOrder): boolean {
	return order.orderType.startsWith(OPEN_ORDER_TYPE_PREFIXES.takeProfit);
}

export function isStopOrder(order: OpenOrder): boolean {
	return order.orderType.startsWith(OPEN_ORDER_TYPE_PREFIXES.stop);
}

export function isMarketTriggerOrder(order: OpenOrder): boolean {
	return order.isTrigger && order.orderType.endsWith("Market");
}

export function isClosePositionOrder(order: OpenOrder): boolean {
	if (!order.isPositionTpsl) return false;
	const origSz = toBig(order.origSz);
	return !!origSz && origSz.eq(0);
}

export function getFilledSize(order: OpenOrder): number {
	const origSz = toBig(order.origSz);
	const remaining = toBig(order.sz);
	if (!origSz || !remaining) return Number.NaN;
	return origSz.minus(remaining).toNumber();
}

export function getFillPercent(order: OpenOrder): number {
	const origSz = toBig(order.origSz);
	const filled = getFilledSize(order);
	if (!origSz || origSz.eq(0) || !Number.isFinite(filled)) return 0;
	return toBig(filled)?.div(origSz).times(100).toNumber() ?? 0;
}

export function getOrderValue(order: OpenOrder): number | null {
	const limitPx = toBig(order.limitPx);
	const origSz = toBig(order.origSz);
	if (!limitPx || !origSz) return null;
	return limitPx.times(origSz).toNumber();
}

export function buildTpSlOrdersByCoin(orders: readonly OpenOrder[]): Map<string, TpSlOrderInfo> {
	const map = new Map<string, TpSlOrderInfo>();
	for (const order of orders) {
		if (!order.isTrigger || !isClosePositionOrder(order)) continue;

		const triggerPx = toBig(order.triggerPx)?.toNumber();
		if (!triggerPx || triggerPx <= 0) continue;

		const existing = map.get(order.coin) ?? {};
		if (isTakeProfitOrder(order) && !existing.tpPrice) {
			existing.tpPrice = triggerPx;
			existing.tpOrderId = order.oid;
		} else if (isStopOrder(order) && !existing.slPrice) {
			existing.slPrice = triggerPx;
			existing.slOrderId = order.oid;
		}
		map.set(order.coin, existing);
	}
	return map;
}

export interface OrderTypeConfig {
	triggerKind: "stop" | "takeProfit" | null;
	triggerClass: string | null;
	executionKind: "market" | "limit";
	reduceOnly: boolean;
}

export function getOrderTypeConfig(order: OpenOrder): OrderTypeConfig {
	const reduceOnly = order.reduceOnly;

	let triggerKind: "stop" | "takeProfit" | null = null;
	let triggerClass: string | null = null;
	if (isStopOrder(order)) {
		triggerKind = "stop";
		triggerClass = "text-warning";
	} else if (isTakeProfitOrder(order)) {
		triggerKind = "takeProfit";
		triggerClass = "text-success";
	}

	const executionKind = order.orderType.endsWith("Market") ? "market" : "limit";

	return { triggerKind, triggerClass, executionKind, reduceOnly };
}
