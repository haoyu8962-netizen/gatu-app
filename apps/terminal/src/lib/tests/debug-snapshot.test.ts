// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSubscription } from "./harness/subscription";

let createHyperliquidStore: typeof import("@hypeterminal/hl-react/store").createHyperliquidStore;
let registerDebugSnapshot: typeof import("@hypeterminal/hl-react/internal/websocket/debug").registerDebugSnapshot;
let registerChaosHarness: typeof import("@hypeterminal/hl-react/internal/websocket/chaos").registerChaosHarness;

describe("debug snapshot", () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		vi.resetModules();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		const storeMod = await import("@hypeterminal/hl-react/store");
		createHyperliquidStore = storeMod.createHyperliquidStore;
		const debugMod = await import("@hypeterminal/hl-react/internal/websocket/debug");
		registerDebugSnapshot = debugMod.registerDebugSnapshot;
		const chaosMod = await import("@hypeterminal/hl-react/internal/websocket/chaos");
		registerChaosHarness = chaosMod.registerChaosHarness;
	});

	afterEach(() => {
		vi.useRealTimers();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		delete window.__hl_debug;
		delete window.__hl_chaos;
	});

	it("returns snapshot with expected keys given 2 fake subscriptions", async () => {
		const store = createHyperliquidStore({ ssr: false });
		registerDebugSnapshot(store);

		const key1 = JSON.stringify(["hl", "subscription", "l2Book", { coin: "ETH" }]);
		const key2 = JSON.stringify(["hl", "subscription", "trades", { coin: "BTC" }]);
		const sub1 = createFakeSubscription();
		const sub2 = createFakeSubscription();

		store.getState().acquireSubscription(key1, sub1.subscribe);
		store.getState().acquireSubscription(key2, sub2.subscribe);
		await vi.advanceTimersByTimeAsync(0);

		store.getState().setSubscriptionData(key1, { levels: [] });
		store.getState().setSubscriptionData(key2, [{ px: "100", sz: "1" }]);

		const snapshot = window.__hl_debug?.();

		expect(snapshot).toHaveProperty("subscriptions");
		expect(snapshot).toHaveProperty("counters");
		expect(snapshot).toHaveProperty("lastMessageAt");
		expect(snapshot).toHaveProperty("transportState");

		expect(Object.keys(snapshot.subscriptions)).toHaveLength(2);
		expect(snapshot.subscriptions[key1]).toEqual({
			status: "active",
			hasData: true,
			isStale: false,
		});
		expect(snapshot.subscriptions[key2]).toEqual({
			status: "active",
			hasData: true,
			isStale: false,
		});

		expect(snapshot.counters[key1]).toEqual({ refCount: 1, reconnectAttempts: 0 });
		expect(snapshot.counters[key2]).toEqual({ refCount: 1, reconnectAttempts: 0 });

		expect(snapshot.lastMessageAt[key1]).toBeTypeOf("number");
		expect(snapshot.lastMessageAt[key2]).toBeTypeOf("number");

		expect(snapshot.transportState.wsStatus).toBe("open");
		expect(snapshot.transportState.activeSubscriptionCount).toBe(2);

		store.getState().releaseSubscription(key1);
		store.getState().releaseSubscription(key2);
	});

	it("snapshot reflects stale subscriptions", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		registerDebugSnapshot(store);

		const key = JSON.stringify(["hl", "subscription", "l2Book", { coin: "ETH" }]);
		const { subscribe } = createFakeSubscription();
		store.getState().acquireSubscription(key, subscribe);
		await vi.advanceTimersByTimeAsync(0);

		store.getState().setSubscriptionData(key, {});
		await vi.advanceTimersByTimeAsync(25_000);

		const snapshot = window.__hl_debug?.();
		expect(snapshot.subscriptions[key]?.isStale).toBe(true);

		store.getState().releaseSubscription(key);
	});
});

describe("chaos harness", () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		vi.resetModules();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		const storeMod = await import("@hypeterminal/hl-react/store");
		createHyperliquidStore = storeMod.createHyperliquidStore;
		const chaosMod = await import("@hypeterminal/hl-react/internal/websocket/chaos");
		registerChaosHarness = chaosMod.registerChaosHarness;
	});

	afterEach(() => {
		vi.useRealTimers();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		delete window.__hl_chaos;
	});

	it("freezeMessages swallows data for the specified duration", async () => {
		const store = createHyperliquidStore({ ssr: false });
		registerChaosHarness(store);

		const key = JSON.stringify(["hl", "subscription", "l2Book", { coin: "ETH" }]);
		const { subscribe } = createFakeSubscription();
		store.getState().acquireSubscription(key, subscribe);
		await vi.advanceTimersByTimeAsync(0);

		store.getState().setSubscriptionData(key, { v: 1 });
		expect(store.getState().subscriptions[key]?.data).toEqual({ v: 1 });

		window.__hl_chaos?.freezeMessages(1_000);

		store.getState().setSubscriptionData(key, { v: 2 });
		expect(store.getState().subscriptions[key]?.data).toEqual({ v: 1 });

		await vi.advanceTimersByTimeAsync(1_100);

		store.getState().setSubscriptionData(key, { v: 3 });
		expect(store.getState().subscriptions[key]?.data).toEqual({ v: 3 });

		store.getState().releaseSubscription(key);
	});

	it("closeSocket calls triggerReconnect", () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		registerChaosHarness(store);

		window.__hl_chaos?.closeSocket();
		expect(triggerReconnect).toHaveBeenCalledOnce();
	});

	it("dropReconnects causes next N reconnect attempts to fail", async () => {
		const store = createHyperliquidStore({ ssr: false });
		registerChaosHarness(store);

		window.__hl_chaos?.dropReconnects(2);

		const key = JSON.stringify(["hl", "subscription", "l2Book", { coin: "ETH" }]);
		const { subscribe } = createFakeSubscription();
		store.getState().acquireSubscription(key, subscribe);
		await vi.advanceTimersByTimeAsync(0);

		expect(store.getState().subscriptions[key]?.status).toBe("error");
		expect(store.getState().subscriptions[key]?.error).toBeInstanceOf(Error);

		store.getState().releaseSubscription(key);
	});

	it("simulateOffline drives network singleton and triggers store reconnect", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		registerChaosHarness(store);

		const key = JSON.stringify(["hl", "subscription", "l2Book", { coin: "ETH" }]);
		const { subscribe } = createFakeSubscription();
		store.getState().acquireSubscription(key, subscribe);
		await vi.advanceTimersByTimeAsync(0);

		window.__hl_chaos?.simulateOffline(500);

		await vi.advanceTimersByTimeAsync(600);

		expect(triggerReconnect).toHaveBeenCalled();

		store.getState().releaseSubscription(key);
	});

	it("simulateHidden drives visibility singleton and buffers market data", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		registerChaosHarness(store);

		const key = JSON.stringify(["hl", "subscription", "l2Book", { coin: "ETH" }]);
		const { subscribe } = createFakeSubscription();
		store.getState().acquireSubscription(key, subscribe);
		await vi.advanceTimersByTimeAsync(0);

		store.getState().setSubscriptionData(key, { v: 1 });

		window.__hl_chaos?.simulateHidden();
		Object.defineProperty(document, "hidden", { value: true, configurable: true });

		store.getState().setSubscriptionData(key, { v: 2 });
		expect(store.getState().subscriptions[key]?.data).toEqual({ v: 1 });

		window.__hl_chaos?.simulateVisible();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });

		expect(store.getState().subscriptions[key]?.data).toEqual({ v: 2 });

		store.getState().releaseSubscription(key);
	});
});
