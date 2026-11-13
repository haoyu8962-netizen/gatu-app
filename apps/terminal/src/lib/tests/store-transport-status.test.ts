// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSubscription } from "./harness/subscription";

let createHyperliquidStore: typeof import("@sairn/hl-react/store").createHyperliquidStore;

class FakeSocket extends EventTarget {
	readyState = 1;
	open() {
		this.readyState = 1;
		this.dispatchEvent(new Event("open"));
	}
}

function createHarness(options: { withSocket?: boolean } = {}) {
	const socket = new FakeSocket();
	const disconnectListeners = new Set<() => void>();
	const wsTransport = options.withSocket === false ? {} : { socket };
	const store = createHyperliquidStore({
		ssr: false,
		triggerReconnect: vi.fn(),
		subscribeDisconnect: (listener) => {
			disconnectListeners.add(listener);
			return () => disconnectListeners.delete(listener);
		},
		wsTransport: wsTransport as never,
	});
	return {
		store,
		socket,
		disconnect: () => {
			socket.readyState = 0;
			for (const listener of [...disconnectListeners]) listener();
		},
	};
}

const key = (method: string, params: object, refreshKey?: string) =>
	JSON.stringify(["hl", "subscription", method, params, ...(refreshKey === undefined ? [] : [{ refreshKey }])]);

function setNetwork(online: boolean) {
	Object.defineProperty(navigator, "onLine", { value: online, configurable: true });
	window.dispatchEvent(new Event(online ? "online" : "offline"));
}

describe("shared transport status in the store", () => {
	beforeEach(async () => {
		vi.resetModules();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
		createHyperliquidStore = (await import("@sairn/hl-react/store")).createHyperliquidStore;
	});

	afterEach(() => {
		vi.useRealTimers();
		Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
	});

	it("reports a disconnect until the socket opens again, although every subscription still looks active", async () => {
		const { store, socket, disconnect } = createHarness();
		const allMids = key("allMids", {});
		store.getState().acquireSubscription(allMids, createFakeSubscription().subscribe);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		store.getState().setSubscriptionData(allMids, { mids: {} });
		expect(store.getState()).toMatchObject({ wsStatus: "open", transportStatus: "open" });

		disconnect();
		expect(store.getState()).toMatchObject({ wsStatus: "open", transportStatus: "reconnecting" });

		socket.open();
		expect(store.getState().transportStatus).toBe("open");
		store.getState().releaseSubscription(allMids);
	});

	it("reports offline while the network is gone and reconnecting until the socket opens after it returns", async () => {
		const { store, socket, disconnect } = createHarness();
		const allMids = key("allMids", {});
		store.getState().acquireSubscription(allMids, createFakeSubscription().subscribe);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		setNetwork(false);
		disconnect();
		expect(store.getState().transportStatus).toBe("offline");

		setNetwork(true);
		expect(store.getState().transportStatus).toBe("reconnecting");

		socket.open();
		expect(store.getState().transportStatus).toBe("open");
		store.getState().releaseSubscription(allMids);
		expect(store.getState().transportStatus).toBe("open");
	});

	it("does not claim a reconnect it cannot see end when the transport exposes no socket", async () => {
		const { store, disconnect } = createHarness({ withSocket: false });
		const allMids = key("allMids", {});
		store.getState().acquireSubscription(allMids, createFakeSubscription().subscribe);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		disconnect();
		expect(store.getState().transportStatus).toBe("open");
		store.getState().releaseSubscription(allMids);
	});
});

describe("bbo across a disconnect", () => {
	beforeEach(async () => {
		vi.resetModules();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
		createHyperliquidStore = (await import("@sairn/hl-react/store")).createHyperliquidStore;
	});

	it("marks a retained best bid and offer stale on disconnect and fresh again on the next frame", async () => {
		const { store, disconnect } = createHarness();
		const bbo = key("bbo", { coin: "BTC" });
		store.getState().acquireSubscription(bbo, createFakeSubscription().subscribe);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		store.getState().setSubscriptionData(bbo, { coin: "BTC", bbo: [{ px: "1" }, { px: "2" }] });
		expect(store.getState().subscriptions[bbo]?.isStale).toBe(false);

		disconnect();
		expect(store.getState().subscriptions[bbo]).toMatchObject({ status: "active", isStale: true });

		store.getState().setSubscriptionData(bbo, { coin: "BTC", bbo: [{ px: "1" }, { px: "3" }] });
		expect(store.getState().subscriptions[bbo]?.isStale).toBe(false);
		store.getState().releaseSubscription(bbo);
	});

	it("marks a retained best bid and offer stale when the network goes offline", async () => {
		const { store } = createHarness();
		const bbo = key("bbo", { coin: "BTC" });
		store.getState().acquireSubscription(bbo, createFakeSubscription().subscribe);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		store.getState().setSubscriptionData(bbo, { coin: "BTC", bbo: [{ px: "1" }, { px: "2" }] });

		setNetwork(false);
		expect(store.getState().subscriptions[bbo]?.isStale).toBe(true);
		setNetwork(true);
		store.getState().releaseSubscription(bbo);
	});
});

describe("a refreshKey change while another key of the same stream is held", () => {
	beforeEach(async () => {
		vi.resetModules();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
		createHyperliquidStore = (await import("@sairn/hl-react/store")).createHyperliquidStore;
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("starts the new key from the held key's last frame and receipt times instead of loading", async () => {
		const { store } = createHarness();
		const params = { user: "0xabc" };
		const held = key("allDexsClearinghouseState", params);
		const refreshed = key("allDexsClearinghouseState", params, "unifiedAccount");
		const snapshot = { user: "0xabc", clearinghouseStates: [] };

		store.getState().acquireSubscription(held, createFakeSubscription().subscribe);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		store.getState().setSubscriptionData(held, snapshot, 1_000, 50);

		store.getState().acquireSubscription(refreshed, createFakeSubscription().subscribe);
		expect(store.getState().subscriptions[refreshed]).toMatchObject({
			status: "subscribing",
			data: snapshot,
			lastMessageAt: 1_000,
			monotonicLastMessageAt: 50,
		});
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		expect(store.getState().subscriptions[refreshed]).toMatchObject({ status: "active", data: snapshot });

		store.getState().releaseSubscription(refreshed);
		store.getState().releaseSubscription(held);
	});

	it("keeps the held key's staleness, so an old frame is never presented as fresh", async () => {
		vi.useFakeTimers({ now: 100_000 });
		const { store } = createHarness();
		const params = { user: "0xabc" };
		const held = key("webData3", params);
		const refreshed = key("webData3", params, "ledger-1");

		store.getState().acquireSubscription(held, createFakeSubscription().subscribe);
		await vi.advanceTimersByTimeAsync(0);
		store.getState().setSubscriptionData(held, { user: "0xabc" });
		await vi.advanceTimersByTimeAsync(65_000);
		expect(store.getState().subscriptions[held]?.isStale).toBe(true);

		store.getState().acquireSubscription(refreshed, createFakeSubscription().subscribe);
		expect(store.getState().subscriptions[refreshed]?.isStale).toBe(true);

		store.getState().releaseSubscription(refreshed);
		store.getState().releaseSubscription(held);
	});

	it("never takes a frame of another user or of a stream that is not a complete state", async () => {
		const { store } = createHarness();
		const otherUser = key("allDexsClearinghouseState", { user: "0xdef" });
		const fills = key("userFills", { user: "0xabc" });
		store.getState().acquireSubscription(otherUser, createFakeSubscription().subscribe);
		store.getState().acquireSubscription(fills, createFakeSubscription().subscribe);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		store.getState().setSubscriptionData(otherUser, { user: "0xdef" });
		store.getState().setSubscriptionData(fills, { fills: [] });

		const ownState = key("allDexsClearinghouseState", { user: "0xabc" }, "unifiedAccount");
		const ownFills = key("userFills", { user: "0xabc" }, "retry");
		store.getState().acquireSubscription(ownState, createFakeSubscription().subscribe);
		store.getState().acquireSubscription(ownFills, createFakeSubscription().subscribe);
		expect(store.getState().subscriptions[ownState]).toEqual({ status: "subscribing" });
		expect(store.getState().subscriptions[ownFills]).toEqual({ status: "subscribing" });

		for (const subscriptionKey of [ownState, ownFills, otherUser, fills]) {
			store.getState().releaseSubscription(subscriptionKey);
		}
	});

	it("leaves the new key loading when the held key was released first, since the server then sends a snapshot", async () => {
		const { store } = createHarness();
		const params = { user: "0xabc" };
		const held = key("spotState", params);
		const refreshed = key("spotState", params, "ledger-1");
		store.getState().acquireSubscription(held, createFakeSubscription().subscribe);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		store.getState().setSubscriptionData(held, { user: "0xabc" });

		store.getState().releaseSubscription(held);
		store.getState().acquireSubscription(refreshed, createFakeSubscription().subscribe);
		expect(store.getState().subscriptions[refreshed]).toEqual({ status: "subscribing" });
		store.getState().releaseSubscription(refreshed);
	});
});
