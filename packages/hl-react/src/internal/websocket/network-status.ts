type NetworkState = "online" | "offline";
type NetworkListener = (state: NetworkState) => void;

let listeners: Set<NetworkListener> | undefined;
let currentState: NetworkState = "online";

function handleOnline() {
	if (currentState === "online") return;
	currentState = "online";
	notify();
}

function handleOffline() {
	if (currentState === "offline") return;
	currentState = "offline";
	notify();
}

function notify() {
	if (!listeners) return;
	for (const listener of listeners) {
		listener(currentState);
	}
}

function attach() {
	window.addEventListener("online", handleOnline);
	window.addEventListener("offline", handleOffline);
	currentState = navigator.onLine ? "online" : "offline";
}

function detach() {
	window.removeEventListener("online", handleOnline);
	window.removeEventListener("offline", handleOffline);
}

export function subscribeNetworkStatus(listener: NetworkListener): () => void {
	if (typeof document === "undefined") {
		return () => {};
	}

	if (!listeners) {
		listeners = new Set();
		attach();
	}
	listeners.add(listener);

	return () => {
		listeners?.delete(listener);
		if (listeners?.size === 0) {
			detach();
			listeners = undefined;
		}
	};
}

export function getNetworkState(): NetworkState {
	if (typeof document === "undefined") return "online";
	return currentState;
}

export function __setNetworkState(state: NetworkState): void {
	if (state === currentState) return;
	currentState = state;
	notify();
}

export type { NetworkState, NetworkListener };
