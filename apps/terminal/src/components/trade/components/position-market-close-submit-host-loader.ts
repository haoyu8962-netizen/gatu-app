import type { ComponentType } from "react";

const HOST_LOAD_ATTEMPTS = 3;
const HOST_RETRY_DELAY_MS = 1_000;

let loadedHost: ComponentType | null = null;
let pending: Promise<void> | null = null;
let failedAttempts = 0;
const listeners = new Set<() => void>();

/**
 * The Market Close submit host is not part of the trade startup closure: it loads on intent (a pointer, press or
 * focus reaching a positions surface, or a Market Close session opening), never at mount or idle, so its bytes stay
 * out of the runtime startup profile in the same way as the order-form dialogs.
 */
export function warmPositionMarketCloseSubmitHost(): void {
	if (loadedHost || pending || failedAttempts >= HOST_LOAD_ATTEMPTS) return;
	pending = import("./position-market-close-submit-host").then(
		(module) => {
			loadedHost = module.PositionMarketCloseSubmitHost;
			pending = null;
			failedAttempts = 0;
			for (const listener of [...listeners]) listener();
		},
		() => {
			pending = null;
			failedAttempts += 1;
			if (failedAttempts < HOST_LOAD_ATTEMPTS) {
				setTimeout(warmPositionMarketCloseSubmitHost, HOST_RETRY_DELAY_MS * failedAttempts);
			}
		},
	);
}

export function subscribeToPositionMarketCloseSubmitHost(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function getLoadedPositionMarketCloseSubmitHost(): ComponentType | null {
	return loadedHost;
}

export function getUnloadedPositionMarketCloseSubmitHost(): null {
	return null;
}
