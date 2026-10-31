import { useLingui } from "@lingui/react/macro";
import type { HistoricalOrdersResponse } from "@nktkas/hyperliquid";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { type AdvancedOrderType, ORDER_TYPE_MESSAGES, type OrderType } from "@/config/trade";
import {
	type OpenOrder,
	type OrderSide,
	type OrderTypeConfig,
	TRAILING_STOP_ORDER_TYPE,
} from "@/lib/trade/open-orders";
import { getOrderDirection } from "@/lib/trade/order-direction";
import { isPartiallyFilledHistoricalOrder, type TwapHistoryStatus } from "@/lib/trade/order-history";
import { describeOrderStatusReason } from "@/lib/trade/order-status-reasons";

type HistoricalOrderStatus = HistoricalOrdersResponse[number]["status"];

export interface HistoricalOrderStatusPresentation {
	label: string;
	reason: string | null;
}

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
	"outcomeSettledCanceled",
	"internalCancel",
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
	"tooManyOpenOrdersRejected",
]);

const TRIGGER_CONDITION_PATTERN = /^Price (above|below) (.+)$/;

export function useOrderDisplayLabels() {
	const { t } = useLingui();

	function getOrderTypeLabel(orderType: OpenOrder["orderType"] | string): string {
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
			case "Twap Slice":
				return t`TWAP Slice`;
			case "Vault Close":
				return t`Vault Close`;
			case "Spot Dust Conversion":
				return t`Spot Dust Conversion`;
			case TRAILING_STOP_ORDER_TYPE:
				return t`Trailing Stop`;
			default:
				return orderType || FALLBACK_VALUE_PLACEHOLDER;
		}
	}

	function getAdvancedOrderTypeLabel(orderType: AdvancedOrderType): string {
		return t(ORDER_TYPE_MESSAGES[orderType]);
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

	function getOrderSideLabel(side: OrderSide, reduceOnly: boolean): string {
		switch (getOrderDirection(side, reduceOnly)) {
			case "buy":
				return t`Buy`;
			case "sell":
				return t`Sell`;
			case "closeLong":
				return t`Close Long`;
			case "closeShort":
				return t`Close Short`;
			default:
				return FALLBACK_VALUE_PLACEHOLDER;
		}
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

	function getHistoricalOrderStatusPresentation(
		order: HistoricalOrdersResponse[number],
	): HistoricalOrderStatusPresentation {
		if (isPartiallyFilledHistoricalOrder(order)) return { label: t`Partially filled`, reason: null };
		const reasonDescriptor =
			order.status === "canceled" || order.status === "rejected" ? null : describeOrderStatusReason(order.status);
		const reason = reasonDescriptor ? t(reasonDescriptor) : null;
		if (order.status === "marginCanceled") return { label: t`Margin Canceled`, reason };
		return { label: getHistoricalOrderStatusLabel(order.status), reason };
	}

	function getTwapHistoryStatusLabel(status: TwapHistoryStatus): string {
		switch (status) {
			case "activated":
				return t`Running`;
			case "waitingForTrigger":
				return t`Open`;
			case "finished":
				return t`Filled`;
			case "terminated":
			case "stopped":
				return t`Canceled`;
			case "error":
				return t`Failed`;
		}
	}

	return {
		getAdvancedOrderLabel,
		getAdvancedOrderTypeLabel,
		getExecutionKindLabel,
		getFullOrderTypeLabel,
		getHistoricalOrderStatusLabel,
		getHistoricalOrderStatusPresentation,
		getOrderSideLabel,
		getOrderTypeLabel,
		getTriggerConditionLabel,
		getTriggerKindLabel,
		getTwapHistoryStatusLabel,
	};
}
