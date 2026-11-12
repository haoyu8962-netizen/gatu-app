import {
	createWsTransportMonitor,
	probeLiveness,
	type WsTransportMonitorOptions,
} from "@sairn/hl-react/internal/websocket/transport-monitor";
import { afterEach, describe, expect, it, vi } from "vitest";

class FakeSocket extends EventTarget {
	readyState: number;
	reconnect = vi.fn(() => {
		this.readyState = 2;
		this.dispatchEvent(new Event("close"));
	});
	send = vi.fn();

	constructor(readyState = 1) {
		super();
		this.readyState = readyState;
	}

	open() {
		this.readyState = 1;
		this.dispatchEvent(new Event("open"));
	}

	message(data = "{}") {
		this.dispatchEvent(new MessageEvent("message", { data }));
	}

	pong() {
		this.message('{"channel":"pong"}');
	}
}

const noStateChanges = () => () => {};

type VisibilityListener = (state: "visible" | "hidden") => void;
type NetworkListener = (state: "online" | "offline") => void;

function createPageState() {
	let visibilityListener: VisibilityListener | undefined;
	let networkListener: NetworkListener | undefined;
	const options: Partial<WsTransportMonitorOptions> = {
		subscribeVisibility: (listener) => {
			visibilityListener = listener;
			return () => {
				visibilityListener = undefined;
			};
		},
		subscribeNetworkStatus: (listener) => {
			networkListener = listener;
			return () => {
				networkListener = undefined;
			};
		},
	};
	return {
		options,
		setVisibility: (state: "visible" | "hidden") => visibilityListener?.(state),
		setNetwork: (state: "online" | "offline") => networkListener?.(state),
	};
}

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

	it("keeps an open socket that answers the resume heartbeat", async () => {
		vi.useFakeTimers({ now: 0 });
		const page = createPageState();
		const socket = new FakeSocket();
		const monitor = createMonitor(socket, {
			inactivityThresholdMs: 1_000,
			checkIntervalMs: 100,
			resumeProbeTimeoutMs: 300,
			...page.options,
		});
		const unsubscribe = monitor.subscribeReconnect(vi.fn());

		page.setVisibility("hidden");
		await vi.advanceTimersByTimeAsync(500);
		page.setVisibility("visible");

		expect(socket.send).toHaveBeenCalledExactlyOnceWith('{"method":"ping"}');
		expect(socket.reconnect).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(200);
		socket.pong();
		await vi.advanceTimersByTimeAsync(600);

		expect(socket.reconnect).not.toHaveBeenCalled();
		unsubscribe();
	});

	it("does not take frames buffered while the page was suspended as the heartbeat answer", async () => {
		vi.useFakeTimers({ now: 0 });
		const page = createPageState();
		const socket = new FakeSocket();
		const monitor = createMonitor(socket, {
			inactivityThresholdMs: 10_000,
			checkIntervalMs: 60_000,
			resumeProbeTimeoutMs: 300,
			...page.options,
		});
		const unsubscribe = monitor.subscribeReconnect(vi.fn());

		page.setVisibility("hidden");
		await vi.advanceTimersByTimeAsync(500);
		page.setVisibility("visible");
		socket.message('{"channel":"allMids","data":{"mids":{}}}');
		socket.message('{"channel":"subscriptionResponse","data":{"method":"subscribe"}}');
		await vi.advanceTimersByTimeAsync(299);
		expect(socket.reconnect).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(socket.reconnect).toHaveBeenCalledExactlyOnceWith();
		unsubscribe();
	});

	it("sends one heartbeat to a socket that stays quiet past the probe threshold and keeps it when it answers", async () => {
		vi.useFakeTimers({ now: 0 });
		const socket = new FakeSocket();
		const monitor = createMonitor(socket, {
			quietProbeThresholdMs: 1_000,
			inactivityThresholdMs: 60_000,
			checkIntervalMs: 100,
			resumeProbeTimeoutMs: 300,
		});
		const unsubscribe = monitor.subscribeReconnect(vi.fn());

		await vi.advanceTimersByTimeAsync(900);
		expect(socket.send).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(100);
		expect(socket.send).toHaveBeenCalledExactlyOnceWith('{"method":"ping"}');
		await vi.advanceTimersByTimeAsync(200);
		expect(socket.send).toHaveBeenCalledOnce();

		socket.pong();
		await vi.advanceTimersByTimeAsync(900);
		expect(socket.send).toHaveBeenCalledOnce();
		expect(socket.reconnect).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(100);
		expect(socket.send).toHaveBeenCalledTimes(2);
		unsubscribe();
	});

	it("replaces a quiet socket that does not answer the heartbeat, even while other frames arrive", async () => {
		vi.useFakeTimers({ now: 0 });
		const socket = new FakeSocket();
		const monitor = createMonitor(socket, {
			quietProbeThresholdMs: 1_000,
			inactivityThresholdMs: 60_000,
			checkIntervalMs: 100,
			resumeProbeTimeoutMs: 300,
			quietProbeTimeoutMs: 700,
		});
		const disconnect = vi.fn();
		const unsubscribe = monitor.subscribeDisconnect(disconnect);

		await vi.advanceTimersByTimeAsync(1_000);
		expect(socket.send).toHaveBeenCalledOnce();
		socket.message();
		socket.message('{"channel":"error","data":"pong"}');
		await vi.advanceTimersByTimeAsync(699);
		expect(socket.reconnect).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(socket.reconnect).toHaveBeenCalledExactlyOnceWith();
		expect(disconnect).toHaveBeenCalledOnce();
		unsubscribe();
	});

	it("keeps the resume heartbeat's shorter answer time while quiet probes get the wider one", async () => {
		vi.useFakeTimers({ now: 0 });
		const page = createPageState();
		const socket = new FakeSocket();
		const monitor = createMonitor(socket, {
			quietProbeThresholdMs: 60_000,
			inactivityThresholdMs: 120_000,
			checkIntervalMs: 60_000,
			resumeProbeTimeoutMs: 300,
			quietProbeTimeoutMs: 5_000,
			...page.options,
		});
		const unsubscribe = monitor.subscribeReconnect(vi.fn());

		page.setVisibility("hidden");
		page.setVisibility("visible");
		await vi.advanceTimersByTimeAsync(300);

		expect(socket.reconnect).toHaveBeenCalledOnce();
		unsubscribe();
	});

	it("settles a probe once and stops listening when it ends", async () => {
		vi.useFakeTimers({ now: 0 });
		const socket = new FakeSocket();
		const remove = vi.spyOn(socket, "removeEventListener");
		const onSettle = vi.fn();

		probeLiveness(socket, 300, onSettle);
		socket.pong();
		socket.pong();
		expect(onSettle).toHaveBeenCalledExactlyOnceWith(true);
		expect(remove).toHaveBeenCalledWith("message", expect.any(Function));

		const timedOut = vi.fn();
		probeLiveness(socket, 300, timedOut);
		await vi.advanceTimersByTimeAsync(300);
		socket.pong();
		expect(timedOut).toHaveBeenCalledExactlyOnceWith(false);
		expect(remove).toHaveBeenCalledTimes(2);
	});

	it("does not take an error frame that mentions pong as the heartbeat answer", () => {
		vi.useFakeTimers({ now: 0 });
		const socket = new FakeSocket();
		const onSettle = vi.fn();

		probeLiveness(socket, 300, onSettle);
		socket.message('{"channel":"error","data":"pong"}');
		socket.message('{"channel": "pong"}');

		expect(onSettle).toHaveBeenCalledExactlyOnceWith(true);
	});

	it("does not probe a quiet socket while the page is hidden or offline", async () => {
		vi.useFakeTimers({ now: 0 });
		const page = createPageState();
		const socket = new FakeSocket();
		const monitor = createMonitor(socket, {
			quietProbeThresholdMs: 1_000,
			inactivityThresholdMs: 60_000,
			checkIntervalMs: 100,
			...page.options,
		});
		const unsubscribe = monitor.subscribeReconnect(vi.fn());

		page.setVisibility("hidden");
		await vi.advanceTimersByTimeAsync(5_000);
		page.setNetwork("offline");
		page.setVisibility("visible");
		await vi.advanceTimersByTimeAsync(5_000);

		expect(socket.send).not.toHaveBeenCalled();
		unsubscribe();
	});

	it("probes on the default schedule fifteen seconds into a silence, as the official terminal checks", async () => {
		vi.useFakeTimers({ now: 0 });
		const socket = new FakeSocket();
		const monitor = createMonitor(socket);
		const unsubscribe = monitor.subscribeReconnect(vi.fn());

		await vi.advanceTimersByTimeAsync(14_999);
		expect(socket.send).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(5_001);
		expect(socket.send).toHaveBeenCalledExactlyOnceWith('{"method":"ping"}');
		unsubscribe();
	});

	it("replaces an open socket that stays silent after the resume heartbeat", async () => {
		vi.useFakeTimers({ now: 0 });
		const page = createPageState();
		const socket = new FakeSocket();
		const monitor = createMonitor(socket, {
			inactivityThresholdMs: 10_000,
			checkIntervalMs: 5_000,
			resumeProbeTimeoutMs: 300,
			...page.options,
		});
		const disconnect = vi.fn();
		const unsubscribe = monitor.subscribeDisconnect(disconnect);

		page.setVisibility("hidden");
		await vi.advanceTimersByTimeAsync(500);
		page.setVisibility("visible");
		await vi.advanceTimersByTimeAsync(299);
		expect(socket.reconnect).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(socket.reconnect).toHaveBeenCalledExactlyOnceWith();
		expect(disconnect).toHaveBeenCalledOnce();
		unsubscribe();
	});

	it("replaces a socket that went silent while hidden as soon as the page returns", async () => {
		vi.useFakeTimers({ now: 0 });
		const page = createPageState();
		const socket = new FakeSocket();
		const monitor = createMonitor(socket, {
			inactivityThresholdMs: 1_000,
			checkIntervalMs: 60_000,
			resumeProbeTimeoutMs: 300,
			...page.options,
		});
		const unsubscribe = monitor.subscribeReconnect(vi.fn());

		page.setVisibility("hidden");
		await vi.advanceTimersByTimeAsync(1_500);
		expect(socket.reconnect).not.toHaveBeenCalled();

		page.setVisibility("visible");

		expect(socket.reconnect).toHaveBeenCalledExactlyOnceWith();
		expect(socket.send).not.toHaveBeenCalled();
		unsubscribe();
	});

	it("skips the reconnection backoff of a socket that is not open when the page returns", () => {
		const page = createPageState();
		const socket = new FakeSocket();
		socket.reconnect.mockImplementation(() => {});
		const monitor = createMonitor(socket, page.options);
		const disconnect = vi.fn();
		const unsubscribe = monitor.subscribeDisconnect(disconnect);

		socket.readyState = 0;
		socket.dispatchEvent(new Event("close"));
		expect(disconnect).toHaveBeenCalledOnce();

		page.setVisibility("hidden");
		page.setVisibility("visible");

		expect(socket.reconnect).toHaveBeenCalledExactlyOnceWith();
		expect(socket.send).not.toHaveBeenCalled();
		expect(disconnect).toHaveBeenCalledOnce();
		unsubscribe();
	});

	it("treats a monitor attached in a hidden page as returning when the page first becomes visible", () => {
		const page = createPageState();
		const socket = new FakeSocket();
		const monitor = createMonitor(socket, { ...page.options, getVisibilityState: () => "hidden" });
		const unsubscribe = monitor.subscribeReconnect(vi.fn());

		page.setVisibility("visible");

		expect(socket.send).toHaveBeenCalledExactlyOnceWith('{"method":"ping"}');
		unsubscribe();
	});

	it("leaves the socket alone when the page becomes visible without having been hidden", () => {
		const page = createPageState();
		const socket = new FakeSocket();
		const monitor = createMonitor(socket, page.options);
		const unsubscribe = monitor.subscribeReconnect(vi.fn());

		page.setVisibility("visible");

		expect(socket.send).not.toHaveBeenCalled();
		expect(socket.reconnect).not.toHaveBeenCalled();
		unsubscribe();
	});

	it("waits for the network instead of probing when the page returns offline", async () => {
		vi.useFakeTimers({ now: 0 });
		const page = createPageState();
		const socket = new FakeSocket();
		const monitor = createMonitor(socket, {
			inactivityThresholdMs: 1_000,
			checkIntervalMs: 100,
			resumeProbeTimeoutMs: 300,
			...page.options,
		});
		const unsubscribe = monitor.subscribeReconnect(vi.fn());

		page.setVisibility("hidden");
		page.setNetwork("offline");
		await vi.advanceTimersByTimeAsync(5_000);
		page.setVisibility("visible");
		await vi.advanceTimersByTimeAsync(5_000);

		expect(socket.send).not.toHaveBeenCalled();
		expect(socket.reconnect).not.toHaveBeenCalled();

		page.setNetwork("online");
		expect(socket.reconnect).toHaveBeenCalledExactlyOnceWith();
		unsubscribe();
	});

	it.each([
		["the page is hidden again", (page: ReturnType<typeof createPageState>) => page.setVisibility("hidden")],
		["the network drops", (page: ReturnType<typeof createPageState>) => page.setNetwork("offline")],
	])("abandons the resume heartbeat when %s", async (_name, interrupt) => {
		vi.useFakeTimers({ now: 0 });
		const page = createPageState();
		const socket = new FakeSocket();
		const monitor = createMonitor(socket, {
			inactivityThresholdMs: 60_000,
			checkIntervalMs: 60_000,
			resumeProbeTimeoutMs: 300,
			...page.options,
		});
		const unsubscribe = monitor.subscribeReconnect(vi.fn());

		page.setVisibility("hidden");
		page.setVisibility("visible");
		expect(socket.send).toHaveBeenCalledOnce();
		interrupt(page);
		await vi.advanceTimersByTimeAsync(1_000);

		expect(socket.reconnect).not.toHaveBeenCalled();
		unsubscribe();
	});

	it("does not replace a socket that closed on its own during the resume heartbeat", async () => {
		vi.useFakeTimers({ now: 0 });
		const page = createPageState();
		const socket = new FakeSocket();
		const monitor = createMonitor(socket, {
			inactivityThresholdMs: 60_000,
			checkIntervalMs: 60_000,
			resumeProbeTimeoutMs: 300,
			...page.options,
		});
		const unsubscribe = monitor.subscribeReconnect(vi.fn());

		page.setVisibility("hidden");
		page.setVisibility("visible");
		socket.readyState = 0;
		socket.dispatchEvent(new Event("close"));
		socket.open();
		await vi.advanceTimersByTimeAsync(1_000);

		expect(socket.reconnect).not.toHaveBeenCalled();
		unsubscribe();
	});

	it("still replaces a silent socket when the heartbeat cannot be sent", async () => {
		vi.useFakeTimers({ now: 0 });
		const page = createPageState();
		const socket = new FakeSocket();
		socket.send.mockImplementation(() => {
			throw new Error("send failed");
		});
		const monitor = createMonitor(socket, {
			inactivityThresholdMs: 60_000,
			checkIntervalMs: 60_000,
			resumeProbeTimeoutMs: 300,
			...page.options,
		});
		const unsubscribe = monitor.subscribeReconnect(vi.fn());

		page.setVisibility("hidden");
		expect(() => page.setVisibility("visible")).not.toThrow();
		await vi.advanceTimersByTimeAsync(300);

		expect(socket.reconnect).toHaveBeenCalledExactlyOnceWith();
		unsubscribe();
	});
});
