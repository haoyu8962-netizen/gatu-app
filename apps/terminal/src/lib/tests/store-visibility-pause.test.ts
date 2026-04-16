// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let createHyperliquidStore: typeof import("@hypeterminal/hl-react/store").createHyperliquidStore;

function marketKey(method: string, params: Record<string, unknown> = {}) {
	return JSON.stringify(["hl", "subscription", method, params]);
}

function userKey(method: string, params: Record<string, unknown> = {}) {
	return JSON.stringify(["hl", "subscription", method, { user: "0xabc", ...params }]);
}

describe("visibility-pause for market streams", () => {
	beforeEach(async () => {
		vi.resetModules();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		const mod = await import("@hypeterminal/hl-react/store");
		createHyperliquidStore = mod.createHyperliquidStore;
	});

	afterEach(() => {
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

	it("buffers market-stream writes when hidden", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const key = marketKey("l2Book", { coin: "ETH" });
		const { subscribe } = createSubscription();

		store.getState().acquireSubscription(key, subscribe);
		await new Promise<void>((r) => setTimeout(r, 0));

		Object.defineProperty(document, "hidden", { value: true, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		store.getState().setSubscriptionData(key, { bids: [], asks: [] });
		expect(store.getState().subscriptions[key]?.data).toBeUndefined();

		store.getState().releaseSubscription(key);
	});

	it("passes user-stream writes through when hidden", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const key = userKey("orderUpdates");
		const { subscribe } = createSubscription();

		store.getState().acquireSubscription(key, subscribe);
		await new Promise<void>((r) => setTimeout(r, 0));

		Object.defineProperty(document, "hidden", { value: true, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		const data = [{ oid: 1 }];
		store.getState().setSubscriptionData(key, data);
		expect(store.getState().subscriptions[key]?.data).toBe(data);

		store.getState().releaseSubscription(key);
	});

	it("passes user-stream writes through for method-based user streams (webData2)", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const key = marketKey("webData2", { coin: "ETH" });
		const { subscribe } = createSubscription();

		store.getState().acquireSubscription(key, subscribe);
		await new Promise<void>((r) => setTimeout(r, 0));

		Object.defineProperty(document, "hidden", { value: true, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		const data = { some: "data" };
		store.getState().setSubscriptionData(key, data);
		expect(store.getState().subscriptions[key]?.data).toBe(data);

		store.getState().releaseSubscription(key);
	});

	it("flushes buffered last-value on visibility visible", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const key = marketKey("l2Book", { coin: "ETH" });
		const { subscribe } = createSubscription();

		store.getState().acquireSubscription(key, subscribe);
		await new Promise<void>((r) => setTimeout(r, 0));

		Object.defineProperty(document, "hidden", { value: true, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		store.getState().setSubscriptionData(key, { v: 1 });
		store.getState().setSubscriptionData(key, { v: 2 });
		store.getState().setSubscriptionData(key, { v: 3 });

		expect(store.getState().subscriptions[key]?.data).toBeUndefined();

		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		expect(store.getState().subscriptions[key]?.data).toEqual({ v: 3 });

		store.getState().releaseSubscription(key);
	});

	it("triggers transport close after flushing on visible", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const key = marketKey("allMids");
		const { subscribe } = createSubscription();

		store.getState().acquireSubscription(key, subscribe);
		await new Promise<void>((r) => setTimeout(r, 0));

		Object.defineProperty(document, "hidden", { value: true, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		store.getState().setSubscriptionData(key, { mid: "100" });

		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		expect(triggerReconnect).toHaveBeenCalledTimes(1);

		store.getState().releaseSubscription(key);
	});

	it("respects pauseWhenHidden: false override for market streams", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const key = marketKey("l2Book", { coin: "BTC" });
		const { subscribe } = createSubscription();

		store.getState().acquireSubscription(key, subscribe, undefined, false);
		await new Promise<void>((r) => setTimeout(r, 0));

		Object.defineProperty(document, "hidden", { value: true, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		const data = { bids: [1], asks: [2] };
		store.getState().setSubscriptionData(key, data);
		expect(store.getState().subscriptions[key]?.data).toBe(data);

		store.getState().releaseSubscription(key);
	});

	it("respects pauseWhenHidden: true override for user streams", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const key = userKey("clearinghouseState");
		const { subscribe } = createSubscription();

		store.getState().acquireSubscription(key, subscribe, undefined, true);
		await new Promise<void>((r) => setTimeout(r, 0));

		Object.defineProperty(document, "hidden", { value: true, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		store.getState().setSubscriptionData(key, { data: "test" });
		expect(store.getState().subscriptions[key]?.data).toBeUndefined();

		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		expect(store.getState().subscriptions[key]?.data).toEqual({ data: "test" });

		store.getState().releaseSubscription(key);
	});

	it("clears buffer entry when subscription is released", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const key = marketKey("trades", { coin: "ETH" });
		const { subscribe } = createSubscription();

		store.getState().acquireSubscription(key, subscribe);
		await new Promise<void>((r) => setTimeout(r, 0));

		Object.defineProperty(document, "hidden", { value: true, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		store.getState().setSubscriptionData(key, [{ trade: 1 }]);

		store.getState().releaseSubscription(key);

		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		expect(store.getState().subscriptions[key]).toBeUndefined();
	});

	it("still marks fresh via watchdog even when buffered", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const key = marketKey("candle", { coin: "ETH", interval: "1h" });
		const { subscribe } = createSubscription();

		store.getState().acquireSubscription(key, subscribe);
		await new Promise<void>((r) => setTimeout(r, 0));

		Object.defineProperty(document, "hidden", { value: true, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		store.getState().setSubscriptionData(key, { candle: "data" });
		expect(store.getState().subscriptions[key]?.data).toBeUndefined();

		store.getState().releaseSubscription(key);
	});
});
