import { getNetworkState, subscribeNetworkStatus } from "./network-status";
import { WS_RELIABILITY_LIMITS } from "./reliability";
import { getVisibilityState, subscribeVisibility } from "./visibility";

type SocketEventName = "open" | "close" | "error" | "message";
const SOCKET_OPEN = 1;

export interface MonitoredWebSocket {
	readonly readyState: number;
	addEventListener(type: SocketEventName, listener: EventListener): void;
	removeEventListener(type: SocketEventName, listener: EventListener): void;
	reconnect(): void;
}

type VisibilityState = "visible" | "hidden";
type NetworkState = "online" | "offline";
type StateSubscriber<T> = (listener: (state: T) => void) => () => void;

export interface WsTransportMonitorOptions {
	inactivityThresholdMs?: number;
	checkIntervalMs?: number;
	getVisibilityState?: () => VisibilityState;
	getNetworkState?: () => NetworkState;
	subscribeVisibility?: StateSubscriber<VisibilityState>;
	subscribeNetworkStatus?: StateSubscriber<NetworkState>;
}

export interface WsTransportMonitor {
	subscribeReconnect(listener: (generation: number) => void): () => void;
	requestReconnect(): void;
}

export function createWsTransportMonitor(
	socket: MonitoredWebSocket,
	options: WsTransportMonitorOptions = {},
): WsTransportMonitor {
	const listeners = new Set<(generation: number) => void>();
	const inactivityThresholdMs = options.inactivityThresholdMs ?? WS_RELIABILITY_LIMITS.transport.inactivityThresholdMs;
	const checkIntervalMs = options.checkIntervalMs ?? WS_RELIABILITY_LIMITS.transport.checkIntervalMs;
	const readVisibility = options.getVisibilityState ?? getVisibilityState;
	const readNetwork = options.getNetworkState ?? getNetworkState;
	const watchVisibility = options.subscribeVisibility ?? subscribeVisibility;
	const watchNetwork = options.subscribeNetworkStatus ?? subscribeNetworkStatus;

	let attached = false;
	let hasOpened = false;
	let disconnectedAfterOpen = false;
	let reconnectRequested = false;
	let generation = 0;
	let lastMessageAt = 0;
	let checkTimer: ReturnType<typeof setInterval> | undefined;
	let detachVisibility: (() => void) | undefined;
	let detachNetwork: (() => void) | undefined;
	let wasHidden = false;
	let wasOffline = false;

	const requestReconnect = () => {
		if (!attached || reconnectRequested || socket.readyState !== SOCKET_OPEN) return;
		reconnectRequested = true;
		disconnectedAfterOpen = hasOpened;
		try {
			socket.reconnect();
		} catch {
			reconnectRequested = false;
		}
	};

	const handleOpen: EventListener = () => {
		const shouldNotify = hasOpened && disconnectedAfterOpen;
		hasOpened = true;
		disconnectedAfterOpen = false;
		reconnectRequested = false;
		lastMessageAt = Date.now();

		if (!shouldNotify) return;
		generation += 1;
		for (const listener of [...listeners]) {
			listener(generation);
		}
	};

	const handleDisconnect: EventListener = () => {
		if (hasOpened) disconnectedAfterOpen = true;
	};

	const handleMessage: EventListener = () => {
		lastMessageAt = Date.now();
	};

	const attach = () => {
		if (attached) return;
		attached = true;
		hasOpened = socket.readyState === SOCKET_OPEN;
		disconnectedAfterOpen = false;
		reconnectRequested = false;
		lastMessageAt = Date.now();
		wasHidden = readVisibility() === "hidden";
		wasOffline = readNetwork() === "offline";

		socket.addEventListener("open", handleOpen);
		socket.addEventListener("close", handleDisconnect);
		socket.addEventListener("error", handleDisconnect);
		socket.addEventListener("message", handleMessage);

		checkTimer = setInterval(() => {
			if (wasHidden || wasOffline || socket.readyState !== SOCKET_OPEN) return;
			if (Date.now() - lastMessageAt < inactivityThresholdMs) return;
			requestReconnect();
		}, checkIntervalMs);

		detachVisibility = watchVisibility((state) => {
			if (state === "hidden") {
				wasHidden = true;
				return;
			}
			if (!wasHidden) return;
			wasHidden = false;
			// Returning to the foreground does not imply a broken socket. The
			// inactivity check will reconnect on its next tick if messages really
			// stopped while the page was hidden.
		});

		detachNetwork = watchNetwork((state) => {
			if (state === "offline") {
				wasOffline = true;
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
				if (listeners.size === 0) detach();
			};
		},
		requestReconnect,
	};
}
