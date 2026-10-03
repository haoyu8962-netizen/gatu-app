import { i18n } from "@lingui/core";
import { getNumberFormatters } from "@/lib/format";
import { getOrderNotificationCopy } from "@/lib/trade/order-notification-copy";
import { getOrderQueueItems, type OrderQueueItem, removeOrderQueueItem } from "@/stores/use-order-queue-store";

export function latestFeedback(status?: OrderQueueItem["status"]) {
	return getOrderQueueItems()
		.filter((order) => !status || order.status === status)
		.at(-1);
}

export function clearFeedback() {
	for (const order of getOrderQueueItems()) removeOrderQueueItem(order.id);
}

export function feedbackErrorText(order: OrderQueueItem | undefined): string {
	return order
		? (getOrderNotificationCopy(order, (descriptor) => i18n._(descriptor), getNumberFormatters()).error ?? "")
		: "";
}

export function feedbackText(status: OrderQueueItem["status"], field: "title" | "message" = "message") {
	const message = latestFeedback(status)?.[field];
	return message ? i18n._(message) : "";
}
