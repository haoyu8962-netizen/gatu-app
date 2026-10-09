import type { Address } from "viem";
import type { MobileAgentStaleReason } from "./mobile-agent";
import type { HyperliquidEnv } from "./types";

export interface MobileAgentEndedEvent {
	env: HyperliquidEnv;
	owner: Address;
	reason: MobileAgentStaleReason;
}

type Listener = (event: MobileAgentEndedEvent) => void;

const listeners = new Set<Listener>();

/**
 * Status checks remove an imported Mobile Agent once Hyperliquid definitively no longer approves it
 * (expired, or replaced by a newer desktop approval). The device drops to disconnected, so the
 * application subscribes here to tell the user why and that a new scan is needed.
 */
export function subscribeMobileAgentEnded(listener: Listener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function notifyMobileAgentEnded(event: MobileAgentEndedEvent): void {
	for (const listener of listeners) listener(event);
}
