import {
	createWsTransportMonitor,
	type WsTransportMonitorOptions,
} from "@gatu/hl-react/internal/websocket/transport-monitor";
import { afterEach, describe, expect, it, vi } from "vitest";

class FakeSocket extends EventTarget {
	readyState: number;
	reconnect = vi.fn(() => {
		this.readyState = 2;
		this.dispatchEvent(new Event("close"));
	});

	constructor(readyState = 1) {
		super();
		this.readyState = readyState;
	}

	open() {
		this.readyState = 1;
		this.dispatchEvent(new Event("open"));
	}

	message() {
		this.dispatchEvent(new MessageEvent("message", { data: "{}" }));
	}
}

const noStateChanges = () => () => {};

function createMonitor(socket: FakeSocket, overrides: Partial<WsTransportMonitorOptions> = {}) {
	return createWsTransportMonitor(socket, {
		getVisibilityState: () => "visible",
		getNetworkState: () => "online",
		subscribeVisibility: noStateChanges,
		subscribeNetworkStatus: noStateChanges,
		...overrides,
	});
}

describe("WebSocket transport monitor", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("notifies once after a connected socket closes and reopens", () => {
		const socket = new FakeSocket();
		const monitor = createMonitor(socket);
		const listener = vi.fn();
		const unsubscribe = monitor.subscribeReconnect(listener);

		socket.dispatchEvent(new Event("close"));
		socket.open();

		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalledWith(1);
		unsubscribe();
	});

	it("notifies disconnect immediately and deduplicates close plus error until the socket reopens", () => {
		const socket = new FakeSocket();
		const monitor = createMonitor(socket);
		const disconnect = vi.fn();
		const unsubscribe = monitor.subscribeDisconnect(disconnect);

		socket.dispatchEvent(new Event("close"));
		socket.dispatchEvent(new Event("error"));
		expect(disconnect).toHaveBeenCalledOnce();

		socket.open();
		socket.dispatchEvent(new Event("error"));
		expect(disconnect).toHaveBeenCalledTimes(2);
		unsubscribe();
	});

	it("notifies disconnect for an explicit reconnect even when the socket emits no close event", () => {
		const socket = new FakeSocket();
		socket.reconnect.mockImplementation(() => {
			socket.readyState = 2;
		});
		const monitor = createMonitor(socket);
		const disconnect = vi.fn();
		const unsubscribe = monitor.subscribeDisconnect(disconnect);

		monitor.requestReconnect();

		expect(socket.reconnect).toHaveBeenCalledOnce();
		expect(disconnect).toHaveBeenCalledOnce();
		unsubscribe();
	});

	it("isolates disconnect listener failures without rolling back a successful reconnect request", () => {
		const socket = new FakeSocket();
		socket.reconnect.mockImplementation(() => {});
		const monitor = createMonitor(socket);
		const throwingListener = vi.fn(() => {
			throw new Error("listener failed");
		});
		const laterListener = vi.fn();
		const unsubscribeThrowing = monitor.subscribeDisconnect(throwingListener);
		const unsubscribeLater = monitor.subscribeDisconnect(laterListener);

		expect(() => monitor.requestReconnect()).not.toThrow();
		monitor.requestReconnect();

		expect(socket.reconnect).toHaveBeenCalledOnce();
		expect(throwingListener).toHaveBeenCalledOnce();
		expect(laterListener).toHaveBeenCalledOnce();

		socket.open();
		monitor.requestReconnect();
		expect(socket.reconnect).toHaveBeenCalledTimes(2);
		expect(laterListener).toHaveBeenCalledTimes(2);

		unsubscribeThrowing();
		unsubscribeLater();
	});

	it("isolates reconnect listener failures so later listeners still observe the generation", () => {
		const socket = new FakeSocket();
		const monitor = createMonitor(socket);
		const throwingListener = vi.fn(() => {
			throw new Error("listener failed");
		});
		const laterListener = vi.fn();
		const unsubscribeThrowing = monitor.subscribeReconnect(throwingListener);
		const unsubscribeLater = monitor.subscribeReconnect(laterListener);

		socket.dispatchEvent(new Event("close"));
		expect(() => socket.open()).not.toThrow();

		expect(throwingListener).toHaveBeenCalledWith(1);
		expect(laterListener).toHaveBeenCalledWith(1);

		unsubscribeThrowing();
		unsubscribeLater();
	});

	it("does not treat the first successful connection as a reconnect", () => {
		const socket = new FakeSocket(0);
		const monitor = createMonitor(socket);
		const listener = vi.fn();
		const unsubscribe = monitor.subscribeReconnect(listener);

		socket.open();

		expect(listener).not.toHaveBeenCalled();
		unsubscribe();
	});

	it("forces one reconnect after all inbound messages go silent", async () => {
		vi.useFakeTimers({ now: 0 });
		const socket = new FakeSocket();
		const monitor = createMonitor(socket, {
			inactivityThresholdMs: 1_000,
			checkIntervalMs: 100,
		});
		const listener = vi.fn();
		const unsubscribe = monitor.subscribeReconnect(listener);

		await vi.advanceTimersByTimeAsync(900);
		expect(socket.reconnect).not.toHaveBeenCalled();

		socket.message();
		await vi.advanceTimersByTimeAsync(900);
		expect(socket.reconnect).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(100);
		expect(socket.reconnect).toHaveBeenCalledTimes(1);
		expect(socket.reconnect).toHaveBeenCalledWith();

		await vi.advanceTimersByTimeAsync(2_000);
		expect(socket.reconnect).toHaveBeenCalledTimes(1);

		socket.open();
		expect(listener).toHaveBeenCalledWith(1);
		unsubscribe();
	});

	it("reconnects a silent socket on its usual schedule after the system clock is set back", async () => {
		vi.useFakeTimers({ now: new Date("2026-09-28T00:00:00Z") });
		const socket = new FakeSocket();
		const monitor = createMonitor(socket, { inactivityThresholdMs: 1_000, checkIntervalMs: 100 });
		const unsubscribe = monitor.subscribeReconnect(vi.fn());

		socket.message();
		vi.setSystemTime(Date.now() - 60 * 60_000);
		await vi.advanceTimersByTimeAsync(900);
		expect(socket.reconnect).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(100);
		expect(socket.reconnect).toHaveBeenCalledTimes(1);
		unsubscribe();
	});

	it("keeps a socket that still receives messages connected after the system clock is set back", async () => {
		vi.useFakeTimers({ now: new Date("2026-09-28T00:00:00Z") });
		const socket = new FakeSocket();
		const monitor = createMonitor(socket, { inactivityThresholdMs: 1_000, checkIntervalMs: 100 });
		const unsubscribe = monitor.subscribeReconnect(vi.fn());

		socket.message();
		vi.setSystemTime(Date.now() - 60 * 60_000);
		for (let tick = 0; tick < 10; tick += 1) {
			await vi.advanceTimersByTimeAsync(500);
			socket.message();
		}

		expect(socket.reconnect).not.toHaveBeenCalled();
		unsubscribe();
	});

	it("still reconnects on the next check after the system clock jumps forward", async () => {
		vi.useFakeTimers({ now: new Date("2026-09-28T00:00:00Z") });
		const socket = new FakeSocket();
		const monitor = createMonitor(socket, { inactivityThresholdMs: 1_000, checkIntervalMs: 100 });
		const unsubscribe = monitor.subscribeReconnect(vi.fn());

		socket.message();
		vi.setSystemTime(Date.now() + 60 * 60_000);
		await vi.advanceTimersByTimeAsync(100);

		expect(socket.reconnect).toHaveBeenCalledTimes(1);
		unsubscribe();
	});

	it("keeps a healthy open socket connected after a foreground resume", () => {
		let visibilityListener: ((state: "visible" | "hidden") => void) | undefined;
		const socket = new FakeSocket();
		const monitor = createMonitor(socket, {
			subscribeVisibility: (listener: (state: "visible" | "hidden") => void) => {
				visibilityListener = listener;
				return () => {
					visibilityListener = undefined;
				};
			},
		});
		const unsubscribe = monitor.subscribeReconnect(vi.fn());

		visibilityListener?.("hidden");
		visibilityListener?.("visible");

		expect(socket.reconnect).not.toHaveBeenCalled();
		unsubscribe();
	});

	it("reconnects on the next inactivity check when messages stopped while hidden", async () => {
		vi.useFakeTimers({ now: 0 });
		let visibilityListener: ((state: "visible" | "hidden") => void) | undefined;
		const socket = new FakeSocket();
		const monitor = createMonitor(socket, {
			inactivityThresholdMs: 1_000,
			checkIntervalMs: 100,
			subscribeVisibility: (listener: (state: "visible" | "hidden") => void) => {
				visibilityListener = listener;
				return () => {
					visibilityListener = undefined;
				};
			},
		});
		const unsubscribe = monitor.subscribeReconnect(vi.fn());

		visibilityListener?.("hidden");
		await vi.advanceTimersByTimeAsync(1_500);
		expect(socket.reconnect).not.toHaveBeenCalled();

		visibilityListener?.("visible");
		expect(socket.reconnect).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(100);
		expect(socket.reconnect).toHaveBeenCalledTimes(1);
		expect(socket.reconnect).toHaveBeenCalledWith();
		unsubscribe();
	});
});
