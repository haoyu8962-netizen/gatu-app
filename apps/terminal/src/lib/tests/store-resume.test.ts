// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let createHyperliquidStore: typeof import("@hypeterminal/hl-react/store").createHyperliquidStore;

describe("store-driven resume via singletons", () => {
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

	it("calls triggerReconnect when visibility goes hidden→visible", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const { subscribe } = createSubscription();

		store.getState().acquireSubscription("test:vis", subscribe);
		await new Promise<void>((r) => setTimeout(r, 0));

		Object.defineProperty(document, "hidden", { value: true, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		expect(triggerReconnect).toHaveBeenCalledTimes(1);

		store.getState().releaseSubscription("test:vis");
	});

	it("calls triggerReconnect when network goes offline→online", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const { subscribe } = createSubscription();

		store.getState().acquireSubscription("test:net", subscribe);
		await new Promise<void>((r) => setTimeout(r, 0));

		window.dispatchEvent(new Event("offline"));
		window.dispatchEvent(new Event("online"));

		expect(triggerReconnect).toHaveBeenCalledTimes(1);

		store.getState().releaseSubscription("test:net");
	});

	it("does not call triggerReconnect on visible without prior hidden", async () => {
		const triggerReconnect = vi.fn();
		const store = createHyperliquidStore({ ssr: false, triggerReconnect });
		const { subscribe } = createSubscription();

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
		const { subscribe } = createSubscription();

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
		const { subscribe } = createSubscription();

		store.getState().acquireSubscription("test:noreconnect", subscribe);
		await new Promise<void>((r) => setTimeout(r, 0));

		Object.defineProperty(document, "hidden", { value: true, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		store.getState().releaseSubscription("test:noreconnect");
	});
});
