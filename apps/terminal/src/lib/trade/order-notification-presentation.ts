export interface OrderNotificationPresentation {
	readonly orderId: string;
	readonly toastId: string;
	getSnapshot: () => boolean;
	subscribe: (listener: () => void) => () => void;
	invalidate: () => void;
}

let presentationSequence = 0;

export function createOrderNotificationPresentation(orderId: string): OrderNotificationPresentation {
	let active = true;
	const listeners = new Set<() => void>();
	return {
		orderId,
		toastId: `order-feedback:${++presentationSequence}:${orderId}`,
		getSnapshot: () => active,
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		invalidate() {
			if (!active) return;
			active = false;
			for (const listener of listeners) listener();
		},
	};
}
