import { i18n } from "@lingui/core";
import { act } from "react";
import { OrderQueueErrorMessage } from "@/components/trade/tradebox/order-queue-error-message";
import { getOrderQueueItems, type OrderQueueItem, removeOrderQueueItem } from "@/stores/use-order-queue-store";
import { createI18nRoot } from "./react";

export function latestFeedback(status?: OrderQueueItem["status"]) {
	return getOrderQueueItems()
		.filter((order) => !status || order.status === status)
		.at(-1);
}

export function clearFeedback() {
	for (const order of getOrderQueueItems()) removeOrderQueueItem(order.id);
}

export function feedbackErrorText(order: OrderQueueItem | undefined): string {
	const host = document.createElement("div");
	const root = createI18nRoot(host);
	act(() => root.render(order?.error ? <OrderQueueErrorMessage error={order.error} /> : null));
	const text = host.textContent ?? "";
	act(() => root.unmount());
	return text;
}

export function feedbackText(status: OrderQueueItem["status"], field: "title" | "message" = "message") {
	const message = latestFeedback(status)?.[field];
	return message ? i18n._(message) : "";
}
