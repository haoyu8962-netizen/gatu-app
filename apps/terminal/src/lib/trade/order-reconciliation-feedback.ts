import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { getOrderQueueItem, removeOrderQueueItem } from "@/stores/use-order-queue-store";

export type OrderReconciliationErrorCode =
	| "accepted-orders-canceled"
	| "batch-rejected"
	| "order-rejected"
	| "status-unconfirmed"
	| "twap-order-rejected"
	| "twap-status-unconfirmed";

/**
 * A locale-independent error produced by client-side order reconciliation.
 * Exchange and SDK messages remain raw strings at the store boundary.
 */
export interface OrderReconciliationError {
	kind: "order-reconciliation";
	code: OrderReconciliationErrorCode;
}

const acceptedOrdersCanceledMessage = msg`An accepted order was canceled afterward. Review open orders and positions before retrying.`;
const batchRejectedMessage = msg`The exchange did not accept every order.`;
const orderRejectedMessage = msg`The exchange did not accept the order.`;
const statusUnconfirmedMessage = msg`The exchange did not return a final order status. Review open orders and positions before retrying.`;
const twapOrderRejectedMessage = msg`The exchange did not accept the TWAP order.`;
const twapStatusUnconfirmedMessage = msg`The exchange did not return a final TWAP status. Review active TWAP orders before retrying.`;

export function orderReconciliationError(code: OrderReconciliationErrorCode): OrderReconciliationError {
	return { kind: "order-reconciliation", code };
}

export function formatOrderReconciliationError(
	code: OrderReconciliationErrorCode,
	translate: (descriptor: MessageDescriptor) => string,
): string {
	switch (code) {
		case "accepted-orders-canceled":
			return translate(acceptedOrdersCanceledMessage);
		case "batch-rejected":
			return translate(batchRejectedMessage);
		case "order-rejected":
			return translate(orderRejectedMessage);
		case "status-unconfirmed":
			return translate(statusUnconfirmedMessage);
		case "twap-order-rejected":
			return translate(twapOrderRejectedMessage);
		case "twap-status-unconfirmed":
			return translate(twapStatusUnconfirmedMessage);
	}
}

/**
 * Another tab took over these submissions and settled them. This tab never saw the result, so it
 * withdraws the notification it still shows as in progress instead of drawing an outcome.
 */
export function withdrawNotificationsSettledElsewhere(
	ids: readonly string[],
	queueIds: ReadonlyMap<string, string>,
): void {
	for (const id of ids) {
		const queueId = queueIds.get(id) ?? `reconcile-${id}`;
		const status = getOrderQueueItem(queueId)?.status;
		if (status === "pending" || status === "confirming") removeOrderQueueItem(queueId);
	}
}
