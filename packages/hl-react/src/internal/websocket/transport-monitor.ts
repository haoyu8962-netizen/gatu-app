import { type FrameReceipt, receiveFrameNow } from "./frame-receipt";
import { getNetworkState, subscribeNetworkStatus } from "./network-status";
import { WS_RELIABILITY_LIMITS } from "./reliability";
import { getReceiptAgeMs } from "./staleness";
import { getVisibilityState, subscribeVisibility } from "./visibility";

type SocketEventName = "open" | "close" | "error" | "message";
const SOCKET_OPEN = 1;
// Hyperliquid's heartbeat request, the frame the SDK keep-alive sends. The server answers
// `{"channel":"pong"}`, which reaches the monitor as an ordinary message.
const LIVENESS_PROBE_FRAME = '{"method":"ping"}';

export interface MonitoredWebSocket {
	readonly readyState: number;
	addEventListener(type: SocketEventName, listener: EventListener): void;
	removeEventListener(type: SocketEventName, listener: EventListener): void;
	reconnect(): void;
	send(data: string): void;
}

type VisibilityState = "visible" | "hidden";
type NetworkState = "online" | "offline";
type StateSubscriber<T> = (listener: (state: T) => void) => () => void;

export interface WsTransportMonitorOptions {
	inactivityThresholdMs?: number;
	checkIntervalMs?: number;
	resumeProbeTimeoutMs?: number;
	getVisibilityState?: () => VisibilityState;
	getNetworkState?: () => NetworkState;
	subscribeVisibility?: StateSubscriber<VisibilityState>;
	subscribeNetworkStatus?: StateSubscriber<NetworkState>;
}

export interface WsTransportMonitor {
	subscribeReconnect(listener: (generation: number) => void): () => void;
	subscribeDisconnect(listener: () => void): () => void;
	requestReconnect(): void;
}

export function createWsTransportMonitor(
	socket: MonitoredWebSocket,
	options: WsTransportMonitorOptions = {},
): WsTransportMonitor {
	const listeners = new Set<(generation: number) => void>();
	const disconnectListeners = new Set<() => void>();
	const inactivityThresholdMs = options.inactivityThresholdMs ?? WS_RELIABILITY_LIMITS.transport.inactivityThresholdMs;
	const checkIntervalMs = options.checkIntervalMs ?? WS_RELIABILITY_LIMITS.transport.checkIntervalMs;
	const resumeProbeTimeoutMs = options.resumeProbeTimeoutMs ?? WS_RELIABILITY_LIMITS.transport.resumeProbeTimeoutMs;
	const readVisibility = options.getVisibilityState ?? getVisibilityState;
	const readNetwork = options.getNetworkState ?? getNetworkState;
	const watchVisibility = options.subscribeVisibility ?? subscribeVisibility;
	const watchNetwork = options.subscribeNetworkStatus ?? subscribeNetworkStatus;

	let attached = false;
	let hasOpened = false;
	let disconnectedAfterOpen = false;
	let reconnectRequested = false;
	let generation = 0;
	let lastActivity: FrameReceipt = { receivedAt: 0, monotonicReceivedAt: 0 };
	let checkTimer: ReturnType<typeof setInterval> | undefined;
	let resumeProbeTimer: ReturnType<typeof setTimeout> | undefined;
	let detachVisibility: (() => void) | undefined;
	let detachNetwork: (() => void) | undefined;
	let wasHidden = false;
	let wasOffline = false;

	const clearResumeProbe = () => {
		if (resumeProbeTimer === undefined) return;
		clearTimeout(resumeProbeTimer);
		resumeProbeTimer = undefined;
	};

	const requestReconnect = () => {
		if (!attached || reconnectRequested || socket.readyState !== SOCKET_OPEN) return;
		reconnectRequested = true;
		clearResumeProbe();
		try {
			socket.reconnect();
		} catch {
			reconnectRequested = false;
			return;
		}
		markDisconnected();
	};

	const getSilenceMs = () => getReceiptAgeMs(lastActivity.receivedAt, lastActivity.monotonicReceivedAt);

	// A phone suspends the page in the background: timers stop, and the connection may be closed,
	// dead without a close event, or still waiting out a backoff computed from attempts that failed
	// while hidden. The periodic check would notice up to one interval later, and nothing would
	// shorten the backoff, so the page showed no data for that long after it came back.
	const recoverAfterResume = () => {
		if (wasOffline) return;
		if (socket.readyState !== SOCKET_OPEN) {
			// Already in the SDK's reconnection loop: skip the delay it is sleeping out and replace
			// an attempt that was started before the page was suspended.
			try {
				socket.reconnect();
			} catch {}
			return;
		}
		if (getSilenceMs() >= inactivityThresholdMs) {
			requestReconnect();
			return;
		}
		// Silent for less than the inactivity threshold: a live socket answers a heartbeat within a
		// round trip, so a quiet but healthy connection survives the return to the foreground.
		clearResumeProbe();
		try {
			socket.send(LIVENESS_PROBE_FRAME);
		} catch {}
		resumeProbeTimer = setTimeout(() => {
			resumeProbeTimer = undefined;
			requestReconnect();
		}, resumeProbeTimeoutMs);
	};

	const markDisconnected = () => {
		if (!hasOpened || disconnectedAfterOpen) return;
		disconnectedAfterOpen = true;
		for (const listener of [...disconnectListeners]) {
			try {
				listener();
			} catch {}
		}
	};

	const handleOpen: EventListener = () => {
		const shouldNotify = hasOpened && disconnectedAfterOpen;
		hasOpened = true;
		disconnectedAfterOpen = false;
		reconnectRequested = false;
		lastActivity = receiveFrameNow();

		if (!shouldNotify) return;
		generation += 1;
		for (const listener of [...listeners]) {
			try {
				listener(generation);
			} catch {}
		}
	};

	const handleDisconnect: EventListener = () => {
		clearResumeProbe();
		markDisconnected();
	};

	const handleMessage: EventListener = () => {
		clearResumeProbe();
		lastActivity = receiveFrameNow();
	};

	const attach = () => {
		if (attached) return;
		attached = true;
		hasOpened = socket.readyState === SOCKET_OPEN;
		disconnectedAfterOpen = false;
		reconnectRequested = false;
		lastActivity = receiveFrameNow();
		wasHidden = readVisibility() === "hidden";
		wasOffline = readNetwork() === "offline";

		socket.addEventListener("open", handleOpen);
		socket.addEventListener("close", handleDisconnect);
		socket.addEventListener("error", handleDisconnect);
		socket.addEventListener("message", handleMessage);

		checkTimer = setInterval(() => {
			if (wasHidden || wasOffline || socket.readyState !== SOCKET_OPEN) return;
			// The larger of the wall-clock and monotonic ages, so setting the system clock back cannot
			// keep a silent socket looking active (ADR 0022).
			if (getSilenceMs() < inactivityThresholdMs) return;
			requestReconnect();
		}, checkIntervalMs);

		detachVisibility = watchVisibility((state) => {
			if (state === "hidden") {
				wasHidden = true;
				clearResumeProbe();
				return;
			}
			if (!wasHidden) return;
			wasHidden = false;
			// Returning to the foreground does not imply a broken socket, so a socket that still
			// receives frames is left alone; only one that proves dead or silent is replaced.
			recoverAfterResume();
		});

		detachNetwork = watchNetwork((state) => {
			if (state === "offline") {
				wasOffline = true;
				clearResumeProbe();
				return;
			}
			if (!wasOffline) return;
			wasOffline = false;
			requestReconnect();
		});
	};

	const detach = () => {
		if (!attached) return;
		attached = false;
		socket.removeEventListener("open", handleOpen);
		socket.removeEventListener("close", handleDisconnect);
		socket.removeEventListener("error", handleDisconnect);
		socket.removeEventListener("message", handleMessage);
		if (checkTimer) clearInterval(checkTimer);
		checkTimer = undefined;
		clearResumeProbe();
		detachVisibility?.();
		detachVisibility = undefined;
		detachNetwork?.();
		detachNetwork = undefined;
		hasOpened = false;
		disconnectedAfterOpen = false;
		reconnectRequested = false;
		wasHidden = false;
		wasOffline = false;
	};

	return {
		subscribeReconnect: (listener) => {
			listeners.add(listener);
			attach();
			return () => {
				listeners.delete(listener);
				if (listeners.size === 0 && disconnectListeners.size === 0) detach();
			};
		},
		subscribeDisconnect: (listener) => {
			disconnectListeners.add(listener);
			attach();
			return () => {
				disconnectListeners.delete(listener);
				if (listeners.size === 0 && disconnectListeners.size === 0) detach();
			};
		},
		requestReconnect,
	};
}
