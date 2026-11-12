// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSubscription } from "./harness/subscription";

let createHyperliquidStore: typeof import("@sairn/hl-react/store").createHyperliquidStore;
let getStoreInternals: typeof import("@sairn/hl-react/store").getStoreInternals;

describe("store-driven resume via singletons", () => {
	beforeEach(async () => {
		vi.resetModules();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
		const mod = await import("@sairn/hl-react/store");
		createHyperliquidStore = mod.createHyperliquidStore;
		getStoreInternals = mod.getStoreInternals;
	});

	afterEach(() => {
		vi.restoreAllMocks();
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
		const { subscribeNetworkStatus } = await import("@sairn/hl-react/internal/websocket/network-status");
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

	it.each([
		"activeAssetCtx",
		"activeSpotAssetCtx",
		"allMids",
		"allDexsClearinghouseState",
		"clearinghouseState",
		"openOrders",
		"spotState",
		"twapStates",
		"userFills",
		"userHistoricalOrders",
		"webData3",
	])("marks retained %s snapshots stale as soon as the transport disconnects", async (method) => {
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
	});

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

	function setHidden(hidden: boolean) {
		Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));
	}

	function createFlakySubscription() {
		const state = { failing: true };
		const subscribe = vi.fn(async () => {
			if (state.failing) throw new Error("connection unavailable");
			return { unsubscribe: async () => {} };
		});
		return { state, subscribe };
	}

	it("retries a subscription that is waiting out its backoff as soon as the page returns", async () => {
		vi.useFakeTimers({ now: 0 });
		vi.spyOn(Math, "random").mockReturnValue(0);
		const store = createHyperliquidStore({ ssr: false, triggerReconnect: vi.fn() });
		const { state, subscribe } = createFlakySubscription();
		const key = "test:backoff-resume";

		store.getState().acquireSubscription(key, subscribe);
		setHidden(true);
		await vi.advanceTimersByTimeAsync(8_000);
		const attemptsWhileHidden = subscribe.mock.calls.length;
		expect(attemptsWhileHidden).toBe(6);
		expect(store.getState().subscriptions[key]?.status).toBe("error");

		state.failing = false;
		setHidden(false);
		await vi.advanceTimersByTimeAsync(0);

		expect(subscribe).toHaveBeenCalledTimes(attemptsWhileHidden + 1);
		expect(store.getState().subscriptions[key]?.status).toBe("active");
		await vi.advanceTimersByTimeAsync(10_000);
		expect(subscribe).toHaveBeenCalledTimes(attemptsWhileHidden + 1);
		store.getState().releaseSubscription(key);
	});

	it("ends the reconnect cooldown when the page returns", async () => {
		vi.useFakeTimers({ now: 0 });
		vi.spyOn(Math, "random").mockReturnValue(0);
		const store = createHyperliquidStore({ ssr: false, triggerReconnect: vi.fn() });
		const { state, subscribe } = createFlakySubscription();
		const key = "test:cooldown-resume";

		store.getState().acquireSubscription(key, subscribe);
		setHidden(true);
		await vi.advanceTimersByTimeAsync(90_000);
		const attemptsWhileHidden = subscribe.mock.calls.length;
		expect(String(store.getState().subscriptions[key]?.error)).toContain("Reconnect cooldown active");

		state.failing = false;
		setHidden(false);
		await vi.advanceTimersByTimeAsync(0);

		expect(subscribe).toHaveBeenCalledTimes(attemptsWhileHidden + 1);
		expect(store.getState().subscriptions[key]).toMatchObject({ status: "active", error: undefined });
		store.getState().releaseSubscription(key);
	});

	it("backs off from the first delay, not into a new cooldown, when the retry on return fails", async () => {
		vi.useFakeTimers({ now: 0 });
		vi.spyOn(Math, "random").mockReturnValue(0);
		const store = createHyperliquidStore({ ssr: false, triggerReconnect: vi.fn() });
		const { subscribe } = createFlakySubscription();
		const key = "test:cooldown-resume-still-failing";

		store.getState().acquireSubscription(key, subscribe);
		setHidden(true);
		await vi.advanceTimersByTimeAsync(90_000);
		const attemptsWhileHidden = subscribe.mock.calls.length;
		expect(String(store.getState().subscriptions[key]?.error)).toContain("Reconnect cooldown active");

		setHidden(false);
		await vi.advanceTimersByTimeAsync(0);
		expect(subscribe).toHaveBeenCalledTimes(attemptsWhileHidden + 1);

		await vi.advanceTimersByTimeAsync(250);
		expect(subscribe).toHaveBeenCalledTimes(attemptsWhileHidden + 2);
		expect(String(store.getState().subscriptions[key]?.error)).not.toContain("Reconnect cooldown active");
		store.getState().releaseSubscription(key);
	});

	it("starts the backoff over when the retry on return fails", async () => {
		vi.useFakeTimers({ now: 0 });
		vi.spyOn(Math, "random").mockReturnValue(0);
		const store = createHyperliquidStore({ ssr: false, triggerReconnect: vi.fn() });
		const { subscribe } = createFlakySubscription();
		const key = "test:backoff-resume-still-failing";

		store.getState().acquireSubscription(key, subscribe);
		setHidden(true);
		await vi.advanceTimersByTimeAsync(8_000);
		const attemptsWhileHidden = subscribe.mock.calls.length;

		setHidden(false);
		await vi.advanceTimersByTimeAsync(0);
		expect(subscribe).toHaveBeenCalledTimes(attemptsWhileHidden + 1);

		await vi.advanceTimersByTimeAsync(249);
		expect(subscribe).toHaveBeenCalledTimes(attemptsWhileHidden + 1);
		await vi.advanceTimersByTimeAsync(1);
		expect(subscribe).toHaveBeenCalledTimes(attemptsWhileHidden + 2);
		store.getState().releaseSubscription(key);
	});

	it("retries a waiting subscription as soon as the network returns", async () => {
		vi.useFakeTimers({ now: 0 });
		vi.spyOn(Math, "random").mockReturnValue(0);
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const { state, subscribe } = createFlakySubscription();
		const key = "test:backoff-online";

		store.getState().acquireSubscription(key, subscribe);
		Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
		window.dispatchEvent(new Event("offline"));
		await vi.advanceTimersByTimeAsync(8_000);
		const attemptsWhileOffline = subscribe.mock.calls.length;

		state.failing = false;
		Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
		window.dispatchEvent(new Event("online"));
		await vi.advanceTimersByTimeAsync(0);

		expect(triggerReconnect).toHaveBeenCalledOnce();
		expect(subscribe).toHaveBeenCalledTimes(attemptsWhileOffline + 1);
		expect(store.getState().subscriptions[key]?.status).toBe("active");
		store.getState().releaseSubscription(key);
	});

	it("keeps the backoff when the page returns while the network is still offline", async () => {
		vi.useFakeTimers({ now: 0 });
		vi.spyOn(Math, "random").mockReturnValue(0);
		const store = createHyperliquidStore({ ssr: false, triggerReconnect: vi.fn() });
		const { subscribe } = createFlakySubscription();
		const key = "test:backoff-offline-resume";

		store.getState().acquireSubscription(key, subscribe);
		setHidden(true);
		Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
		window.dispatchEvent(new Event("offline"));
		await vi.advanceTimersByTimeAsync(8_000);
		const attemptsWhileHidden = subscribe.mock.calls.length;

		setHidden(false);
		await vi.advanceTimersByTimeAsync(0);

		expect(subscribe).toHaveBeenCalledTimes(attemptsWhileHidden);
		store.getState().releaseSubscription(key);
	});

	it("leaves an active subscription untouched when the page returns", async () => {
		const store = createHyperliquidStore({ ssr: false, triggerReconnect: vi.fn() });
		const subscribe = vi.fn(createFakeSubscription().subscribe);
		const key = "test:active-resume";

		store.getState().acquireSubscription(key, subscribe);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		setHidden(true);
		setHidden(false);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		expect(subscribe).toHaveBeenCalledOnce();
		expect(store.getState().subscriptions[key]?.status).toBe("active");
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
