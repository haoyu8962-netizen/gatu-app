import { Suspense } from "react";
import { useHyperliquid } from "@/lib/hyperliquid";
import { createLazyComponent } from "@/lib/lazy";
import { useOrderQueue } from "@/stores/use-order-queue-store";

const OrderNotificationHost = createLazyComponent(() => import("./order-notification-host"), "OrderNotificationHost");

export function OrderNotificationGate() {
	const { clientKey, env } = useHyperliquid();
	const orders = useOrderQueue();
	const owner = clientKey === "disconnected" ? null : clientKey.toLowerCase();
	const hasVisibleTask = orders.some((order) => order.owner === owner && order.env === env && !order.dismissed);
	if (!hasVisibleTask) return null;
	return (
		<Suspense fallback={null}>
			<OrderNotificationHost />
		</Suspense>
	);
}
