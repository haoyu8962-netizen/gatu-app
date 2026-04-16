import type { HyperliquidStore, StoreInternals } from "../../store";
import { __setNetworkState } from "./network-status";
import { __setVisibilityState } from "./visibility";

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

export function registerChaosHarness(store: HyperliquidStore): void {
	if (typeof window === "undefined") return;

	const internals = (store as unknown as { __internals: StoreInternals }).__internals;

	window.__hl_chaos = {
		closeSocket() {
			store.getState().config.triggerReconnect?.();
		},
		freezeMessages(ms: number) {
			internals.chaos.messageFrozenUntil = Date.now() + ms;
		},
		simulateHidden(ms?: number) {
			__setVisibilityState("hidden");
			if (ms !== undefined) {
				setTimeout(() => __setVisibilityState("visible"), ms);
			}
		},
		simulateVisible() {
			__setVisibilityState("visible");
		},
		simulateOffline(ms?: number) {
			__setNetworkState("offline");
			if (ms !== undefined) {
				setTimeout(() => __setNetworkState("online"), ms);
			}
		},
		simulateOnline() {
			__setNetworkState("online");
		},
		dropReconnects(n: number) {
			internals.chaos.reconnectDropCount = n;
		},
	};
}
