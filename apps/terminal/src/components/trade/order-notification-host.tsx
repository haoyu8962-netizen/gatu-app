import { useEffect, useRef } from "react";
import { toast, useSonner } from "sonner";
import { ORDER_TOAST_SUCCESS_DURATION_MS, TOAST_DEFAULT_DURATION_MS } from "@/config/time";
import { useHyperliquid } from "@/lib/hyperliquid";
import {
	createOrderNotificationPresentation,
	type OrderNotificationPresentation,
} from "@/lib/trade/order-notification-presentation";
import {
	dismissOrderQueueItem,
	getOrderQueueItem,
	type OrderQueueItem,
	useOrderQueue,
} from "@/stores/use-order-queue-store";
import { OrderNotification } from "./order-notification";

function getDisplayDuration(order: OrderQueueItem, isFront: boolean) {
	if (!isFront || order.status === "pending" || order.status === "confirming") return Infinity;
	if (order.status === "success") return order.successDurationMs ?? ORDER_TOAST_SUCCESS_DURATION_MS;
	return TOAST_DEFAULT_DURATION_MS;
}

interface DisplayedOrder {
	order: OrderQueueItem;
	presentation: OrderNotificationPresentation;
	duration: number;
}

function dismissPresentation(presentation: OrderNotificationPresentation) {
	presentation.invalidate();
	toast.dismiss(presentation.toastId);
}

export function OrderNotificationHost() {
	const { clientKey, env } = useHyperliquid();
	const orders = useOrderQueue();
	const { toasts } = useSonner();
	const frontId = toasts[0]?.id;
	const displayed = useRef(new Map<string, DisplayedOrder>());
	const owner = clientKey === "disconnected" ? null : clientKey.toLowerCase();

	useEffect(() => {
		let canceled = false;
		queueMicrotask(() => {
			if (canceled) return;
			const visible = orders.filter((order) => order.owner === owner && order.env === env && !order.dismissed);
			const activeIds = new Set(visible.map((order) => order.id));
			for (const [id, entry] of displayed.current) {
				if (activeIds.has(id)) continue;
				displayed.current.delete(id);
				dismissPresentation(entry.presentation);
			}
			for (const order of visible) {
				const previous = displayed.current.get(order.id);
				const presentation = previous?.presentation ?? createOrderNotificationPresentation(order.id);
				const duration = getDisplayDuration(order, presentation.toastId === frontId);
				if (previous?.order === order && previous.duration === duration) continue;
				displayed.current.set(order.id, { order, presentation, duration });
				function dismissDisplayed(renderedOrder: OrderQueueItem) {
					const current = displayed.current.get(order.id);
					if (
						current?.presentation === presentation &&
						presentation.getSnapshot() &&
						getOrderQueueItem(order.id) === renderedOrder
					) {
						displayed.current.delete(order.id);
						dismissPresentation(presentation);
						dismissOrderQueueItem(order.id);
					}
				}
				toast.custom(() => <OrderNotification presentation={presentation} onDismiss={dismissDisplayed} />, {
					id: presentation.toastId,
					duration,
					dismissible: true,
					onDismiss: () => dismissDisplayed(order),
					onAutoClose: () => dismissDisplayed(order),
					className: "w-[var(--width)]",
				});
			}
		});
		return () => {
			canceled = true;
		};
	}, [env, orders, owner, frontId]);

	useEffect(() => {
		const current = displayed.current;
		return () => {
			const presentations = [...current.values()].map((entry) => entry.presentation);
			current.clear();
			for (const presentation of presentations) dismissPresentation(presentation);
		};
	}, []);
	return null;
}
