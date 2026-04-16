import type { WebSocketTransportOptions } from "@nktkas/hyperliquid";
import { describe, expect, it, vi } from "vitest";

function createTransportWithReconnectOptions(): WebSocketTransportOptions {
	return {
		reconnect: {
			maxRetries: Infinity,
			connectionTimeout: 10_000,
			reconnectionDelay: (n: number) => Math.min(500 * 2 ** n, 30_000),
		},
	};
}

describe("transport reconnect configuration", () => {
	it("passes explicit reconnect options to the SDK transport", () => {
		const options = createTransportWithReconnectOptions();
		const reconnect = options.reconnect;

		expect(reconnect).toBeDefined();
		expect(reconnect?.maxRetries).toBe(Infinity);
		expect(reconnect?.connectionTimeout).toBe(10_000);
		expect(typeof reconnect?.reconnectionDelay).toBe("function");
	});

	it("reconnectionDelay follows exponential backoff capped at 30s", () => {
		const reconnect = createTransportWithReconnectOptions().reconnect;
		const delay = reconnect?.reconnectionDelay as (n: number) => number;

		expect(delay(0)).toBe(500);
		expect(delay(1)).toBe(1_000);
		expect(delay(2)).toBe(2_000);
		expect(delay(3)).toBe(4_000);
		expect(delay(4)).toBe(8_000);
		expect(delay(5)).toBe(16_000);
		expect(delay(6)).toBe(30_000);
		expect(delay(7)).toBe(30_000);
		expect(delay(100)).toBe(30_000);
	});

	it("matches the configuration used in clients.ts getWsOptions", () => {
		const reconnect = createTransportWithReconnectOptions().reconnect;

		expect(reconnect?.maxRetries).toBe(Infinity);
		expect(reconnect?.connectionTimeout).toBe(10_000);

		const delay = reconnect?.reconnectionDelay as (n: number) => number;
		expect(delay(0)).toBe(500);
		expect(delay(6)).toBe(30_000);
	});
});

describe("createWsReconnectTrigger SDK coupling", () => {
	// Regression guard: if @nktkas/hyperliquid ever hides or renames
	// WebSocketTransport.socket, the guard in clients.ts silently returns a
	// no-op. Observable-behavior check: construct a real transport, spy on the
	// underlying socket's close method, invoke the trigger, and assert close
	// was called non-permanently. Surfaces any SDK breakage in tests rather
	// than silently in production.
	it("invokes socket.close(undefined, undefined, false) against a real WebSocketTransport", async () => {
		const { WebSocketTransport } = await import("@nktkas/hyperliquid");
		const { createWsReconnectTrigger, getWsTransport } = await import("@hypeterminal/hl-react/clients");

		// Retrieve the module-cached transport the trigger will target.
		const transport = getWsTransport(true);
		expect(transport).toBeInstanceOf(WebSocketTransport);
		const socket = (transport as WebSocketTransport).socket as {
			close: (code?: number, reason?: string, permanent?: boolean) => void;
		};
		expect(typeof socket?.close).toBe("function");
		const spy = vi.spyOn(socket, "close").mockImplementation(() => {});

		try {
			const trigger = createWsReconnectTrigger(true);
			trigger();
			expect(spy).toHaveBeenCalledTimes(1);
			expect(spy).toHaveBeenCalledWith(undefined, undefined, false);
		} finally {
			spy.mockRestore();
		}
	});
});

describe("store reconnect with fake subscriptions", () => {
	it("store acquires and releases subscriptions correctly", async () => {
		const { createHyperliquidStore } = await import("@hypeterminal/hl-react/store");
		const store = createHyperliquidStore({ ssr: false });

		const failureController = new AbortController();
		store.getState().acquireSubscription("test:key", async () => ({
			unsubscribe: async () => {},
			failureSignal: failureController.signal,
		}));

		await new Promise<void>((r) => setTimeout(r, 0));

		const state = store.getState();
		expect(state.subscriptions["test:key"]).toBeDefined();
		expect(state.subscriptions["test:key"].status).toBe("active");

		store.getState().releaseSubscription("test:key");
		await new Promise<void>((r) => setTimeout(r, 0));

		expect(store.getState().subscriptions["test:key"]).toBeUndefined();
	});

	it("store schedules reconnect on subscription failure", async () => {
		const { createHyperliquidStore } = await import("@hypeterminal/hl-react/store");
		const store = createHyperliquidStore({ ssr: false });

		const failureController = new AbortController();
		store.getState().acquireSubscription("test:reconnect", async () => ({
			unsubscribe: async () => {},
			failureSignal: failureController.signal,
		}));

		await new Promise<void>((r) => setTimeout(r, 0));
		expect(store.getState().subscriptions["test:reconnect"].status).toBe("active");

		failureController.abort(new Error("Connection lost"));
		await new Promise<void>((r) => setTimeout(r, 0));

		expect(store.getState().subscriptions["test:reconnect"].status).toBe("error");

		store.getState().releaseSubscription("test:reconnect");
	});
});
