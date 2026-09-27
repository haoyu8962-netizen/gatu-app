// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSubscription } from "./harness/subscription";

let createHyperliquidStore: typeof import("@gatu/hl-react/store").createHyperliquidStore;
let getStoreInternals: typeof import("@gatu/hl-react/store").getStoreInternals;

describe("store staleness integration", () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		vi.resetModules();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		const mod = await import("@gatu/hl-react/store");
		createHyperliquidStore = mod.createHyperliquidStore;
		getStoreInternals = mod.getStoreInternals;
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

	it.each([
		{ label: "default", params: { coin: "ETH" }, elapsedMs: 20_000 },
		{ label: "fast", params: { coin: "ETH", fast: true }, elapsedMs: 5_000 },
	])("resubscribes a stale $label l2Book stream and clears staleness on recovery", async ({ params, elapsedMs }) => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const unsubscribes: Array<ReturnType<typeof vi.fn>> = [];
		const subscribe = vi.fn(async () => {
			const unsubscribe = vi.fn(async () => {});
			unsubscribes.push(unsubscribe);
			return { unsubscribe };
		});
		const key = JSON.stringify(["hl", "subscription", "l2Book", params]);

		store.getState().acquireSubscription(key, subscribe);
		await vi.advanceTimersByTimeAsync(0);
		store.getState().setSubscriptionData(key, { coin: "ETH", levels: [[], []] });

		await vi.advanceTimersByTimeAsync(elapsedMs);

		expect(store.getState().subscriptions[key]?.isStale).toBe(true);
		expect(subscribe).toHaveBeenCalledTimes(2);
		expect(unsubscribes[0]).toHaveBeenCalledTimes(1);
		expect(triggerReconnect).not.toHaveBeenCalled();

		store.getState().setSubscriptionData(key, { coin: "ETH", levels: [[{ px: "1" }], []] });
		expect(store.getState().subscriptions[key]?.isStale).toBe(false);

		store.getState().releaseSubscription(key);
	});

	it.each(["l2Book", "bbo"])("does not reactivate retained %s data after reconnect acknowledgement", async (method) => {
		const store = createHyperliquidStore({ ssr: false, triggerReconnect: vi.fn() });
		let reportError: ((error: unknown) => void) | undefined;
		const subscribe = vi.fn(async (options?: { onError?: (error: unknown) => void }) => {
			reportError = options?.onError;
			return { unsubscribe: vi.fn(async () => {}) };
		});
		const key = JSON.stringify(["hl", "subscription", method, { coin: "ETH" }]);

		store.getState().acquireSubscription(key, subscribe);
		await vi.advanceTimersByTimeAsync(0);
		store.getState().setSubscriptionData(key, { coin: "ETH", levels: [[{ px: "1" }], []] });
		reportError?.(new Error("socket failed"));

		expect(store.getState().subscriptions[key]).toMatchObject({ data: undefined, status: "error" });
		await vi.advanceTimersByTimeAsync(1_000);
		expect(subscribe).toHaveBeenCalledTimes(2);
		expect(store.getState().subscriptions[key]).toMatchObject({ data: undefined, status: "active" });
		store.getState().releaseSubscription(key);
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
		"userFundings",
		"userHistoricalOrders",
		"webData3",
	])("keeps retained %s snapshots stale until the reconnect delivers fresh data", async (method) => {
		const store = createHyperliquidStore({ ssr: false, triggerReconnect: vi.fn() });
		let reportError: ((error: unknown) => void) | undefined;
		const subscribe = vi.fn(async (options?: { onError?: (error: unknown) => void }) => {
			reportError = options?.onError;
			return { unsubscribe: vi.fn(async () => {}) };
		});
		const key = JSON.stringify(["hl", "subscription", method, { user: "0xabc" }]);
		const retainedSnapshot = { sequence: 1 };

		store.getState().acquireSubscription(key, subscribe);
		await vi.advanceTimersByTimeAsync(0);
		store.getState().setSubscriptionData(key, retainedSnapshot);
		reportError?.(new Error("socket failed"));

		expect(store.getState().subscriptions[key]).toMatchObject({
			data: retainedSnapshot,
			isStale: true,
			status: "error",
		});

		await vi.advanceTimersByTimeAsync(1_000);
		expect(subscribe).toHaveBeenCalledTimes(2);
		expect(store.getState().subscriptions[key]).toMatchObject({
			data: retainedSnapshot,
			isStale: true,
			status: "active",
		});

		const freshSnapshot = { sequence: 2 };
		store.getState().setSubscriptionData(key, freshSnapshot);
		expect(store.getState().subscriptions[key]).toMatchObject({
			data: freshSnapshot,
			isStale: false,
			status: "active",
		});

		store.getState().releaseSubscription(key);
	});

	it("resubscribes a watchdog-stale market stream without reconnecting for transport-stale snapshots", async () => {
		let notifyDisconnect: (() => void) | undefined;
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({
			ssr: false,
			triggerReconnect,
			subscribeDisconnect: (listener) => {
				notifyDisconnect = listener;
				return () => {};
			},
		});
		const marketUnsubscribe = vi.fn(async () => {});
		const marketSubscribe = vi.fn(async () => ({ unsubscribe: marketUnsubscribe }));
		const accountSubscribe = vi.fn(async () => ({ unsubscribe: vi.fn(async () => {}) }));
		const marketKey = JSON.stringify(["hl", "subscription", "allMids", { dex: "" }]);
		const accountKey = JSON.stringify(["hl", "subscription", "openOrders", { user: "0xabc" }]);

		store.getState().acquireSubscription(marketKey, marketSubscribe);
		store.getState().acquireSubscription(accountKey, accountSubscribe);
		await vi.advanceTimersByTimeAsync(0);
		store.getState().setSubscriptionData(marketKey, { mids: {} });
		store.getState().setSubscriptionData(accountKey, { orders: [] });
		notifyDisconnect?.();

		expect(store.getState().subscriptions[accountKey]?.isStale).toBe(true);
		expect(store.getState().subscriptions[marketKey]?.isStale).toBe(true);

		await vi.advanceTimersByTimeAsync(25_000);

		expect(triggerReconnect).not.toHaveBeenCalled();
		expect(marketSubscribe).toHaveBeenCalledTimes(2);
		expect(marketUnsubscribe).toHaveBeenCalledOnce();
		expect(accountSubscribe).toHaveBeenCalledOnce();

		store.getState().releaseSubscription(marketKey);
		store.getState().releaseSubscription(accountKey);
	});

	it.each(["l2Book", "bbo"])("drops hidden buffered %s data when the confirmed subscription fails", async (method) => {
		const store = createHyperliquidStore({ ssr: false, triggerReconnect: vi.fn() });
		let reportError: ((error: unknown) => void) | undefined;
		const subscribe = vi.fn(async (options?: { onError?: (error: unknown) => void }) => {
			reportError = options?.onError;
			return { unsubscribe: vi.fn(async () => {}) };
		});
		const key = JSON.stringify(["hl", "subscription", method, { coin: "ETH" }]);

		store.getState().acquireSubscription(key, subscribe);
		await vi.advanceTimersByTimeAsync(0);
		Object.defineProperty(document, "hidden", { value: true, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));
		store.getState().setSubscriptionData(key, { coin: "ETH", sequence: 1 });

		expect(getStoreInternals(store).visibilityBuffer.has(key)).toBe(true);
		reportError?.(new Error("socket failed"));
		expect(getStoreInternals(store).visibilityBuffer.has(key)).toBe(false);

		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));
		expect(store.getState().subscriptions[key]).toMatchObject({ data: undefined, status: "error" });
		store.getState().releaseSubscription(key);
	});

	it("does not stale a non-book stream before its first payload", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const subscribe = vi.fn(createFakeSubscription().subscribe);
		const key = JSON.stringify(["hl", "subscription", "allMids", { dex: "" }]);

		store.getState().acquireSubscription(key, subscribe);
		await vi.advanceTimersByTimeAsync(2 * 60_000);

		expect(store.getState().subscriptions[key]?.isStale).toBeFalsy();
		expect(triggerReconnect).not.toHaveBeenCalled();
		store.getState().releaseSubscription(key);
	});

	it.each([
		{ label: "default", params: { coin: "ETH" }, elapsedMs: 20_000 },
		{ label: "fast", params: { coin: "ETH", fast: true }, elapsedMs: 5_000 },
	])("resubscribes a confirmed $label l2Book that never delivers its first frame", async ({ params, elapsedMs }) => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const subscribe = vi.fn(createFakeSubscription().subscribe);
		const key = JSON.stringify(["hl", "subscription", "l2Book", params]);

		store.getState().acquireSubscription(key, subscribe);
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(elapsedMs);

		expect(store.getState().subscriptions[key]?.isStale).toBe(true);
		expect(subscribe).toHaveBeenCalledTimes(2);
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

	it.each(["pac", "sac", "allDexsAssetCtxs", "spotAssetCtxs"])(
		"marks a silent %s stream stale and resubscribes it after the system clock is set back",
		async (method) => {
			const triggerReconnect = vi.fn();
			const store = createHyperliquidStore({ ssr: false, triggerReconnect });
			const subscribe = vi.fn(createFakeSubscription().subscribe);
			const key = JSON.stringify(["hl", "subscription", method, null]);

			store.getState().acquireSubscription(key, subscribe);
			await vi.advanceTimersByTimeAsync(0);
			store.getState().setSubscriptionData(key, { sequence: 1 });
			const receivedAt = Date.now();

			vi.setSystemTime(receivedAt - 60 * 60_000);
			await vi.advanceTimersByTimeAsync(20_000);
			expect(store.getState().subscriptions[key]?.isStale).toBe(false);

			await vi.advanceTimersByTimeAsync(5_000);
			expect(store.getState().subscriptions[key]).toMatchObject({
				data: { sequence: 1 },
				isStale: true,
				lastMessageAt: receivedAt,
			});
			expect(subscribe).toHaveBeenCalledTimes(2);
			expect(triggerReconnect).not.toHaveBeenCalled();
			expect(getStoreInternals(store).recoveryEvents.at(-1)).toMatchObject({
				cause: "stream-stale",
				streams: [{ key, lastMessageAt: receivedAt, staleForMs: 25_000 }],
			});

			await vi.advanceTimersByTimeAsync(10 * 60_000);
			expect(Date.now()).toBeLessThan(receivedAt);
			expect(store.getState().subscriptions[key]?.isStale).toBe(true);

			store.getState().setSubscriptionData(key, { sequence: 2 });
			expect(store.getState().subscriptions[key]).toMatchObject({ isStale: false, lastMessageAt: Date.now() });

			store.getState().releaseSubscription(key);
		},
	);

	it.each([
		{ method: "pac", params: null, retained: { sequence: 1 } },
		{ method: "allMids", params: { dex: "" }, retained: undefined },
	])(
		"does not resume a $method snapshot buffered while hidden as fresh after the system clock was set back",
		async ({ method, params, retained }) => {
			const store = createHyperliquidStore({ ssr: false, triggerReconnect: vi.fn() });
			const subscribe = vi.fn(createFakeSubscription().subscribe);
			const key = JSON.stringify(["hl", "subscription", method, params]);

			store.getState().acquireSubscription(key, subscribe);
			await vi.advanceTimersByTimeAsync(0);
			Object.defineProperty(document, "hidden", { value: true, configurable: true });
			document.dispatchEvent(new Event("visibilitychange"));
			store.getState().setSubscriptionData(key, { sequence: 1 });
			expect(getStoreInternals(store).visibilityBuffer.has(key)).toBe(true);

			vi.setSystemTime(Date.now() - 60 * 60_000);
			await vi.advanceTimersByTimeAsync(30_000);
			Object.defineProperty(document, "hidden", { value: false, configurable: true });
			document.dispatchEvent(new Event("visibilitychange"));

			expect(store.getState().subscriptions[key]?.data).toEqual(retained);
			expect(store.getState().subscriptions[key]?.isStale).toBe(true);
			store.getState().releaseSubscription(key);
		},
	);

	it("marks a silent raw l2 stream stale after the system clock is set back and leaves recovery to its wrapper", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const subscribe = vi.fn(createFakeSubscription().subscribe);
		const key = JSON.stringify(["hl", "subscription", "l2", { coin: "ETH" }]);

		store.getState().acquireSubscription(key, subscribe);
		await vi.advanceTimersByTimeAsync(0);
		store.getState().setSubscriptionData(key, { coin: "ETH", sequence: 1 });

		vi.setSystemTime(Date.now() - 60 * 60_000);
		await vi.advanceTimersByTimeAsync(5_000);

		expect(store.getState().subscriptions[key]?.isStale).toBe(true);
		expect(subscribe).toHaveBeenCalledOnce();
		expect(triggerReconnect).not.toHaveBeenCalled();
		store.getState().releaseSubscription(key);
	});

	it("recovers a retained account snapshot on foreground resume after the system clock was set back", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const subscribe = vi.fn(createFakeSubscription().subscribe);
		const key = JSON.stringify(["hl", "subscription", "openOrders", { user: "0xabc" }]);

		store.getState().acquireSubscription(key, subscribe);
		await vi.advanceTimersByTimeAsync(0);
		store.getState().setSubscriptionData(key, { sequence: 1 });
		Object.defineProperty(document, "hidden", { value: true, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		vi.setSystemTime(Date.now() - 60 * 60_000);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(store.getState().subscriptions[key]?.isStale).toBe(false);
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		expect(store.getState().subscriptions[key]).toMatchObject({ data: { sequence: 1 }, isStale: true });
		await vi.advanceTimersByTimeAsync(0);
		expect(subscribe).toHaveBeenCalledTimes(2);
		expect(triggerReconnect).not.toHaveBeenCalled();
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

	it("does not attach a released pending subscription to a same-key runtime", async () => {
		const store = createHyperliquidStore({ ssr: false });
		const oldUnsubscribe = vi.fn(async () => {});
		const currentUnsubscribe = vi.fn(async () => {});
		let resolveOld: ((subscription: { unsubscribe: () => Promise<void> }) => void) | undefined;
		let resolveCurrent: ((subscription: { unsubscribe: () => Promise<void> }) => void) | undefined;
		const oldSubscribe = vi.fn(
			() =>
				new Promise<{ unsubscribe: () => Promise<void> }>((resolve) => {
					resolveOld = resolve;
				}),
		);
		const currentSubscribe = vi.fn(
			() =>
				new Promise<{ unsubscribe: () => Promise<void> }>((resolve) => {
					resolveCurrent = resolve;
				}),
		);
		const key = JSON.stringify(["hl", "subscription", "l2Book", { coin: "REACQUIRED" }]);

		store.getState().acquireSubscription(key, oldSubscribe);
		store.getState().releaseSubscription(key);
		store.getState().acquireSubscription(key, currentSubscribe);

		resolveOld?.({ unsubscribe: oldUnsubscribe });
		await vi.advanceTimersByTimeAsync(0);

		const pendingRuntime = getStoreInternals(store).subscriptionRuntime.get(key);
		expect(oldUnsubscribe).toHaveBeenCalledTimes(1);
		expect(pendingRuntime?.promise).toBeDefined();
		expect(pendingRuntime?.subscription).toBeUndefined();
		expect(store.getState().subscriptions[key]?.status).toBe("subscribing");

		resolveCurrent?.({ unsubscribe: currentUnsubscribe });
		await vi.advanceTimersByTimeAsync(0);

		expect(store.getState().subscriptions[key]?.status).toBe("active");
		expect(getStoreInternals(store).subscriptionRuntime.get(key)?.subscription).toBeDefined();

		store.getState().releaseSubscription(key);
		expect(currentUnsubscribe).toHaveBeenCalledTimes(1);
	});
});
