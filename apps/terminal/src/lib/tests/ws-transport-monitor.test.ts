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
