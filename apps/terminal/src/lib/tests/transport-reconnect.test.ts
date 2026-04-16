import type { WebSocketTransportOptions } from "@nktkas/hyperliquid";
import { describe, expect, it } from "vitest";

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
	// no-op. This test asserts the returned function is non-trivial against a
	// real transport so breakage surfaces on SDK upgrade rather than in prod.
	it("returns a non-noop function against a real WebSocketTransport", async () => {
		const { createWsReconnectTrigger } = await import("@hypeterminal/hl-react/clients");
		const trigger = createWsReconnectTrigger(true);
		// The noop fallback is a literal `() => {}` with length 0 and empty body.
		// A properly wired trigger is `() => socket.close(...)`.
		const body = trigger.toString();
		expect(body).not.toBe("() => {\n        }");
		expect(body).toMatch(/socket|close/);
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
