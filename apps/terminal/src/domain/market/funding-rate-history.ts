import Big from "big.js";

export type FundingHistoryRange = "1h" | "8h" | "1d";

export interface FundingHistoryRangeConfig {
	bucketMs: number;
	windowMs: number;
}

export interface FundingRateSample {
	fundingRate: string;
	time: number;
}

export interface FundingRateBucket {
	cumulativeRate: string;
	rate: string;
	samples: number;
	time: number;
}

export interface FundingRateBucketSummary {
	cumulativeRate: string;
	endTime: number;
	latestRate: string;
	maxRate: string;
	minRate: string;
	startTime: number;
}

export interface FundingHistorySnapshotReceipt {
	monotonicReceivedAt: number;
	receivedAt: number;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export const FUNDING_HISTORY_RANGES: Readonly<Record<FundingHistoryRange, FundingHistoryRangeConfig>> = {
	"1h": { bucketMs: HOUR_MS, windowMs: 7 * DAY_MS },
	"8h": { bucketMs: 8 * HOUR_MS, windowMs: 30 * DAY_MS },
	"1d": { bucketMs: DAY_MS, windowMs: 90 * DAY_MS },
};

export const FUNDING_HISTORY_RANGE_ORDER: readonly FundingHistoryRange[] = ["1h", "8h", "1d"];

export const DEFAULT_FUNDING_HISTORY_RANGE: FundingHistoryRange = "8h";

/**
 * Groups hourly funding records into buckets aligned to the UTC epoch. Records arrive a few
 * milliseconds after the hour, so flooring keeps each one in its own hour. A bucket's rate is the
 * sum of its hourly rates, which is the rate a position held through the whole bucket paid; the
 * first and last buckets of a window may be partial and are kept. `cumulativeRate` is the running
 * sum from the first bucket. Records sharing a timestamp are one event; the last one wins.
 */
export function bucketFundingRates(rows: readonly FundingRateSample[], bucketMs: number): FundingRateBucket[] {
	if (!Number.isSafeInteger(bucketMs) || bucketMs <= 0) throw new RangeError("Invalid funding bucket size.");

	const rateByTime = new Map<number, Big>();
	for (const row of rows) rateByTime.set(row.time, new Big(row.fundingRate));

	const buckets: FundingRateBucket[] = [];
	let cumulative = new Big(0);
	let currentStart: number | null = null;
	let currentRate = new Big(0);
	let currentSamples = 0;

	function closeBucket() {
		if (currentStart === null) return;
		cumulative = cumulative.plus(currentRate);
		buckets.push({
			cumulativeRate: cumulative.toFixed(),
			rate: currentRate.toFixed(),
			samples: currentSamples,
			time: currentStart,
		});
	}

	for (const time of [...rateByTime.keys()].sort((left, right) => left - right)) {
		const bucketStart = Math.floor(time / bucketMs) * bucketMs;
		if (bucketStart !== currentStart) {
			closeBucket();
			currentStart = bucketStart;
			currentRate = new Big(0);
			currentSamples = 0;
		}
		currentRate = currentRate.plus(rateByTime.get(time) ?? 0);
		currentSamples += 1;
	}
	closeBucket();

	return buckets;
}

/**
 * Milliseconds a funding history snapshot stays usable. Its age is the larger of the wall-clock and
 * monotonic ages, so setting the system clock back cannot keep it alive, while a forward jump or a
 * device sleep that `performance.now()` may not count still ages it. A wall clock that has gone back
 * behind the receipt leaves the real age unknown, so the snapshot is treated as expired.
 */
export function getFundingHistorySnapshotRemainingMs(
	receipt: FundingHistorySnapshotReceipt,
	wallNow: number,
	monotonicNow: number,
	maxAgeMs: number,
): number {
	const wallAgeMs = wallNow - receipt.receivedAt;
	const monotonicAgeMs = monotonicNow - receipt.monotonicReceivedAt;
	if (!Number.isFinite(wallAgeMs) || !Number.isFinite(monotonicAgeMs) || wallAgeMs < 0) return 0;
	return Math.max(0, maxAgeMs - Math.max(wallAgeMs, monotonicAgeMs));
}

export function getFundingRateTone(rate: string): "down" | "neutral" | "up" {
	const value = new Big(rate);
	if (value.gt(0)) return "up";
	if (value.lt(0)) return "down";
	return "neutral";
}

export function summarizeFundingRateBuckets(buckets: readonly FundingRateBucket[]): FundingRateBucketSummary | null {
	const first = buckets[0];
	const last = buckets.at(-1);
	if (!first || !last) return null;

	let minRate = new Big(first.rate);
	let maxRate = minRate;
	for (const bucket of buckets) {
		const rate = new Big(bucket.rate);
		if (rate.lt(minRate)) minRate = rate;
		if (rate.gt(maxRate)) maxRate = rate;
	}

	return {
		cumulativeRate: last.cumulativeRate,
		endTime: last.time,
		latestRate: last.rate,
		maxRate: maxRate.toFixed(),
		minRate: minRate.toFixed(),
		startTime: first.time,
	};
}
