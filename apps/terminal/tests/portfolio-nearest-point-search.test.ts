import { describe, expect, it } from "vitest";
import * as portfolioChartModule from "@/components/portfolio/portfolio-performance-chart";

interface SearchPoint {
	timestamp: number;
}

type NearestPointSearch = (points: readonly SearchPoint[], targetTimestamp: number) => number;

const findNearestPortfolioPointIndex = (
	portfolioChartModule as unknown as {
		findNearestPortfolioPointIndex?: NearestPointSearch;
	}
).findNearestPortfolioPointIndex;

describe("portfolio nearest-point search complexity", () => {
	it("uses logarithmic indexed reads for both 100 and 10,000 sorted points", () => {
		expect(
			findNearestPortfolioPointIndex,
			"The chart must expose its production nearest-timestamp search so the complexity contract tests real code",
		).toBeTypeOf("function");
		if (!findNearestPortfolioPointIndex) return;

		const small = runObservedSearch(findNearestPortfolioPointIndex, 100, 0.73396);
		const large = runObservedSearch(findNearestPortfolioPointIndex, 10_000, 0.73396);

		expect(small.result).toBe(small.expectedIndex);
		expect(large.result).toBe(large.expectedIndex);
		expect(large.indexedReads).toBeLessThanOrEqual(32);
		expect(large.indexedReads).toBeLessThanOrEqual(small.indexedReads + 8);
	});

	it("keeps deterministic left-biased results for ties and duplicate timestamps", () => {
		expect(findNearestPortfolioPointIndex).toBeTypeOf("function");
		if (!findNearestPortfolioPointIndex) return;

		expect(
			findNearestPortfolioPointIndex(
				[{ timestamp: 1_000 }, { timestamp: 2_000 }, { timestamp: 2_000 }, { timestamp: 3_000 }],
				2_000,
			),
		).toBe(1);
		expect(findNearestPortfolioPointIndex([{ timestamp: 1_000 }, { timestamp: 3_000 }], 2_000)).toBe(0);
	});
});

function runObservedSearch(search: NearestPointSearch, pointCount: number, targetRatio: number) {
	const timestampStep = 1_000;
	const points: SearchPoint[] = Array.from({ length: pointCount }, (_, index) => ({
		timestamp: index * timestampStep,
	}));
	let indexedReads = 0;
	const observedPoints = new Proxy(points, {
		get(target, property, receiver) {
			if (typeof property === "string" && /^(0|[1-9]\d*)$/.test(property)) indexedReads += 1;
			return Reflect.get(target, property, receiver);
		},
	});
	const targetTimestamp = (pointCount - 1) * timestampStep * targetRatio;
	const expectedIndex = Math.round(targetTimestamp / timestampStep);
	const result = search(observedPoints, targetTimestamp);

	return { expectedIndex, indexedReads, result };
}
