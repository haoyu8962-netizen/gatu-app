import { getSdkReconnectionDelayMs } from "@gatu/hl-react/internal/websocket/reliability";
import { describe, expect, it, vi } from "vitest";

describe("SDK reconnect backoff constant", () => {
	it("doubles up to a 30s cap", () => {
		expect(getSdkReconnectionDelayMs(0)).toBe(500);
		expect(getSdkReconnectionDelayMs(1)).toBe(1_000);
		expect(getSdkReconnectionDelayMs(2)).toBe(2_000);
		expect(getSdkReconnectionDelayMs(3)).toBe(4_000);
		expect(getSdkReconnectionDelayMs(4)).toBe(8_000);
		expect(getSdkReconnectionDelayMs(5)).toBe(16_000);
		expect(getSdkReconnectionDelayMs(6)).toBe(30_000);
		expect(getSdkReconnectionDelayMs(7)).toBe(30_000);
		expect(getSdkReconnectionDelayMs(100)).toBe(30_000);
	});
});

describe("createWsReconnectTrigger SDK coupling", () => {
	// Regression guard: if @nktkas/hyperliquid ever hides or renames
	// WebSocketTransport.socket, the guard in clients.ts silently returns a
	// no-op. Observable-behavior check: construct a real transport, spy on the
	// underlying socket's reconnect method, invoke the trigger, and assert it
	// was called. Surfaces any SDK breakage in tests rather than silently in
	// production.
	it("invokes socket.reconnect() against a real WebSocketTransport", async () => {
		const { createWsReconnectTrigger, getWsTransport } = await import("@gatu/hl-react/clients");

		// Retrieve the module-cached transport the trigger will target.
		const transport = getWsTransport(true);
		expect(transport.constructor.name).toBe("WebSocketTransport");
		const socket = (
			transport as unknown as {
				socket: { reconnect: () => void };
			}
		).socket;
		expect(typeof socket?.reconnect).toBe("function");
		const spy = vi.spyOn(socket, "reconnect").mockImplementation(() => {});

		try {
			const trigger = createWsReconnectTrigger(true);
			trigger();
			expect(spy).toHaveBeenCalledTimes(1);
			expect(spy).toHaveBeenCalledWith();
		} finally {
			spy.mockRestore();
		}
	});
});

describe("store reconnect with fake subscriptions", () => {
	it("store acquires and releases subscriptions correctly", async () => {
		const { createHyperliquidStore } = await import("@gatu/hl-react/store");
		const store = createHyperliquidStore({ ssr: false });

		store.getState().acquireSubscription("test:key", async () => ({
			unsubscribe: async () => {},
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
		const { createHyperliquidStore } = await import("@gatu/hl-react/store");
		const store = createHyperliquidStore({ ssr: false });

		let reportError: ((error: unknown) => void) | undefined;
		const unsubscribe = vi.fn().mockResolvedValue(undefined);
		store.getState().acquireSubscription("test:reconnect", async (failureOptions) => {
			reportError = failureOptions?.onError;
			return { unsubscribe };
		});

		await new Promise<void>((r) => setTimeout(r, 0));
		expect(store.getState().subscriptions["test:reconnect"].status).toBe("active");

		reportError?.(new Error("Connection lost"));
		await new Promise<void>((r) => setTimeout(r, 0));

		expect(store.getState().subscriptions["test:reconnect"].status).toBe("error");
		expect(unsubscribe).not.toHaveBeenCalled();

		store.getState().releaseSubscription("test:reconnect");
	});

	it("recovers after repeated failures: cycles through errors then lands active", async () => {
		const { createHyperliquidStore } = await import("@gatu/hl-react/store");
		const store = createHyperliquidStore({ ssr: false });

		const key = "test:retry-then-success";
		let attempt = 0;

		const subscribe = async (failureOptions?: { onError?: (error: unknown) => void }) => {
			attempt += 1;
			if (attempt <= 2) {
				const err = new Error(`attempt ${attempt} failed`);
				// Report the failure on next tick so the store transitions
				// active -> error -> schedules reconnect, just like a real
				// post-open disconnect.
				setTimeout(() => failureOptions?.onError?.(err), 0);
			}
			return { unsubscribe: async () => {} };
		};

		store.getState().acquireSubscription(key, subscribe);

		// Let the store work through: active -> error -> reconnect -> error -> reconnect -> active.
		// Poll the status rather than over-specifying wait durations.
		const deadline = Date.now() + 5_000;
		while (Date.now() < deadline) {
			if (store.getState().subscriptions[key]?.status === "active" && attempt >= 3) break;
			await new Promise<void>((r) => setTimeout(r, 50));
		}

		expect(attempt).toBeGreaterThanOrEqual(3);
		expect(store.getState().subscriptions[key]?.status).toBe("active");

		store.getState().releaseSubscription(key);
	});
});
