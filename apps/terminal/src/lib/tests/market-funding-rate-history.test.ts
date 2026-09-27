import { describe, expect, it } from "vitest";
import {
	bucketFundingRates,
	DEFAULT_FUNDING_HISTORY_RANGE,
	FUNDING_HISTORY_RANGE_ORDER,
	FUNDING_HISTORY_RANGES,
	getFundingRateTone,
	isFundingHistoryMarket,
	summarizeFundingRateBuckets,
} from "@/domain/market/funding-rate-history";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const EIGHT_HOUR_START = 1_790_496_000_000;

function hourly(count: number, start: number, rate: string | ((index: number) => string)) {
	return Array.from({ length: count }, (_, index) => ({
		fundingRate: typeof rate === "string" ? rate : rate(index),
		time: start + index * HOUR_MS + ((index * 37) % 90),
	}));
}

describe("funding rate history ranges", () => {
	it("matches the official intervals and windows with 8h as the default", () => {
		expect(FUNDING_HISTORY_RANGE_ORDER).toEqual(["1h", "8h", "1d"]);
		expect(FUNDING_HISTORY_RANGES).toEqual({
			"1h": { bucketMs: HOUR_MS, windowMs: 7 * DAY_MS },
			"8h": { bucketMs: 8 * HOUR_MS, windowMs: 30 * DAY_MS },
			"1d": { bucketMs: DAY_MS, windowMs: 90 * DAY_MS },
		});
		expect(DEFAULT_FUNDING_HISTORY_RANGE).toBe("8h");
	});

	it.each([
		[{ kind: "perp" }, true],
		[{ kind: "builderPerp" }, true],
		[{ kind: "spot" }, false],
		[undefined, false],
		[null, false],
	])("offers funding history only for perpetual markets: %o", (market, expected) => {
		expect(isFundingHistoryMarket(market)).toBe(expected);
	});
});

describe("bucketFundingRates", () => {
	it("aligns buckets to the UTC epoch while keeping millisecond offsets in their own hour", () => {
		const rows = [
			{ fundingRate: "0.0000125", time: 1_790_503_200_009 },
			{ fundingRate: "0.00002", time: 1_790_506_800_042 },
		];

		expect(bucketFundingRates(rows, HOUR_MS).map((bucket) => bucket.time)).toEqual([
			1_790_503_200_000, 1_790_506_800_000,
		]);
		expect(bucketFundingRates(rows, 8 * HOUR_MS)).toEqual([
			{ cumulativeRate: "0.0000325", rate: "0.0000325", samples: 2, time: EIGHT_HOUR_START },
		]);
	});

	it("sums hourly rates exactly and keeps a running cumulative rate", () => {
		const buckets = bucketFundingRates(hourly(24, EIGHT_HOUR_START, "0.0000125"), 8 * HOUR_MS);

		expect(buckets).toEqual([
			{ cumulativeRate: "0.0001", rate: "0.0001", samples: 8, time: EIGHT_HOUR_START },
			{ cumulativeRate: "0.0002", rate: "0.0001", samples: 8, time: EIGHT_HOUR_START + 8 * HOUR_MS },
			{ cumulativeRate: "0.0003", rate: "0.0001", samples: 8, time: EIGHT_HOUR_START + 16 * HOUR_MS },
		]);
	});

	it("keeps partial first and last buckets", () => {
		const start = EIGHT_HOUR_START + 5 * HOUR_MS;
		const buckets = bucketFundingRates(hourly(12, start, "0.00001"), 8 * HOUR_MS);

		expect(buckets.map(({ samples, rate }) => ({ samples, rate }))).toEqual([
			{ samples: 3, rate: "0.00003" },
			{ samples: 8, rate: "0.00008" },
			{ samples: 1, rate: "0.00001" },
		]);
		expect(buckets.at(-1)?.cumulativeRate).toBe("0.00012");
	});

	it("handles negative rates without floating-point drift", () => {
		const buckets = bucketFundingRates(
			hourly(3, EIGHT_HOUR_START, (index) => ["0.1", "0.2", "-0.3000000001"][index] ?? "0"),
			DAY_MS,
		);

		expect(buckets).toHaveLength(1);
		expect(buckets[0]).toMatchObject({ cumulativeRate: "-0.0000000001", rate: "-0.0000000001", samples: 3 });
	});

	it("sorts unordered input and counts a repeated timestamp once", () => {
		const rows = [
			{ fundingRate: "0.00003", time: EIGHT_HOUR_START + 2 * HOUR_MS },
			{ fundingRate: "0.00001", time: EIGHT_HOUR_START },
			{ fundingRate: "0.00002", time: EIGHT_HOUR_START + HOUR_MS },
			{ fundingRate: "0.00002", time: EIGHT_HOUR_START + HOUR_MS },
		];

		expect(bucketFundingRates(rows, HOUR_MS)).toEqual([
			{ cumulativeRate: "0.00001", rate: "0.00001", samples: 1, time: EIGHT_HOUR_START },
			{ cumulativeRate: "0.00003", rate: "0.00002", samples: 1, time: EIGHT_HOUR_START + HOUR_MS },
			{ cumulativeRate: "0.00006", rate: "0.00003", samples: 1, time: EIGHT_HOUR_START + 2 * HOUR_MS },
		]);
	});

	it("keeps protocol decimals in plain notation", () => {
		const [bucket] = bucketFundingRates([{ fundingRate: "0.0000000125", time: EIGHT_HOUR_START }], HOUR_MS);

		expect(bucket?.rate).toBe("0.0000000125");
		expect(bucket?.cumulativeRate).toBe("0.0000000125");
	});

	it("returns no buckets for an empty snapshot and rejects an invalid bucket size", () => {
		expect(bucketFundingRates([], HOUR_MS)).toEqual([]);
		expect(() => bucketFundingRates([], 0)).toThrow(RangeError);
	});
});

describe("funding rate summaries", () => {
	it("reports the latest, cumulative and extreme bucket rates", () => {
		const buckets = bucketFundingRates(
			hourly(3, EIGHT_HOUR_START, (index) => ["0.0001", "-0.0002", "0.00005"][index] ?? "0"),
			HOUR_MS,
		);

		expect(summarizeFundingRateBuckets(buckets)).toEqual({
			cumulativeRate: "-0.00005",
			endTime: EIGHT_HOUR_START + 2 * HOUR_MS,
			latestRate: "0.00005",
			maxRate: "0.0001",
			minRate: "-0.0002",
			startTime: EIGHT_HOUR_START,
		});
		expect(summarizeFundingRateBuckets([])).toBeNull();
	});

	it.each([
		["0.0000125", "up"],
		["-0.0000125", "down"],
		["0", "neutral"],
		["-0.0", "neutral"],
	])("classifies %s as %s", (rate, tone) => {
		expect(getFundingRateTone(rate)).toBe(tone);
	});
});
