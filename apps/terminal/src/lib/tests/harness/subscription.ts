import type { ISubscription } from "@nktkas/hyperliquid";

export type FakeSubscriptionHandle = {
	subscribe: () => Promise<ISubscription>;
};

export function createFakeSubscription(): FakeSubscriptionHandle {
	return {
		subscribe: async () => ({
			unsubscribe: async () => {},
		}),
	};
}
