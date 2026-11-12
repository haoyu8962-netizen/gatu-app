import { type FrameReceipt, receiveFrameNow } from "./frame-receipt";
import { getNetworkState, subscribeNetworkStatus } from "./network-status";
import { WS_RELIABILITY_LIMITS } from "./reliability";
import { getReceiptAgeMs } from "./staleness";
import { getVisibilityState, subscribeVisibility } from "./visibility";

type SocketEventName = "open" | "close" | "error" | "message";
const SOCKET_OPEN = 1;

export interface MonitoredWebSocket {
	readonly readyState: number;
	addEventListener(type: SocketEventName, listener: EventListener): void;
	removeEventListener(type: SocketEventName, listener: EventListener): void;
	reconnect(): void;
	send(data: string): void;
}

export type ProbedWebSocket = Pick<MonitoredWebSocket, "addEventListener" | "removeEventListener" | "send">;

/**
 * Sends Hyperliquid's heartbeat request, the frame the SDK keep-alive also sends, and settles alive
 * when a heartbeat answer (`{"channel":"pong"}`, answering this request or the SDK's) arrives within
 * `timeoutMs`, dead otherwise. Other frames do not count: a phone that was suspended can deliver frames
 * the kernel buffered before the connection died, and those prove nothing about the connection now.
 * Returns a function that abandons the probe without settling it.
 */
export function probeLiveness(
	socket: ProbedWebSocket,
	timeoutMs: number,
	onSettle: (alive: boolean) => void,
): () => void {
	const handleMessage = (event: Event) => {
		const data = (event as MessageEvent).data;
		if (typeof data === "string" && data.length < 40 && data.includes('"pong"')) settle(true);
	};
	const timer = setTimeout(settle, timeoutMs, false);
	function stop() {
		clearTimeout(timer);
		socket.removeEventListener("message", handleMessage);
	}
	function settle(alive: boolean) {
		stop();
		onSettle(alive);
	}
	socket.addEventListener("message", handleMessage);
	try {
		socket.send('{"method":"ping"}');
	} catch {}
	return stop;
}

type VisibilityState = "visible" | "hidden";
type NetworkState = "online" | "offline";
type StateSubscriber<T> = (listener: (state: T) => void) => () => void;

export interface WsTransportMonitorOptions {
	quietProbeThresholdMs?: number;
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
	const limits = WS_RELIABILITY_LIMITS.transport;
	const quietProbeThresholdMs = options.quietProbeThresholdMs ?? limits.quietProbeThresholdMs;
	const inactivityThresholdMs = options.inactivityThresholdMs ?? limits.inactivityThresholdMs;
	const checkIntervalMs = options.checkIntervalMs ?? limits.checkIntervalMs;
	const resumeProbeTimeoutMs = options.resumeProbeTimeoutMs ?? limits.resumeProbeTimeoutMs;
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
	let stopProbe: (() => void) | undefined;
	let detachVisibility: (() => void) | undefined;
	let detachNetwork: (() => void) | undefined;
	let wasHidden = false;
	let wasOffline = false;

	const clearProbe = () => {
		stopProbe?.();
		stopProbe = undefined;
	};

	const requestReconnect = () => {
		if (!attached || reconnectRequested || socket.readyState !== SOCKET_OPEN) return;
		reconnectRequested = true;
		clearProbe();
		try {
			socket.reconnect();
		} catch {
			reconnectRequested = false;
			return;
		}
		markDisconnected();
	};

	// A live socket answers a heartbeat within a round trip, so a quiet but healthy connection survives.
	const startProbe = () => {
		clearProbe();
		stopProbe = probeLiveness(socket, resumeProbeTimeoutMs, (alive) => {
			stopProbe = undefined;
			if (!alive) requestReconnect();
		});
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
		if (getSilenceMs() >= inactivityThresholdMs) requestReconnect();
		else startProbe();
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
		clearProbe();
		markDisconnected();
	};

	const handleMessage: EventListener = () => {
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
			if (wasHidden || wasOffline || stopProbe || socket.readyState !== SOCKET_OPEN) return;
			// The larger of the wall-clock and monotonic ages, so setting the system clock back cannot
			// keep a silent socket looking active (ADR 0022). A quiet socket is asked for a heartbeat,
			// as the official terminal checks for fifteen seconds of silence; only the backstop
			// threshold replaces it without asking.
			const silenceMs = getSilenceMs();
			if (silenceMs >= inactivityThresholdMs) requestReconnect();
			else if (silenceMs >= quietProbeThresholdMs) startProbe();
		}, checkIntervalMs);

		detachVisibility = watchVisibility((state) => {
			if (state === "hidden") {
				wasHidden = true;
				clearProbe();
				return;
			}
			if (!wasHidden) return;
			wasHidden = false;
			// Returning to the foreground does not imply a broken socket, so a socket that answers the
			// heartbeat is left alone; only one that proves dead or silent is replaced.
			recoverAfterResume();
		});

		detachNetwork = watchNetwork((state) => {
			if (state === "offline") {
				wasOffline = true;
				clearProbe();
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
		clearProbe();
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
