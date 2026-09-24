import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useHyperliquid } from "@/lib/hyperliquid";
import type { OrderNotificationPresentation } from "@/lib/trade/order-notification-presentation";
import { type OrderQueueItem, useOrderQueueItem } from "@/stores/use-order-queue-store";
import { OrderToast } from "./tradebox/order-toast";

interface Props {
	presentation: OrderNotificationPresentation;
	onDismiss: (order: OrderQueueItem) => void;
}

export function OrderNotification({ presentation, onDismiss }: Props) {
	const { clientKey, env } = useHyperliquid();
	const order = useOrderQueueItem(presentation.orderId);
	const active = useSyncExternalStore(presentation.subscribe, presentation.getSnapshot, presentation.getSnapshot);
	const visible = active && order && !order.dismissed && order.owner === clientKey.toLowerCase() && order.env === env;

	useEffect(() => {
		if (!visible) toast.dismiss(presentation.toastId);
	}, [presentation, visible]);

	if (!visible) return null;
	return <OrderToast order={order} onDismiss={() => onDismiss(order)} />;
}
