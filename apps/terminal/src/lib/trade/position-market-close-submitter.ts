import {
	type ExchangeSigningDeadlineSlot,
	startExchangeActionDeadline,
} from "@sairn/hl-react/internal/exchange/request-scheduler";
import { localizedPositionSubmitFeedback } from "@/lib/trade/position-submit-feedback";
import {
	getPositionMarketCloseActions,
	getPositionMarketCloseModal,
	type PositionMarketClosePresentation,
	type PositionMarketCloseRef,
	type PositionMarketCloseSession,
	type PositionMarketCloseSizingIntent,
} from "@/stores/use-global-modal-store";
import { addOrderQueueItem, getOrderQueueItem, updateOrderQueueItem } from "@/stores/use-order-queue-store";

export interface PositionMarketCloseSubmitInput {
	sessionId: string;
	confirmedCloseSize: string | null;
	dismissFutureConfirmation?: boolean;
}

/** Everything a confirmed Market Close executes with, sealed at the confirming click. */
export interface PositionMarketCloseAttempt {
	readonly sessionId: string;
	readonly queueId: string;
	readonly owner: PositionMarketCloseSession["owner"];
	readonly env: PositionMarketCloseSession["env"];
	readonly position: PositionMarketCloseRef;
	readonly openedPresentation: PositionMarketClosePresentation;
	readonly sizingIntent: PositionMarketCloseSizingIntent;
	readonly confirmedCloseSize: string | null;
	readonly dismissFutureConfirmation: boolean;
	/** Started in the confirming click itself, so the wait for the submit host counts against it (ADR 0053). */
	readonly deadline: ExchangeSigningDeadlineSlot;
}

type PositionMarketCloseExecutor = (attempt: PositionMarketCloseAttempt) => Promise<void>;

export const POSITION_MARKET_CLOSE_SUBMITTER_WAIT_MS = 5_000;

let registration: { execute: PositionMarketCloseExecutor } | null = null;
const registrationListeners = new Set<() => void>();
const runningAttempts = new Map<string, Promise<void>>();
const waitingAttempts = new Map<PositionMarketCloseAttempt, () => void>();

/**
 * Market Close attempts execute in the page-level submit host so that legal, HIP-3, onboarding,
 * tab and breakpoint changes cannot unmount the component whose live data the execution guard reads.
 * The host loads on demand, so an attempt sealed before it registers waits briefly for it.
 */
export function registerPositionMarketCloseSubmitter(execute: PositionMarketCloseExecutor): () => void {
	const current = { execute };
	registration = current;
	for (const listener of [...registrationListeners]) listener();
	return () => {
		if (registration === current) registration = null;
	};
}

export function hasPositionMarketCloseSubmitter(): boolean {
	return registration !== null;
}

/**
 * Seals the confirmation synchronously: the dialog closes, the session leaves `idle` so its sizing
 * can no longer change, and the single pending notification exists before anything is awaited.
 */
export function beginPositionMarketCloseAttempt(
	input: PositionMarketCloseSubmitInput,
): PositionMarketCloseAttempt | null {
	const session = getPositionMarketCloseModal();
	if (!session || session.sessionId !== input.sessionId || session.phase !== "idle") return null;

	const deadline = startExchangeActionDeadline();
	const queueId = addOrderQueueItem({
		id: `market-close:${input.sessionId}`,
		owner: session.owner,
		env: session.env,
		operation: "market-close",
		market: session.position.coin,
		size: input.confirmedCloseSize ?? undefined,
		orderType: "market",
		countMode: "filled",
		status: "pending",
		children: [
			{
				assetId: session.position.assetId,
				market: session.position.coin,
				size: input.confirmedCloseSize ?? undefined,
				status: "pending",
			},
		],
	});
	const actions = getPositionMarketCloseActions();
	actions.dismiss(input.sessionId);
	actions.updatePhase(input.sessionId, "validating");
	return Object.freeze({
		sessionId: session.sessionId,
		queueId,
		owner: session.owner,
		env: session.env,
		position: session.position,
		openedPresentation: session.presentation,
		sizingIntent: session.sizingIntent,
		confirmedCloseSize: input.confirmedCloseSize,
		dismissFutureConfirmation: input.dismissFutureConfirmation === true,
		deadline,
	});
}

export function submitPositionMarketClose(input: PositionMarketCloseSubmitInput): Promise<void> {
	const running = runningAttempts.get(input.sessionId);
	if (running) return running;
	const attempt = beginPositionMarketCloseAttempt(input);
	if (!attempt) return Promise.resolve();

	const run = dispatchAttempt(attempt).finally(() => {
		if (runningAttempts.get(attempt.sessionId) === run) runningAttempts.delete(attempt.sessionId);
	});
	runningAttempts.set(attempt.sessionId, run);
	return run;
}

/**
 * The page that sealed a waiting attempt is going away (its submit host gate unmounted before the host
 * registered). The attempt fails closed instead of being picked up by a host on another page.
 */
export function abandonWaitingPositionMarketCloseAttempts(): void {
	for (const abandon of [...waitingAttempts.values()]) abandon();
}

async function dispatchAttempt(attempt: PositionMarketCloseAttempt): Promise<void> {
	if (!registration) {
		const abandoned = await waitForSubmitter(attempt, POSITION_MARKET_CLOSE_SUBMITTER_WAIT_MS);
		if (abandoned) return failAttemptWithoutSubmitter(attempt);
	}
	if (registration) return registration.execute(attempt);
	failAttemptWithoutSubmitter(attempt);
}

function waitForSubmitter(attempt: PositionMarketCloseAttempt, timeoutMs: number): Promise<boolean> {
	return new Promise((resolve) => {
		const timer = setTimeout(() => settle(false), timeoutMs);
		function settle(abandoned: boolean) {
			clearTimeout(timer);
			registrationListeners.delete(onRegistered);
			waitingAttempts.delete(attempt);
			resolve(abandoned);
		}
		function onRegistered() {
			settle(false);
		}
		registrationListeners.add(onRegistered);
		waitingAttempts.set(attempt, () => settle(true));
	});
}

function failAttemptWithoutSubmitter(attempt: PositionMarketCloseAttempt): void {
	updateOrderQueueItem(attempt.queueId, {
		status: "failed",
		error: localizedPositionSubmitFeedback("failed-market-close"),
		children: getOrderQueueItem(attempt.queueId)?.children?.map((child) =>
			child.status === "pending" ? { ...child, status: "rejected" } : child,
		),
	});
	const session = getPositionMarketCloseModal();
	if (session?.sessionId !== attempt.sessionId || session.phase !== "validating") return;
	const actions = getPositionMarketCloseActions();
	actions.updatePhase(attempt.sessionId, "idle");
	actions.close(attempt.sessionId);
}
