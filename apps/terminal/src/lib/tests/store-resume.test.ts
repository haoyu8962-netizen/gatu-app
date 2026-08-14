// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSubscription } from "./harness/subscription";

let createHyperliquidStore: typeof import("@gatu/hl-react/store").createHyperliquidStore;
let getStoreInternals: typeof import("@gatu/hl-react/store").getStoreInternals;

describe("store-driven resume via singletons", () => {
	beforeEach(async () => {
		vi.resetModules();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
		const mod = await import("@gatu/hl-react/store");
		createHyperliquidStore = mod.createHyperliquidStore;
		getStoreInternals = mod.getStoreInternals;
	});

	afterEach(() => {
		vi.useRealTimers();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
	});

	it("flushes buffered data without reconnecting when visibility returns", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const { subscribe } = createFakeSubscription();

		store.getState().acquireSubscription("test:vis", subscribe, null, true);
		await new Promise<void>((r) => setTimeout(r, 0));
		store.getState().setSubscriptionData("test:vis", "visible-value");

		Object.defineProperty(document, "hidden", { value: true, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));
		store.getState().setSubscriptionData("test:vis", "buffered-value");

		expect(store.getState().subscriptions["test:vis"]?.data).toBe("visible-value");

		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		expect(store.getState().subscriptions["test:vis"]?.data).toBe("buffered-value");
		expect(triggerReconnect).not.toHaveBeenCalled();

		store.getState().releaseSubscription("test:vis");
	});

	it("marks an expired retained account snapshot stale synchronously on foreground resume", async () => {
		vi.useFakeTimers({ now: 0 });
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const subscribe = vi.fn(createFakeSubscription().subscribe);
		const key = JSON.stringify(["hl", "subscription", "openOrders", { user: "0xabc" }]);

		store.getState().acquireSubscription(key, subscribe);
		await vi.advanceTimersByTimeAsync(0);
		store.getState().setSubscriptionData(key, { sequence: 1 });
		Object.defineProperty(document, "hidden", { value: true, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		vi.setSystemTime(60_000);
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		expect(store.getState().subscriptions[key]).toMatchObject({ data: { sequence: 1 }, isStale: true });
		await vi.advanceTimersByTimeAsync(0);
		expect(subscribe).toHaveBeenCalledTimes(2);
		expect(triggerReconnect).not.toHaveBeenCalled();
		store.getState().releaseSubscription(key);
	});

	it("restarts watchdog deadlines before recovering multiple expired foreground snapshots", async () => {
		vi.useFakeTimers({ now: 0 });
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const methods = ["openOrders", "webData3"];
		const streams = methods.map((method) => {
			const subscribe = vi.fn(createFakeSubscription().subscribe);
			const key = JSON.stringify(["hl", "subscription", method, { user: "0xabc" }]);
			return { key, subscribe };
		});

		for (const { key, subscribe } of streams) {
			store.getState().acquireSubscription(key, subscribe);
		}
		await vi.advanceTimersByTimeAsync(0);
		for (const { key } of streams) {
			store.getState().setSubscriptionData(key, { sequence: 1 });
		}

		Object.defineProperty(document, "hidden", { value: true, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));
		vi.setSystemTime(60_000);
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));
		await vi.advanceTimersByTimeAsync(0);

		for (const { key, subscribe } of streams) {
			expect(store.getState().subscriptions[key]?.isStale).toBe(true);
			expect(subscribe).toHaveBeenCalledTimes(2);
		}

		await vi.advanceTimersByTimeAsync(5_000);
		expect(triggerReconnect).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(60_000);
		expect(triggerReconnect).toHaveBeenCalledOnce();

		for (const { key } of streams) {
			store.getState().releaseSubscription(key);
		}
	});

	it("calls triggerReconnect when network goes offline→online", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const { subscribe } = createFakeSubscription();

		store.getState().acquireSubscription("test:net", subscribe);
		await new Promise<void>((r) => setTimeout(r, 0));

		window.dispatchEvent(new Event("offline"));
		window.dispatchEvent(new Event("online"));

		expect(triggerReconnect).toHaveBeenCalledTimes(1);

		store.getState().releaseSubscription("test:net");
	});

	it("isolates a throwing reconnect trigger so later network listeners still recover", async () => {
		const triggerReconnect = vi.fn(() => {
			throw new Error("reconnect failed");
		});
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const { subscribe } = createFakeSubscription();
		store.getState().acquireSubscription("test:throwing-reconnect", subscribe);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		const { subscribeNetworkStatus } = await import("@gatu/hl-react/internal/websocket/network-status");
		const laterListener = vi.fn();
		const unsubscribe = subscribeNetworkStatus(laterListener);

		window.dispatchEvent(new Event("offline"));
		window.dispatchEvent(new Event("online"));

		expect(triggerReconnect).toHaveBeenCalledOnce();
		expect(laterListener).toHaveBeenLastCalledWith("online");
		unsubscribe();
		store.getState().releaseSubscription("test:throwing-reconnect");
	});

	it("keeps retained account snapshots stale across offline recovery until fresh data arrives", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const { subscribe } = createFakeSubscription();
		const key = JSON.stringify(["hl", "subscription", "openOrders", { user: "0xabc" }]);

		store.getState().acquireSubscription(key, subscribe);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		store.getState().setSubscriptionData(key, { sequence: 1 });

		window.dispatchEvent(new Event("offline"));
		expect(store.getState().subscriptions[key]).toMatchObject({ data: { sequence: 1 }, isStale: true });

		store.getState().setSubscriptionData(key, { sequence: 2 });
		expect(store.getState().subscriptions[key]?.isStale).toBe(false);

		window.dispatchEvent(new Event("online"));
		expect(triggerReconnect).toHaveBeenCalledOnce();
		expect(store.getState().subscriptions[key]).toMatchObject({ data: { sequence: 2 }, isStale: true });

		store.getState().setSubscriptionData(key, { sequence: 3 });
		expect(store.getState().subscriptions[key]).toMatchObject({ data: { sequence: 3 }, isStale: false });

		store.getState().releaseSubscription(key);
	});

	it("reconnects when a store that attached offline first comes online", async () => {
		Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const { subscribe } = createFakeSubscription();

		store.getState().acquireSubscription("test:initial-offline", subscribe);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
		window.dispatchEvent(new Event("online"));

		expect(triggerReconnect).toHaveBeenCalledOnce();
		store.getState().releaseSubscription("test:initial-offline");
	});

	it.each(["allDexsClearinghouseState", "clearinghouseState", "openOrders", "spotState", "twapStates", "webData3"])(
		"marks retained %s snapshots stale as soon as the transport disconnects",
		async (method) => {
			let notifyDisconnect: (() => void) | undefined;
			const detachDisconnect = vi.fn();
			const store = createHyperliquidStore({
				ssr: false,
				triggerReconnect: vi.fn(),
				subscribeDisconnect: (listener) => {
					notifyDisconnect = listener;
					return detachDisconnect;
				},
			});
			const { subscribe } = createFakeSubscription();
			const key = JSON.stringify(["hl", "subscription", method, { user: "0xabc" }]);

			store.getState().acquireSubscription(key, subscribe);
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
			store.getState().setSubscriptionData(key, { sequence: 1 });
			notifyDisconnect?.();

			expect(store.getState().subscriptions[key]).toMatchObject({ data: { sequence: 1 }, isStale: true });
			store.getState().releaseSubscription(key);
			expect(detachDisconnect).toHaveBeenCalledOnce();
		},
	);

	it("drops a hidden account snapshot buffer when the transport disconnects before first paint", async () => {
		let notifyDisconnect: (() => void) | undefined;
		const store = createHyperliquidStore({
			ssr: false,
			triggerReconnect: vi.fn(),
			subscribeDisconnect: (listener) => {
				notifyDisconnect = listener;
				return () => {};
			},
		});
		const { subscribe } = createFakeSubscription();
		const key = JSON.stringify(["hl", "subscription", "openOrders", { user: "0xabc" }]);

		store.getState().acquireSubscription(key, subscribe, undefined, true);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		Object.defineProperty(document, "hidden", { value: true, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));
		store.getState().setSubscriptionData(key, { sequence: 1 });
		expect(getStoreInternals(store).visibilityBuffer.has(key)).toBe(true);

		notifyDisconnect?.();
		expect(getStoreInternals(store).visibilityBuffer.has(key)).toBe(false);

		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));
		expect(store.getState().subscriptions[key]?.data).toBeUndefined();

		store.getState().releaseSubscription(key);
	});

	it("does not call triggerReconnect on visible without prior hidden", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const { subscribe } = createFakeSubscription();

		store.getState().acquireSubscription("test:noop", subscribe);
		await new Promise<void>((r) => setTimeout(r, 0));

		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		expect(triggerReconnect).not.toHaveBeenCalled();

		store.getState().releaseSubscription("test:noop");
	});

	it("detaches singletons when last subscription is released", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const { subscribe } = createFakeSubscription();

		store.getState().acquireSubscription("test:detach", subscribe);
		await new Promise<void>((r) => setTimeout(r, 0));
		store.getState().releaseSubscription("test:detach");

		Object.defineProperty(document, "hidden", { value: true, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		expect(triggerReconnect).not.toHaveBeenCalled();
	});

	it("does not attach singletons when triggerReconnect is undefined", async () => {
		const store = createHyperliquidStore({ ssr: false });
		const { subscribe } = createFakeSubscription();

		store.getState().acquireSubscription("test:noreconnect", subscribe);
		await new Promise<void>((r) => setTimeout(r, 0));

		Object.defineProperty(document, "hidden", { value: true, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		store.getState().releaseSubscription("test:noreconnect");
	});
});
