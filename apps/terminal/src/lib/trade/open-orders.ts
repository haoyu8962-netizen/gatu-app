import type { FrontendOpenOrdersResponse } from "@nktkas/hyperliquid";
import type { MarketKind } from "@/lib/hyperliquid/markets";
import { toBig } from "@/lib/trade/numbers";

export type OpenOrder = FrontendOpenOrdersResponse[number];

export type OrderSide = OpenOrder["side"];

export const ORDER_TYPE_CONFIG = {
	takeProfit: { prefix: "Take Profit", class: "text-success" },
	stop: { prefix: "Stop", class: "text-warning" },
	default: { class: "text-fg-muted" },
} as const;

export function isLongOrder(order: OpenOrder): boolean {
	return order.side === "B";
}

export function isTakeProfitOrder(order: OpenOrder): boolean {
	return order.orderType.startsWith(ORDER_TYPE_CONFIG.takeProfit.prefix);
}

export function isStopOrder(order: OpenOrder): boolean {
	return order.orderType.startsWith(ORDER_TYPE_CONFIG.stop.prefix);
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

const ORDER_TYPE_SHORT_LABEL: Record<string, string> = {
	"Take Profit Market": "TP Market",
	"Take Profit Limit": "TP Limit",
	"Stop Market": "SL Market",
	"Stop Limit": "SL Limit",
};

export function getOrderTypeConfig(order: OpenOrder) {
	let typeClass: string = ORDER_TYPE_CONFIG.default.class;
	const suffix = order.reduceOnly && !order.isTrigger ? " RO" : "";
	const fullLabel = `${order.orderType}${suffix}`;
	const shortLabel = `${ORDER_TYPE_SHORT_LABEL[order.orderType] ?? order.orderType}${suffix}`;

	if (isTakeProfitOrder(order)) {
		typeClass = ORDER_TYPE_CONFIG.takeProfit.class;
	}

	if (isStopOrder(order)) {
		typeClass = ORDER_TYPE_CONFIG.stop.class;
	}

	return { fullLabel, shortLabel, class: typeClass };
}
