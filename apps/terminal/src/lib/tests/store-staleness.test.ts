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

	it.each(["allDexsClearinghouseState", "openOrders"])(
		"keeps retained %s snapshots stale until the reconnect delivers fresh data",
		async (method) => {
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
		},
	);

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
