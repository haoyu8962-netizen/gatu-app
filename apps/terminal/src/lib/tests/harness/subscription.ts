export type FakeSubscriptionHandle = {
	subscribe: () => Promise<{ unsubscribe: () => Promise<void>; failureSignal: AbortSignal }>;
	failureController: AbortController;
};

export function createFakeSubscription(): FakeSubscriptionHandle {
	const failureController = new AbortController();
	return {
		subscribe: async () => ({
			unsubscribe: async () => {},
			failureSignal: failureController.signal,
		}),
		failureController,
	};
}
