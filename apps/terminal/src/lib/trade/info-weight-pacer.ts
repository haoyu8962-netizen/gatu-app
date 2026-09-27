import { waitForHistoryRetry } from "@/lib/trade/history-pagination";

/** Per-IP REST weight budget documented by Hyperliquid, shared by every REST request from the browser. */
export const INFO_REST_WEIGHT_LIMIT_PER_MINUTE = 1_200;

const INFO_REQUEST_BASE_WEIGHT = 20;
const INFO_ITEMS_PER_EXTRA_WEIGHT = 20;
const INFO_WEIGHT_WINDOW_MS = 60_000;

/**
 * Weight of an Info request whose endpoint Hyperliquid charges extra per 20 returned items
 * (`userFillsByTime`, `userTwapSliceFillsByTime` and others). The item share is rounded up because
 * the documentation does not say how a partial group of 20 is counted.
 */
export function getItemWeightedInfoRequestWeight(itemCount: number): number {
	return INFO_REQUEST_BASE_WEIGHT + Math.ceil(Math.max(itemCount, 0) / INFO_ITEMS_PER_EXTRA_WEIGHT);
}

export interface InfoWeightPacer {
	/** Resolves once another request of `reserveWeight` fits the sliding window. */
	acquire: (signal: AbortSignal) => Promise<void>;
	/** Records the weight a completed request actually cost. */
	record: (weight: number) => void;
}

export interface InfoWeightPacerOptions {
	now?: (() => number) | undefined;
	/** Weight assumed for the next request before its response size is known. */
	reserveWeight: number;
	wait?: ((delayMs: number, signal: AbortSignal) => Promise<void>) | undefined;
	/** Most weight the paced requests may record within any window. */
	weightPerWindow: number;
	windowMs?: number | undefined;
}

interface RecordedWeight {
	time: number;
	weight: number;
}

/**
 * Sliding-window pacer for sequential requests. A weight is recorded when its response arrives,
 * which is never earlier than the server counted the request, so the window errs on the safe side.
 */
export function createInfoWeightPacer(options: InfoWeightPacerOptions): InfoWeightPacer {
	const {
		now = () => performance.now(),
		reserveWeight,
		wait = waitForHistoryRetry,
		weightPerWindow,
		windowMs = INFO_WEIGHT_WINDOW_MS,
	} = options;
	const recorded: RecordedWeight[] = [];

	function getDelayMs(currentTime: number): number {
		while (recorded.length > 0 && (recorded[0]?.time ?? currentTime) + windowMs <= currentTime) recorded.shift();
		let excess = recorded.reduce((sum, entry) => sum + entry.weight, 0) + reserveWeight - weightPerWindow;
		if (excess <= 0) return 0;
		for (const entry of recorded) {
			excess -= entry.weight;
			if (excess <= 0) return entry.time + windowMs - currentTime;
		}
		const newestEntry = recorded.at(-1);
		return newestEntry ? newestEntry.time + windowMs - currentTime : 0;
	}

	async function acquire(signal: AbortSignal): Promise<void> {
		for (let delayMs = getDelayMs(now()); delayMs > 0; delayMs = getDelayMs(now())) {
			await wait(delayMs, signal);
		}
	}

	function record(weight: number): void {
		recorded.push({ time: now(), weight });
	}

	return { acquire, record };
}
