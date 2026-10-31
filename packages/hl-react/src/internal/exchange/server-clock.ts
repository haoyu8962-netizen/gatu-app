import { getReceiptAgeMs } from "../websocket/staleness";

/**
 * Lifetime of an L1 action. The exchange rejects an action it has not accepted by its
 * `expiresAfter` ("Action already expired"), so an order or cancel held up by a bad connection or
 * congestion is dropped instead of executing late. The official terminal uses 15 seconds of the
 * exchange's clock; user-signed actions do not support the field.
 */
export const EXCHANGE_ACTION_EXPIRY_MS = 15_000;

const SYNC_TIMEOUT_MS = 2_000;
const RESYNC_AFTER_MS = 60_000;
const RETRY_AFTER_FAILURE_MS = 30_000;
/** Wall-clock and monotonic ages further apart than this mean the system clock was changed or the device slept. */
const CLOCK_DIVERGENCE_MS = 1_000;

interface Receipt {
	at: number;
	monotonicAt: number;
}

interface ServerTimeSample extends Receipt {
	serverTime: number;
}

export interface ServerClock {
	sync(): Promise<void>;
	getExpiresAfter(): Promise<number>;
}

function receiptNow(): Receipt {
	return { at: Date.now(), monotonicAt: performance.now() };
}

function ageOf(receipt: Receipt): number {
	return getReceiptAgeMs(receipt.at, receipt.monotonicAt);
}

function monotonicAgeOf(receipt: Receipt): number {
	return Math.max(0, performance.now() - receipt.monotonicAt);
}

function clocksDisagree(receipt: Receipt): boolean {
	return Math.abs(Date.now() - receipt.at - (performance.now() - receipt.monotonicAt)) > CLOCK_DIVERGENCE_MS;
}

/**
 * Estimates the exchange's clock from `exchangeStatus` so that a device clock running behind does
 * not make every action arrive already expired. Elapsed time since the sample is its monotonic age
 * only: that clock never runs ahead of real time, so a system clock moved forward cannot stretch the
 * 15-second window. When the wall-clock and monotonic ages disagree (the system clock was changed,
 * or the monotonic clock stopped while the device slept), an action first waits for a new sample,
 * whatever the retry pause; if none arrives the monotonic estimate stays, so an action may arrive
 * already expired but never late. Staleness still uses the larger of both ages (ADR 0022). Without
 * a usable sample the device clock is used, as the official terminal does before its first account
 * snapshot.
 */
export function createServerClock(fetchServerTime: (signal: AbortSignal) => Promise<number>): ServerClock {
	let sample: ServerTimeSample | null = null;
	let lastFailure: Receipt | null = null;
	let pending: Promise<void> | null = null;

	function sync(): Promise<void> {
		if (pending) return pending;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
		const sentAt = performance.now();
		pending = Promise.resolve()
			.then(() => fetchServerTime(controller.signal))
			.then((serverTime) => {
				const received = receiptNow();
				const roundTrip = received.monotonicAt - sentAt;
				if (!Number.isFinite(serverTime) || serverTime <= 0 || roundTrip > SYNC_TIMEOUT_MS) {
					throw new Error("The exchange server time is unusable.");
				}
				sample = { ...received, serverTime: serverTime + roundTrip / 2 };
				lastFailure = null;
			})
			.catch(() => {
				lastFailure = receiptNow();
			})
			.finally(() => {
				clearTimeout(timer);
				pending = null;
			});
		return pending;
	}

	function canRetry(): boolean {
		return !lastFailure || ageOf(lastFailure) > RETRY_AFTER_FAILURE_MS;
	}

	function estimateServerNow(): number {
		return sample ? sample.serverTime + monotonicAgeOf(sample) : Date.now();
	}

	async function getExpiresAfter(): Promise<number> {
		if (!sample) {
			if (canRetry()) await sync();
		} else if (clocksDisagree(sample)) {
			await sync();
		} else if (ageOf(sample) > RESYNC_AFTER_MS && canRetry()) {
			void sync();
		}
		return Math.floor(estimateServerNow()) + EXCHANGE_ACTION_EXPIRY_MS;
	}

	return { sync, getExpiresAfter };
}
