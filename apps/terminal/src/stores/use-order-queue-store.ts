import type { MessageDescriptor } from "@lingui/core";
import { create } from "zustand";
import type { OrderExecutionSummary } from "@/domain/trade/order-execution-summary";
import type { CodedActionFailure, ExchangeActionFailure } from "@/lib/errors/action-error";
import type { OrderOutcome } from "@/lib/trade/extract-order-status";
import type { OrderReconciliationError } from "@/lib/trade/order-reconciliation-feedback";
import type { OrderSubmissionFeedback } from "@/lib/trade/order-submission-feedback";
import type { PositionSubmitFeedback } from "@/lib/trade/position-submit-feedback";
import type { SpotSwapFeedback } from "@/lib/trade/spot-swap-feedback";

export interface OrderQueueChild {
	assetId: number;
	market?: string;
	size?: string;
	filledSize?: string;
	status: "pending" | "filled" | "filled-unverified" | "partial" | "accepted" | "rejected" | "unknown" | "canceled";
	error?: string;
}

export interface OrderQueueMetadata {
	title?: MessageDescriptor;
	message?: MessageDescriptor;
	operation?: "order" | "market-close" | "close-all" | "spot-swap";
	market?: string;
	side?: "buy" | "sell";
	size?: string;
	price?: string;
	quoteToken?: string;
	execution?: OrderExecutionSummary;
	orderType?: "market" | "limit" | "trigger" | "scale" | "twap";
	tpPrice?: string;
	slPrice?: string;
	children?: OrderQueueChild[];
	countMode?: "accepted" | "filled";
}

export interface OrderQueueItem extends OrderQueueMetadata {
	successDurationMs?: number;
	id: string;
	owner: string;
	env: "Mainnet" | "Testnet";
	positionsClosed?: boolean;
	dismissed?: boolean;
	status: "pending" | "confirming" | "unconfirmed" | "partial" | "success" | "canceled" | "failed";
	outcome?: OrderOutcome;
	/**
	 * A plain string is one exchange rejection text as the exchange sent it; store a batch as an
	 * exchange failure with its entries. Store anything else as a coded or translatable
	 * value so it is rendered in the active language.
	 */
	error?:
		| string
		| ExchangeActionFailure
		| CodedActionFailure
		| OrderReconciliationError
		| OrderSubmissionFeedback
		| PositionSubmitFeedback
		| SpotSwapFeedback
		| MessageDescriptor;
	acceptedCount?: number;
	totalCount?: number;
	createdAt: number;
	completedAt?: number;
}

interface OrderQueueStore {
	orders: OrderQueueItem[];
	actions: {
		addOrder: (order: Omit<OrderQueueItem, "id" | "createdAt"> & { id?: string }) => string;
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
			const id = order.id ?? generateOrderId();
			const newOrder: OrderQueueItem = {
				...order,
				owner: order.owner.toLowerCase(),
				id,
				createdAt: Date.now(),
			};
			set((state) => ({
				orders: state.orders.some((item) => item.id === id) ? state.orders : [...state.orders, newOrder],
			}));
			return id;
		},
		updateOrder: (id, update) => {
			set((state) => ({
				orders: state.orders.map((order) => {
					if (order.id !== id) return order;
					if (!update.status) return { ...order, ...update };
					return {
						...order,
						error: undefined,
						outcome: undefined,
						acceptedCount: undefined,
						totalCount: undefined,
						positionsClosed: undefined,
						dismissed: false,
						message: undefined,
						...update,
						completedAt: isCompletedOrderStatus(update.status) ? Date.now() : undefined,
					};
				}),
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
	return (
		status === "unconfirmed" ||
		status === "partial" ||
		status === "success" ||
		status === "canceled" ||
		status === "failed"
	);
}

export function useOrderQueue() {
	return useOrderQueueStore((state) => state.orders);
}

export function useOrderQueueItem(id: string) {
	return useOrderQueueStore((state) => state.orders.find((order) => order.id === id));
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

export function addOrderQueueItem(order: Omit<OrderQueueItem, "id" | "createdAt"> & { id?: string }): string {
	return useOrderQueueStore.getState().actions.addOrder(order);
}

export function getOrderQueueItem(id: string | undefined): OrderQueueItem | undefined {
	return useOrderQueueStore.getState().orders.find((order) => order.id === id);
}

export function removeOrderQueueItem(id: string): void {
	useOrderQueueStore.getState().actions.removeOrder(id);
}

export function getOrderQueueItems(): readonly OrderQueueItem[] {
	return useOrderQueueStore.getState().orders;
}

export function dismissOrderQueueItem(id: string): void {
	const order = getOrderQueueItem(id);
	if (!order) return;
	if (order.status === "pending" || order.status === "confirming" || order.status === "unconfirmed") {
		updateOrderQueueItem(id, { dismissed: true });
		return;
	}
	removeOrderQueueItem(id);
}
