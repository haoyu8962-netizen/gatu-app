// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let createHyperliquidStore: typeof import("@hypeterminal/hl-react/store").createHyperliquidStore;

describe("store staleness integration", () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		vi.resetModules();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		const mod = await import("@hypeterminal/hl-react/store");
		createHyperliquidStore = mod.createHyperliquidStore;
	});

	afterEach(() => {
		vi.useRealTimers();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
	});

	function createSubscription() {
		const failureController = new AbortController();
		return {
			subscribe: async () => ({
				unsubscribe: async () => {},
				failureSignal: failureController.signal,
			}),
			failureController,
		};
	}

	it("marks subscription as stale when no data arrives within threshold", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const { subscribe } = createSubscription();

		const key = JSON.stringify(["hl", "subscription", "l2Book", { coin: "ETH" }]);
		store.getState().acquireSubscription(key, subscribe);
		await vi.advanceTimersByTimeAsync(0);

		store.getState().setSubscriptionData(key, { levels: [] });
		await vi.advanceTimersByTimeAsync(0);

		expect(store.getState().subscriptions[key]?.isStale).toBeFalsy();

		await vi.advanceTimersByTimeAsync(25_000);

		expect(store.getState().subscriptions[key]?.isStale).toBe(true);
		expect(triggerReconnect).toHaveBeenCalled();

		store.getState().releaseSubscription(key);
	});

	it("clears isStale when fresh data arrives", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const { subscribe } = createSubscription();

		const key = JSON.stringify(["hl", "subscription", "l2Book", { coin: "ETH" }]);
		store.getState().acquireSubscription(key, subscribe);
		await vi.advanceTimersByTimeAsync(0);

		store.getState().setSubscriptionData(key, { levels: [] });
		await vi.advanceTimersByTimeAsync(25_000);

		expect(store.getState().subscriptions[key]?.isStale).toBe(true);

		store.getState().setSubscriptionData(key, { levels: [1] });
		expect(store.getState().subscriptions[key]?.isStale).toBe(false);

		store.getState().releaseSubscription(key);
	});

	it("uses user stream threshold (60s) for orderUpdates", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const { subscribe } = createSubscription();

		const key = JSON.stringify(["hl", "subscription", "orderUpdates", {}]);
		store.getState().acquireSubscription(key, subscribe);
		await vi.advanceTimersByTimeAsync(0);

		store.getState().setSubscriptionData(key, []);
		await vi.advanceTimersByTimeAsync(55_000);

		expect(store.getState().subscriptions[key]?.isStale).toBeFalsy();

		await vi.advanceTimersByTimeAsync(10_000);

		expect(store.getState().subscriptions[key]?.isStale).toBe(true);

		store.getState().releaseSubscription(key);
	});

	it("respects per-call maxStaleMs override", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const { subscribe } = createSubscription();

		const key = JSON.stringify(["hl", "subscription", "l2Book", { coin: "ETH" }]);
		store.getState().acquireSubscription(key, subscribe, 3_000);
		await vi.advanceTimersByTimeAsync(0);

		store.getState().setSubscriptionData(key, { levels: [] });
		await vi.advanceTimersByTimeAsync(3_000);
		expect(store.getState().subscriptions[key]?.isStale).toBeFalsy();

		await vi.advanceTimersByTimeAsync(3_000);
		expect(store.getState().subscriptions[key]?.isStale).toBe(true);

		store.getState().releaseSubscription(key);
	});

	it("triggers reconnect when >50% of subscriptions are stale", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });

		const keys = [
			JSON.stringify(["hl", "subscription", "l2Book", { coin: "ETH" }]),
			JSON.stringify(["hl", "subscription", "l2Book", { coin: "BTC" }]),
			JSON.stringify(["hl", "subscription", "trades", { coin: "SOL" }]),
		];

		for (const key of keys) {
			const { subscribe } = createSubscription();
			store.getState().acquireSubscription(key, subscribe);
		}
		await vi.advanceTimersByTimeAsync(0);

		for (const key of keys) {
			store.getState().setSubscriptionData(key, {});
		}

		triggerReconnect.mockClear();
		await vi.advanceTimersByTimeAsync(25_000);

		expect(triggerReconnect.mock.calls.length).toBeGreaterThanOrEqual(3);

		for (const key of keys) {
			store.getState().releaseSubscription(key);
		}
	});

	it("cleans up watchdog on release", async () => {
		const store = createHyperliquidStore({ ssr: false });
		const { subscribe } = createSubscription();

		const key = JSON.stringify(["hl", "subscription", "l2Book", { coin: "ETH" }]);
		store.getState().acquireSubscription(key, subscribe);
		await vi.advanceTimersByTimeAsync(0);

		store.getState().setSubscriptionData(key, {});
		store.getState().releaseSubscription(key);

		await vi.advanceTimersByTimeAsync(25_000);

		expect(store.getState().subscriptions[key]).toBeUndefined();
	});
});
