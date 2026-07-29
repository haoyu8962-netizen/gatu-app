import { create } from "zustand";
import type { OrderOutcome } from "@/lib/trade/extract-order-status";

export interface OrderQueueItem {
	id: string;
	market: string;
	side: "buy" | "sell";
	size: string;
	price?: string;
	orderType?: "market" | "limit" | "trigger" | "scale" | "twap";
	tpPrice?: string;
	slPrice?: string;
	status: "pending" | "confirming" | "unconfirmed" | "partial" | "success" | "failed";
	outcome?: OrderOutcome;
	error?: string;
	acceptedCount?: number;
	totalCount?: number;
	createdAt: number;
	completedAt?: number;
}

interface OrderQueueStore {
	orders: OrderQueueItem[];
	actions: {
		addOrder: (order: Omit<OrderQueueItem, "id" | "createdAt">) => string;
		updateOrder: (id: string, update: Partial<Omit<OrderQueueItem, "id">>) => void;
		removeOrder: (id: string) => void;
	};
}

let orderIdCounter = 0;

function generateOrderId(): string {
	return `order-${Date.now()}-${++orderIdCounter}`;
}

const useOrderQueueStore = create<OrderQueueStore>()((set) => ({
	orders: [],
	actions: {
		addOrder: (order) => {
			const id = generateOrderId();
			const newOrder: OrderQueueItem = {
				...order,
				id,
				createdAt: Date.now(),
			};
			set((state) => ({
				orders: [...state.orders, newOrder],
			}));
			return id;
		},
		updateOrder: (id, update) => {
			set((state) => ({
				orders: state.orders.map((order) =>
					order.id === id
						? {
								...order,
								...update,
								completedAt: isCompletedOrderStatus(update.status) ? Date.now() : order.completedAt,
							}
						: order,
				),
			}));
		},
		removeOrder: (id) => {
			set((state) => ({
				orders: state.orders.filter((order) => order.id !== id),
			}));
		},
	},
}));

function isCompletedOrderStatus(status: OrderQueueItem["status"] | undefined): boolean {
	return status === "unconfirmed" || status === "partial" || status === "success" || status === "failed";
}

export function useOrderQueue() {
	return useOrderQueueStore((state) => state.orders);
}

export function useOrderQueueActions() {
	return useOrderQueueStore((state) => state.actions);
}

export function updateOrderQueueItem(id: string, update: Partial<Omit<OrderQueueItem, "id">>): void {
	useOrderQueueStore.getState().actions.updateOrder(id, update);
}

export function hasOrderQueueItem(id: string): boolean {
	return useOrderQueueStore.getState().orders.some((order) => order.id === id);
}
