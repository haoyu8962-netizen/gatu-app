// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let subscribeNetworkStatus: typeof import("@hypeterminal/hl-react/internal/websocket/network-status").subscribeNetworkStatus;
let getNetworkState: typeof import("@hypeterminal/hl-react/internal/websocket/network-status").getNetworkState;

describe("network-status singleton", () => {
	beforeEach(async () => {
		vi.resetModules();
		Object.defineProperty(navigator, "onLine", { value: true, configurable: true, writable: true });
		const mod = await import("@hypeterminal/hl-react/internal/websocket/network-status");
		subscribeNetworkStatus = mod.subscribeNetworkStatus;
		getNetworkState = mod.getNetworkState;
	});

	afterEach(() => {
		Object.defineProperty(navigator, "onLine", { value: true, configurable: true, writable: true });
	});

	it("returns online as initial state", () => {
		expect(getNetworkState()).toBe("online");
	});

	it("emits offline on offline event", () => {
		const listener = vi.fn();
		const unsub = subscribeNetworkStatus(listener);

		window.dispatchEvent(new Event("offline"));

		expect(listener).toHaveBeenCalledWith("offline");
		expect(getNetworkState()).toBe("offline");

		unsub();
	});

	it("emits online on online event after being offline", () => {
		const listener = vi.fn();
		const unsub = subscribeNetworkStatus(listener);

		window.dispatchEvent(new Event("offline"));
		listener.mockClear();

		window.dispatchEvent(new Event("online"));

		expect(listener).toHaveBeenCalledWith("online");
		expect(getNetworkState()).toBe("online");

		unsub();
	});

	it("does not emit duplicate offline events", () => {
		const listener = vi.fn();
		const unsub = subscribeNetworkStatus(listener);

		window.dispatchEvent(new Event("offline"));
		window.dispatchEvent(new Event("offline"));

		expect(listener).toHaveBeenCalledTimes(1);

		unsub();
	});

	it("multiple subscribers share one listener set", () => {
		const listener1 = vi.fn();
		const listener2 = vi.fn();
		const unsub1 = subscribeNetworkStatus(listener1);
		const unsub2 = subscribeNetworkStatus(listener2);

		window.dispatchEvent(new Event("offline"));

		expect(listener1).toHaveBeenCalledWith("offline");
		expect(listener2).toHaveBeenCalledWith("offline");

		unsub1();
		unsub2();
	});

	it("cleans up DOM listeners when last subscriber unsubscribes", () => {
		const removeSpy = vi.spyOn(window, "removeEventListener");
		const listener = vi.fn();
		const unsub = subscribeNetworkStatus(listener);

		unsub();

		expect(removeSpy).toHaveBeenCalledWith("online", expect.any(Function));
		expect(removeSpy).toHaveBeenCalledWith("offline", expect.any(Function));
		removeSpy.mockRestore();
	});

	it("SSR no-op: returns online and unsubscribe is safe when document is undefined", async () => {
		vi.resetModules();
		const originalDocument = globalThis.document;
		Object.defineProperty(globalThis, "document", { value: undefined, configurable: true });

		const mod = await import("@hypeterminal/hl-react/internal/websocket/network-status");
		expect(mod.getNetworkState()).toBe("online");

		const unsub = mod.subscribeNetworkStatus(vi.fn());
		unsub();

		Object.defineProperty(globalThis, "document", { value: originalDocument, configurable: true });
	});
});
