import type { FrontendOpenOrdersResponse } from "@nktkas/hyperliquid";
import { OPEN_ORDER_TYPE_PREFIXES } from "@/config/trade";
import { toBig } from "@/lib/trade/numbers";

export type OpenOrder = FrontendOpenOrdersResponse[number];

export type OrderSide = OpenOrder["side"];

export interface TpSlOrderInfo {
	tpPrice?: string;
	slPrice?: string;
	tpOrderId?: number;
	slOrderId?: number;
	tpSize?: string;
	slSize?: string;
	tpIsMarket?: boolean;
	slIsMarket?: boolean;
	tpLimitPrice?: string;
	slLimitPrice?: string;
	tpSide?: OrderSide;
	slSide?: OrderSide;
	ambiguous?: boolean;
	incompatible?: boolean;
}

function optionalDecimalsEqual(left: string | undefined, right: string | undefined): boolean {
	if (left === undefined || right === undefined) return left === right;
	const leftValue = toBig(left);
	const rightValue = toBig(right);
	if (!leftValue || !rightValue) return left === right;
	return leftValue.eq(rightValue);
}

export function areTpSlOrderInfosEqual(left: TpSlOrderInfo | undefined, right: TpSlOrderInfo | undefined): boolean {
	return (
		left?.tpOrderId === right?.tpOrderId &&
		left?.slOrderId === right?.slOrderId &&
		optionalDecimalsEqual(left?.tpPrice, right?.tpPrice) &&
		optionalDecimalsEqual(left?.slPrice, right?.slPrice) &&
		optionalDecimalsEqual(left?.tpSize, right?.tpSize) &&
		optionalDecimalsEqual(left?.slSize, right?.slSize) &&
		left?.tpIsMarket === right?.tpIsMarket &&
		left?.slIsMarket === right?.slIsMarket &&
		optionalDecimalsEqual(left?.tpLimitPrice, right?.tpLimitPrice) &&
		optionalDecimalsEqual(left?.slLimitPrice, right?.slLimitPrice) &&
		left?.tpSide === right?.tpSide &&
		left?.slSide === right?.slSide &&
		(left?.ambiguous ?? false) === (right?.ambiguous ?? false) &&
		(left?.incompatible ?? false) === (right?.incompatible ?? false)
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
	const sidesByCoin = new Map<string, Partial<Record<"tp" | "sl", OrderSide>>>();
	for (const order of orders) {
		if (!order.isTrigger || !order.isPositionTpsl) continue;

		const existing = map.get(order.coin) ?? { ambiguous: false, incompatible: false };
		const sides = sidesByCoin.get(order.coin) ?? {};
		if (isTakeProfitOrder(order)) {
			assignTpSlLeg(existing, sides, "tp", order);
		} else if (isStopOrder(order)) {
			assignTpSlLeg(existing, sides, "sl", order);
		} else {
			existing.incompatible = true;
		}
		if (hasIncompatibleTpSlConfiguration(existing, sides)) existing.incompatible = true;
		map.set(order.coin, existing);
		sidesByCoin.set(order.coin, sides);
	}
	return map;
}

function assignTpSlLeg(
	info: TpSlOrderInfo,
	sides: Partial<Record<"tp" | "sl", OrderSide>>,
	leg: "tp" | "sl",
	order: OpenOrder,
): void {
	const priceKey = leg === "tp" ? "tpPrice" : "slPrice";
	const orderIdKey = leg === "tp" ? "tpOrderId" : "slOrderId";
	const sizeKey = leg === "tp" ? "tpSize" : "slSize";
	const isMarketKey = leg === "tp" ? "tpIsMarket" : "slIsMarket";
	const limitPriceKey = leg === "tp" ? "tpLimitPrice" : "slLimitPrice";
	const sideKey = leg === "tp" ? "tpSide" : "slSide";
	const isMarket = isMarketTriggerOrder(order);
	const triggerPx = normalizeDecimal(order.triggerPx);
	const size = normalizeDecimal(order.sz);
	const limitPx = normalizeDecimal(order.limitPx);

	if (info[orderIdKey] !== undefined) {
		info.ambiguous = true;
		if (
			!optionalDecimalsEqual(info[priceKey], triggerPx) ||
			!optionalDecimalsEqual(info[sizeKey], size) ||
			info[isMarketKey] !== isMarket ||
			!optionalDecimalsEqual(info[limitPriceKey], limitPx) ||
			sides[leg] !== order.side
		) {
			info.incompatible = true;
		}
		return;
	}

	info[priceKey] = triggerPx;
	info[orderIdKey] = order.oid;
	info[sizeKey] = size;
	info[isMarketKey] = isMarket;
	info[limitPriceKey] = limitPx;
	info[sideKey] = order.side;
	sides[leg] = order.side;
	if (!isValidPositionTpSlLeg(order)) info.incompatible = true;
}

function normalizeDecimal(value: string): string {
	return toBig(value)?.toString() ?? value;
}

function isValidPositionTpSlLeg(order: OpenOrder): boolean {
	const triggerPrice = toBig(order.triggerPx);
	const size = toBig(order.sz);
	const limitPrice = toBig(order.limitPx);
	if (!triggerPrice?.gt(0) || !size || size.lt(0) || !limitPrice?.gt(0) || !order.reduceOnly) return false;
	if (isMarketTriggerOrder(order)) return true;
	return order.side === "B" ? limitPrice.gte(triggerPrice) : limitPrice.lte(triggerPrice);
}

function hasIncompatibleTpSlConfiguration(
	info: TpSlOrderInfo,
	sides: Partial<Record<"tp" | "sl", OrderSide>>,
): boolean {
	if (info.tpOrderId === undefined || info.slOrderId === undefined) return false;
	return (
		!optionalDecimalsEqual(info.tpSize, info.slSize) || info.tpIsMarket !== info.slIsMarket || sides.tp !== sides.sl
	);
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
