import { useEffect, useRef } from "react";
import { toast, useSonner } from "sonner";
import { ORDER_TOAST_SUCCESS_DURATION_MS, TOAST_DEFAULT_DURATION_MS } from "@/config/time";
import { useHyperliquid } from "@/lib/hyperliquid";
import {
	dismissOrderQueueItem,
	getOrderQueueItem,
	type OrderQueueItem,
	useOrderQueue,
} from "@/stores/use-order-queue-store";
import { OrderToast } from "./tradebox/order-toast";

let presentationSequence = 0;

function getDisplayDuration(order: OrderQueueItem, isFront: boolean) {
	if (!isFront || order.status === "pending" || order.status === "confirming") return Infinity;
	if (order.status === "success") return order.successDurationMs ?? ORDER_TOAST_SUCCESS_DURATION_MS;
	return TOAST_DEFAULT_DURATION_MS;
}

function OrderNotification({ order }: { order: OrderQueueItem }) {
	const { clientKey, env } = useHyperliquid();
	if (clientKey.toLowerCase() !== order.owner || env !== order.env) return null;
	return <OrderToast order={order} onDismiss={() => dismissOrderQueueItem(order.id)} />;
}

export function OrderNotificationHost() {
	const { clientKey, env } = useHyperliquid();
	const orders = useOrderQueue();
	const { toasts } = useSonner();
	const frontId = toasts[0]?.id;
	const displayed = useRef(new Map<string, { order: OrderQueueItem; toastId: string; duration: number }>());
	const owner = clientKey === "disconnected" ? null : clientKey.toLowerCase();

	useEffect(() => {
		const visible = orders.filter((order) => order.owner === owner && order.env === env && !order.dismissed);
		const activeIds = new Set(visible.map((order) => order.id));
		for (const id of displayed.current.keys()) {
			if (activeIds.has(id)) continue;
			const toastId = displayed.current.get(id)?.toastId;
			displayed.current.delete(id);
			if (toastId) toast.dismiss(toastId);
		}
		for (const order of visible) {
			const previous = displayed.current.get(order.id);
			const toastId = previous?.toastId ?? `order-feedback:${++presentationSequence}:${order.id}`;
			const duration = getDisplayDuration(order, toastId === frontId);
			if (previous?.order === order && previous.duration === duration) continue;
			displayed.current.set(order.id, { order, toastId, duration });
			function isCurrentPresentation() {
				const current = displayed.current.get(order.id);
				return current?.toastId === toastId && current.order === order && getOrderQueueItem(order.id) === order;
			}
			function dismissDisplayed() {
				if (isCurrentPresentation()) dismissOrderQueueItem(order.id);
			}
			toast.custom(() => <OrderNotification order={order} />, {
				id: toastId,
				duration,
				dismissible: true,
				onDismiss: dismissDisplayed,
				onAutoClose: dismissDisplayed,
				className: "w-[var(--width)]",
			});
		}
	}, [env, orders, owner, frontId]);

	useEffect(() => {
		const current = displayed.current;
		return () => {
			const toastIds = [...current.values()].map((entry) => entry.toastId);
			current.clear();
			for (const id of toastIds) toast.dismiss(id);
		};
	}, []);
	return null;
}
