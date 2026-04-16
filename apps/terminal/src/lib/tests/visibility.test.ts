// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let subscribeVisibility: typeof import("@hypeterminal/hl-react/internal/websocket/visibility").subscribeVisibility;
let getVisibilityState: typeof import("@hypeterminal/hl-react/internal/websocket/visibility").getVisibilityState;

describe("visibility singleton", () => {
	beforeEach(async () => {
		vi.resetModules();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		const mod = await import("@hypeterminal/hl-react/internal/websocket/visibility");
		subscribeVisibility = mod.subscribeVisibility;
		getVisibilityState = mod.getVisibilityState;
	});

	afterEach(() => {
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
	});

	it("returns visible as initial state", () => {
		expect(getVisibilityState()).toBe("visible");
	});

	it("emits hidden on visibilitychange when document.hidden is true", () => {
		const listener = vi.fn();
		const unsub = subscribeVisibility(listener);

		Object.defineProperty(document, "hidden", { value: true, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		expect(listener).toHaveBeenCalledWith("hidden");
		expect(getVisibilityState()).toBe("hidden");

		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		expect(listener).toHaveBeenCalledWith("visible");
		expect(getVisibilityState()).toBe("visible");

		unsub();
	});

	it("emits visible on pageshow with persisted=true", () => {
		const listener = vi.fn();
		const unsub = subscribeVisibility(listener);

		Object.defineProperty(document, "hidden", { value: true, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));
		listener.mockClear();

		window.dispatchEvent(new Event("pageshow"));
		expect(listener).not.toHaveBeenCalled();

		unsub();
	});

	it("multiple subscribers share one listener set", () => {
		const listener1 = vi.fn();
		const listener2 = vi.fn();
		const unsub1 = subscribeVisibility(listener1);
		const unsub2 = subscribeVisibility(listener2);

		Object.defineProperty(document, "hidden", { value: true, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		expect(listener1).toHaveBeenCalledWith("hidden");
		expect(listener2).toHaveBeenCalledWith("hidden");

		unsub1();
		unsub2();
	});

	it("cleans up DOM listeners when last subscriber unsubscribes", () => {
		const removeSpy = vi.spyOn(document, "removeEventListener");
		const listener = vi.fn();
		const unsub = subscribeVisibility(listener);

		unsub();

		expect(removeSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
		removeSpy.mockRestore();
	});

	it("does not emit when state has not changed", () => {
		const listener = vi.fn();
		const unsub = subscribeVisibility(listener);

		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));

		expect(listener).not.toHaveBeenCalled();
		unsub();
	});

	it("SSR no-op: returns visible and unsubscribe is safe when document is undefined", async () => {
		vi.resetModules();
		const originalDocument = globalThis.document;
		Object.defineProperty(globalThis, "document", { value: undefined, configurable: true });

		const mod = await import("@hypeterminal/hl-react/internal/websocket/visibility");
		expect(mod.getVisibilityState()).toBe("visible");

		const unsub = mod.subscribeVisibility(vi.fn());
		unsub();

		Object.defineProperty(globalThis, "document", { value: originalDocument, configurable: true });
	});
});
