import { useLingui } from "@lingui/react/macro";
import type { HistoricalOrdersResponse } from "@nktkas/hyperliquid";
import type { AdvancedOrderType, OrderType } from "@/config/trade";
import type { MarketKind } from "@/lib/hyperliquid/markets";
import type { OrderOutcome } from "@/lib/trade/extract-order-status";
import type { OpenOrder, OrderSide, OrderTypeConfig } from "@/lib/trade/open-orders";
import type { OrderQueueItem } from "@/stores/use-order-queue-store";

type HistoricalOrderStatus = HistoricalOrdersResponse[number]["status"];

const CANCELED_ORDER_STATUSES: ReadonlySet<HistoricalOrderStatus> = new Set([
	"canceled",
	"marginCanceled",
	"vaultWithdrawalCanceled",
	"openInterestCapCanceled",
	"selfTradeCanceled",
	"reduceOnlyCanceled",
	"siblingFilledCanceled",
	"delistedCanceled",
	"liquidatedCanceled",
	"scheduledCancel",
]);

const REJECTED_ORDER_STATUSES: ReadonlySet<HistoricalOrderStatus> = new Set([
	"rejected",
	"tickRejected",
	"minTradeNtlRejected",
	"perpMarginRejected",
	"reduceOnlyRejected",
	"badAloPxRejected",
	"iocCancelRejected",
	"badTriggerPxRejected",
	"marketOrderNoLiquidityRejected",
	"positionIncreaseAtOpenInterestCapRejected",
	"positionFlipAtOpenInterestCapRejected",
	"tooAggressiveAtOpenInterestCapRejected",
	"openInterestIncreaseRejected",
	"insufficientSpotBalanceRejected",
	"oracleRejected",
	"perpMaxPositionRejected",
]);

const TRIGGER_CONDITION_PATTERN = /^Price (above|below) (.+)$/;

export function useOrderDisplayLabels() {
	const { t } = useLingui();

	function getOrderTypeLabel(orderType: OpenOrder["orderType"]): string {
		switch (orderType) {
			case "Market":
				return t({ message: "Market", context: "Order type" });
			case "Limit":
				return t({ message: "Limit", context: "Order type" });
			case "Stop Market":
				return t`Stop Market`;
			case "Stop Limit":
				return t`Stop Limit`;
			case "Take Profit Market":
				return t`Take Profit Market`;
			case "Take Profit Limit":
				return t`Take Profit Limit`;
		}
	}

	function getAdvancedOrderTypeLabel(orderType: AdvancedOrderType): string {
		switch (orderType) {
			case "stopMarket":
				return t`Stop Market`;
			case "stopLimit":
				return t`Stop Limit`;
			case "takeProfitMarket":
				return t`Take Profit Market`;
			case "takeProfitLimit":
				return t`Take Profit Limit`;
			case "twap":
				return t`TWAP`;
			case "scale":
				return t`Scale`;
		}
	}

	function getAdvancedOrderLabel(orderType: OrderType, fallback: string): string {
		return orderType !== "market" && orderType !== "limit" ? getAdvancedOrderTypeLabel(orderType) : fallback;
	}

	function getTriggerKindLabel(triggerKind: OrderTypeConfig["triggerKind"]): string | null {
		switch (triggerKind) {
			case "stop":
				return t`Stop`;
			case "takeProfit":
				return t`Take Profit`;
			case null:
				return null;
		}
	}

	function getExecutionKindLabel(executionKind: OrderTypeConfig["executionKind"]): string {
		return executionKind === "market"
			? t({ message: "Market", context: "Order type" })
			: t({ message: "Limit", context: "Order type" });
	}

	function getFullOrderTypeLabel(order: OpenOrder): string {
		const orderTypeLabel = getOrderTypeLabel(order.orderType);
		return order.reduceOnly ? `${orderTypeLabel} · ${t`Reduce Only`}` : orderTypeLabel;
	}

	function getOrderSideLabel(side: OrderSide, kind?: MarketKind): string {
		if (kind === "spot") return side === "B" ? t`Buy` : t`Sell`;
		return side === "B" ? t`Long` : t`Short`;
	}

	function getTriggerConditionLabel(condition: string): string {
		const match = TRIGGER_CONDITION_PATTERN.exec(condition);
		if (!match) return condition;

		const direction = match[1];
		const price = match[2] ?? "";
		return direction === "above" ? t`Price above ${price}` : t`Price below ${price}`;
	}

	function getHistoricalOrderStatusLabel(status: HistoricalOrderStatus): string {
		if (CANCELED_ORDER_STATUSES.has(status)) return t`Canceled`;
		if (REJECTED_ORDER_STATUSES.has(status)) return t`Rejected`;

		switch (status) {
			case "open":
				return t`Open`;
			case "filled":
				return t`Filled`;
			case "triggered":
				return t`Triggered`;
			default:
				return status;
		}
	}

	function getQueueOrderTypeLabel(orderType: OrderQueueItem["orderType"]): string | null {
		switch (orderType) {
			case "trigger":
				return t`Trigger`;
			case "scale":
				return t`Scale`;
			case "twap":
				return t`TWAP`;
			default:
				return null;
		}
	}

	function getQueueSideLabel(side: OrderQueueItem["side"]): string {
		return side === "buy" ? t`Buy` : t`Sell`;
	}

	function getOrderOutcomeLabel(outcome: OrderOutcome): string {
		switch (outcome) {
			case "filled":
				return t`Filled`;
			case "resting":
				return t`Placed`;
			case "triggerSet":
				return t`Set`;
			case "twapStarted":
				return t`Running`;
		}
	}

	return {
		getAdvancedOrderLabel,
		getAdvancedOrderTypeLabel,
		getExecutionKindLabel,
		getFullOrderTypeLabel,
		getHistoricalOrderStatusLabel,
		getOrderOutcomeLabel,
		getOrderSideLabel,
		getOrderTypeLabel,
		getQueueOrderTypeLabel,
		getQueueSideLabel,
		getTriggerConditionLabel,
		getTriggerKindLabel,
	};
}
