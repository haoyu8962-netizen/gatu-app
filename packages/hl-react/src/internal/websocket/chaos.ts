import { getStoreInternals, type HyperliquidStore } from "../../store";

type ChaosHarness = {
	closeSocket(): void;
	freezeMessages(ms: number): void;
	simulateHidden(ms?: number): void;
	simulateVisible(): void;
	simulateOffline(ms?: number): void;
	simulateOnline(): void;
	dropReconnects(n: number): void;
};

declare global {
	interface Window {
		__hl_chaos?: ChaosHarness;
	}
}

function setDocumentHidden(hidden: boolean) {
	Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
	document.dispatchEvent(new Event("visibilitychange"));
}

function dispatchNetworkEvent(type: "online" | "offline") {
	window.dispatchEvent(new Event(type));
}

export function registerChaosHarness(store: HyperliquidStore): void {
	if (typeof window === "undefined") return;

	const internals = getStoreInternals(store);

	window.__hl_chaos = {
		closeSocket() {
			store.getState().config.triggerReconnect?.();
		},
		freezeMessages(ms: number) {
			internals.chaos.messageFrozenUntil = Date.now() + ms;
		},
		simulateHidden(ms?: number) {
			setDocumentHidden(true);
			if (ms !== undefined) {
				setTimeout(() => setDocumentHidden(false), ms);
			}
		},
		simulateVisible() {
			setDocumentHidden(false);
		},
		simulateOffline(ms?: number) {
			dispatchNetworkEvent("offline");
			if (ms !== undefined) {
				setTimeout(() => dispatchNetworkEvent("online"), ms);
			}
		},
		simulateOnline() {
			dispatchNetworkEvent("online");
		},
		dropReconnects(n: number) {
			internals.chaos.reconnectDropCount = n;
		},
	};
}
