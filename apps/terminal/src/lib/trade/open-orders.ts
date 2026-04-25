import type { FrontendOpenOrdersResponse } from "@nktkas/hyperliquid";
import { OPEN_ORDER_TYPE_PREFIXES, OPEN_ORDER_TYPE_SHORT_LABELS } from "@/config/trade";
import type { MarketKind } from "@/lib/hyperliquid/markets";
import { toBig } from "@/lib/trade/numbers";

export type OpenOrder = FrontendOpenOrdersResponse[number];

export type OrderSide = OpenOrder["side"];

export interface TpSlOrderInfo {
	tpPrice?: number;
	slPrice?: number;
	tpOrderId?: number;
	slOrderId?: number;
}

const ORDER_TYPE_CLASS = {
	takeProfit: "bg-success-soft text-success",
	stop: "bg-warning-soft text-warning",
	default: "text-fg-muted",
} as const;

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

export function getSideLabel(side: OrderSide, kind?: MarketKind): string {
	if (kind === "spot") return side === "B" ? "buy" : "sell";
	return side === "B" ? "long" : "short";
}

export function buildTpSlOrdersByCoin(orders: readonly OpenOrder[]): Map<string, TpSlOrderInfo> {
	const map = new Map<string, TpSlOrderInfo>();
	for (const order of orders) {
		if (!order.isTrigger) continue;

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

export function getOrderLineLabel(order: OpenOrder): string {
	if (isTakeProfitOrder(order)) return "TP";
	if (isStopOrder(order)) return "SL";
	return order.side === "B" ? "Limit Buy" : "Limit Sell";
}

export function getOrderTypeConfig(order: OpenOrder) {
	let typeClass: string = ORDER_TYPE_CLASS.default;
	const suffix = order.reduceOnly && !order.isTrigger ? " RO" : "";
	const fullLabel = `${order.orderType}${suffix}`;
	const shortLabel = `${OPEN_ORDER_TYPE_SHORT_LABELS[order.orderType] ?? order.orderType}${suffix}`;

	if (isTakeProfitOrder(order)) {
		typeClass = ORDER_TYPE_CLASS.takeProfit;
	}

	if (isStopOrder(order)) {
		typeClass = ORDER_TYPE_CLASS.stop;
	}

	return { fullLabel, shortLabel, class: typeClass };
}
