// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSubscription } from "./harness/subscription";

let createHyperliquidStore: typeof import("@gatu/hl-react/store").createHyperliquidStore;

describe("store staleness integration", () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		vi.resetModules();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		const mod = await import("@gatu/hl-react/store");
		createHyperliquidStore = mod.createHyperliquidStore;
	});

	afterEach(() => {
		vi.useRealTimers();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
	});

	it("resubscribes one stale periodic stream without reconnecting the shared socket", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const unsubscribes: Array<ReturnType<typeof vi.fn>> = [];
		const subscribe = vi.fn(async () => {
			const unsubscribe = vi.fn(async () => {});
			unsubscribes.push(unsubscribe);
			return { unsubscribe };
		});

		const key = JSON.stringify(["hl", "subscription", "allMids", { dex: "" }]);
		store.getState().acquireSubscription(key, subscribe);
		await vi.advanceTimersByTimeAsync(0);

		store.getState().setSubscriptionData(key, { mids: {} });
		await vi.advanceTimersByTimeAsync(0);

		expect(store.getState().subscriptions[key]?.isStale).toBeFalsy();

		await vi.advanceTimersByTimeAsync(25_000);

		expect(store.getState().subscriptions[key]?.isStale).toBe(true);
		expect(triggerReconnect).not.toHaveBeenCalled();
		expect(subscribe).toHaveBeenCalledTimes(2);
		expect(unsubscribes[0]).toHaveBeenCalledTimes(1);

		store.getState().releaseSubscription(key);
	});

	it("clears isStale when fresh data arrives", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const subscribe = vi.fn(async () => ({ unsubscribe: vi.fn(async () => {}) }));

		const key = JSON.stringify(["hl", "subscription", "allMids", { dex: "" }]);
		store.getState().acquireSubscription(key, subscribe);
		await vi.advanceTimersByTimeAsync(0);

		store.getState().setSubscriptionData(key, { mids: {} });
		await vi.advanceTimersByTimeAsync(25_000);

		expect(store.getState().subscriptions[key]?.isStale).toBe(true);

		store.getState().setSubscriptionData(key, { mids: { ETH: "1" } });
		expect(store.getState().subscriptions[key]?.isStale).toBe(false);
		expect(triggerReconnect).not.toHaveBeenCalled();

		store.getState().releaseSubscription(key);
	});

	it("does not stale event-driven streams after an initial snapshot or event", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const methods = [
			"orderUpdates",
			"userFills",
			"userFundings",
			"userHistoricalOrders",
			"userNonFundingLedgerUpdates",
			"l2Book",
			"trades",
		];
		const keys = methods.map((method) => JSON.stringify(["hl", "subscription", method, {}]));

		for (const key of keys) {
			const { subscribe } = createFakeSubscription();
			store.getState().acquireSubscription(key, subscribe);
		}
		await vi.advanceTimersByTimeAsync(0);

		for (const key of keys) {
			store.getState().setSubscriptionData(key, {});
		}
		await vi.advanceTimersByTimeAsync(5 * 60_000);

		for (const key of keys) {
			expect(store.getState().subscriptions[key]?.isStale).toBeFalsy();
			store.getState().releaseSubscription(key);
		}
		expect(triggerReconnect).not.toHaveBeenCalled();
	});

	it("does not stale a periodic stream before its first payload", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const { subscribe } = createFakeSubscription();
		const key = JSON.stringify(["hl", "subscription", "allMids", { dex: "" }]);

		store.getState().acquireSubscription(key, subscribe);
		await vi.advanceTimersByTimeAsync(2 * 60_000);

		expect(store.getState().subscriptions[key]?.isStale).toBeFalsy();
		expect(triggerReconnect).not.toHaveBeenCalled();
		store.getState().releaseSubscription(key);
	});

	it("respects per-call maxStaleMs override", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const { subscribe } = createFakeSubscription();

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

	it("reconnects the shared socket once when multiple periodic streams become stale together", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });

		const keys = [
			JSON.stringify(["hl", "subscription", "allMids", { dex: "" }]),
			JSON.stringify(["hl", "subscription", "assetCtxs", { dex: "" }]),
			JSON.stringify(["hl", "subscription", "allDexsAssetCtxs", {}]),
		];
		const subscribeFns: Array<ReturnType<typeof vi.fn>> = [];

		for (const key of keys) {
			const subscribe = vi.fn(async () => ({ unsubscribe: vi.fn(async () => {}) }));
			subscribeFns.push(subscribe);
			store.getState().acquireSubscription(key, subscribe);
		}
		await vi.advanceTimersByTimeAsync(0);

		for (const key of keys) {
			store.getState().setSubscriptionData(key, {});
		}

		triggerReconnect.mockClear();
		await vi.advanceTimersByTimeAsync(25_000);

		expect(triggerReconnect).toHaveBeenCalledTimes(1);
		for (const subscribe of subscribeFns) {
			expect(subscribe).toHaveBeenCalledTimes(1);
		}

		for (const key of keys) {
			store.getState().releaseSubscription(key);
		}
	});

	it("cleans up watchdog on release", async () => {
		const store = createHyperliquidStore({ ssr: false });
		const { subscribe } = createFakeSubscription();

		const key = JSON.stringify(["hl", "subscription", "allMids", { dex: "" }]);
		store.getState().acquireSubscription(key, subscribe);
		await vi.advanceTimersByTimeAsync(0);

		store.getState().setSubscriptionData(key, {});
		store.getState().releaseSubscription(key);

		await vi.advanceTimersByTimeAsync(25_000);

		expect(store.getState().subscriptions[key]).toBeUndefined();
	});

	it("unsubscribes a pending subscription exactly once after release", async () => {
		const store = createHyperliquidStore({ ssr: false });
		const unsubscribe = vi.fn(async () => {});
		let resolveSubscription: ((subscription: { unsubscribe: () => Promise<void> }) => void) | undefined;
		const subscribe = vi.fn(
			() =>
				new Promise<{ unsubscribe: () => Promise<void> }>((resolve) => {
					resolveSubscription = resolve;
				}),
		);

		const key = JSON.stringify(["hl", "subscription", "l2Book", { coin: "PENDING" }]);
		store.getState().acquireSubscription(key, subscribe);
		store.getState().releaseSubscription(key);

		expect(store.getState().subscriptions[key]).toBeUndefined();
		expect(unsubscribe).not.toHaveBeenCalled();

		resolveSubscription?.({ unsubscribe });
		await vi.advanceTimersByTimeAsync(0);

		expect(unsubscribe).toHaveBeenCalledTimes(1);
	});
});
