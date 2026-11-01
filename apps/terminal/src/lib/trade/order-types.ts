import type { AdvancedOrderType, OrderType } from "@/config/trade";

export function isAdvancedOrderType(orderType: OrderType): orderType is AdvancedOrderType {
	return orderType !== "market" && orderType !== "limit";
}

export function isStopOrderType(orderType: OrderType): boolean {
	return orderType === "stopMarket" || orderType === "stopLimit";
}

export function isTakeProfitOrderType(orderType: OrderType): boolean {
	return orderType === "takeProfitMarket" || orderType === "takeProfitLimit";
}

export function isTriggerOrderType(orderType: OrderType): boolean {
	return isStopOrderType(orderType) || isTakeProfitOrderType(orderType);
}

export function isScaleOrderType(orderType: OrderType): boolean {
	return orderType === "scale";
}

export function isTwapOrderType(orderType: OrderType): boolean {
	return orderType === "twap";
}

export function usesLimitPrice(orderType: OrderType): boolean {
	return orderType === "limit" || orderType === "stopLimit" || orderType === "takeProfitLimit";
}

/**
 * The order type a click on an order-book level leaves the form in, as on the official terminal: a market
 * order becomes a limit order and a stop market a stop limit at the clicked price, and a type that already
 * has a limit price keeps it. TWAP, scale and take-profit market orders have no limit price and stay as
 * they are (`null`): the click changes nothing in them.
 */
export function getOrderTypeForBookPrice(orderType: OrderType): OrderType | null {
	if (orderType === "market") return "limit";
	if (orderType === "stopMarket") return "stopLimit";
	return usesLimitPrice(orderType) ? orderType : null;
}

export function usesTriggerPrice(orderType: OrderType): boolean {
	return isTriggerOrderType(orderType);
}

export function canUseTpSl(orderType: OrderType): boolean {
	return orderType === "market" || orderType === "limit";
}

export function isTakerOrderType(orderType: OrderType): boolean {
	return (
		orderType === "market" || orderType === "stopMarket" || orderType === "takeProfitMarket" || orderType === "twap"
	);
}

export function isMarketExecutionOrderType(orderType: OrderType): boolean {
	return orderType === "market" || orderType === "stopMarket" || orderType === "takeProfitMarket";
}

export function getTabsOrderType(orderType: OrderType): "market" | "limit" | "advanced" {
	return orderType === "market" || orderType === "limit" ? orderType : "advanced";
}
