// @vitest-environment jsdom

import type { ISubscription } from "@nktkas/hyperliquid";
import { WS_RELIABILITY_LIMITS } from "@sairn/hl-react/internal/websocket/reliability";
import { createHyperliquidStore } from "@sairn/hl-react/store";
import { describe, expect, it, vi } from "vitest";

describe("subscription limit entries", () => {
	it("drops the error entry recorded for a key over the tracked-key limit when that key is released", () => {
		const store = createHyperliquidStore({
			ssr: false,
			triggerReconnect: vi.fn(),
			subscribeDisconnect: () => () => {},
		});
		const subscribe = vi.fn(async (): Promise<ISubscription> => ({ unsubscribe: vi.fn(async () => {}) }));
		const limit = WS_RELIABILITY_LIMITS.subscriptions.maxTrackedKeys;
		const keys = Array.from({ length: limit + 1 }, (_, index) => `allMids:${JSON.stringify({ dex: `d${index}` })}`);

		for (const key of keys) store.getState().acquireSubscription(key, subscribe, null, false);
		const overflowKey = keys[limit];
		expect(store.getState().subscriptions[overflowKey]?.status).toBe("error");

		store.getState().acquireSubscription(overflowKey, subscribe, null, false);
		for (const key of keys.slice(0, limit)) store.getState().releaseSubscription(key);
		expect(store.getState().wsStatus).toBe("error");

		store.getState().releaseSubscription(overflowKey);
		expect(store.getState().subscriptions[overflowKey]?.status).toBe("error");

		store.getState().releaseSubscription(overflowKey);
		expect(store.getState().subscriptions[overflowKey]).toBeUndefined();
		expect(store.getState().wsStatus).toBe("idle");
		expect(Object.keys(store.getState().subscriptions)).toHaveLength(0);
	});

	it("keeps serving a refused consumer once capacity returns and a later consumer starts the key", async () => {
		const store = createHyperliquidStore({
			ssr: false,
			triggerReconnect: vi.fn(),
			subscribeDisconnect: () => () => {},
		});
		const subscribe = vi.fn(async (): Promise<ISubscription> => ({ unsubscribe: vi.fn(async () => {}) }));
		const unsubscribe = vi.fn(async () => {});
		const overflowSubscribe = vi.fn(async (): Promise<ISubscription> => ({ unsubscribe }));
		const limit = WS_RELIABILITY_LIMITS.subscriptions.maxTrackedKeys;
		const keys = Array.from({ length: limit + 1 }, (_, index) => `allMids:${JSON.stringify({ dex: `d${index}` })}`);
		for (const key of keys) store.getState().acquireSubscription(key, subscribe, null, false);
		const overflowKey = keys[limit];

		for (const key of keys.slice(0, limit)) store.getState().releaseSubscription(key);
		store.getState().acquireSubscription(overflowKey, overflowSubscribe, null, false);
		await Promise.resolve();
		expect(store.getState().subscriptions[overflowKey]?.status).not.toBe("error");

		store.getState().releaseSubscription(overflowKey);
		await Promise.resolve();
		expect(store.getState().subscriptions[overflowKey]).toBeDefined();
		expect(unsubscribe).not.toHaveBeenCalled();

		store.getState().releaseSubscription(overflowKey);
		await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));
		expect(store.getState().subscriptions[overflowKey]).toBeUndefined();
	});
});
