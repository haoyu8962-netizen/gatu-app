import { localizedPositionSubmitFeedback } from "@/lib/trade/position-submit-feedback";
import { getPositionMarketCloseActions, getPositionMarketCloseModal } from "@/stores/use-global-modal-store";
import { addOrderQueueItem } from "@/stores/use-order-queue-store";

export interface PositionMarketCloseSubmitInput {
	sessionId: string;
	confirmedCloseSize: string | null;
	dismissFutureConfirmation?: boolean;
}

type PositionMarketCloseSubmitter = (input: PositionMarketCloseSubmitInput) => Promise<void>;

export const POSITION_MARKET_CLOSE_SUBMITTER_WAIT_MS = 5_000;

let registration: { submit: PositionMarketCloseSubmitter } | null = null;
const registrationListeners = new Set<() => void>();

/**
 * Market Close submissions run in the page-level submit host so that legal, HIP-3, onboarding,
 * tab and breakpoint changes cannot unmount the component whose live data the execution guard reads.
 * The host loads on demand, so a confirmation that arrives before it registers waits briefly for it.
 */
export function registerPositionMarketCloseSubmitter(submit: PositionMarketCloseSubmitter): () => void {
	const current = { submit };
	registration = current;
	for (const listener of [...registrationListeners]) listener();
	return () => {
		if (registration === current) registration = null;
	};
}

export function hasPositionMarketCloseSubmitter(): boolean {
	return registration !== null;
}

function waitForSubmitter(timeoutMs: number): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(done, timeoutMs);
		function done() {
			clearTimeout(timer);
			registrationListeners.delete(done);
			resolve();
		}
		registrationListeners.add(done);
	});
}

export async function submitPositionMarketClose(input: PositionMarketCloseSubmitInput): Promise<void> {
	if (!registration) await waitForSubmitter(POSITION_MARKET_CLOSE_SUBMITTER_WAIT_MS);
	if (registration) return registration.submit(input);
	const session = getPositionMarketCloseModal();
	if (!session || session.sessionId !== input.sessionId || session.phase !== "idle") return;
	addOrderQueueItem({
		id: `market-close:${input.sessionId}`,
		owner: session.owner,
		env: session.env,
		operation: "market-close",
		market: session.position.coin,
		orderType: "market",
		countMode: "filled",
		status: "failed",
		error: localizedPositionSubmitFeedback("failed-market-close"),
	});
	getPositionMarketCloseActions().close(input.sessionId);
}
