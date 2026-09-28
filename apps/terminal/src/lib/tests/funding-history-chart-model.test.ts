import { describe, expect, it } from "vitest";
import type { FundingRateBucket } from "@/domain/market/funding-rate-history";
import {
	buildFundingHistoryChartModel,
	FUNDING_CHART_AXIS_INTERVALS,
	FUNDING_CHART_PADDING,
	findNearestFundingPointIndex,
	getFundingTooltipLeft,
} from "@/lib/chart/funding-history-chart-model";

const SIZE = { height: 240, width: 640 };
const HOUR_MS = 3_600_000;

function buckets(rates: string[], cumulativeRates?: string[]): FundingRateBucket[] {
	let cumulative = 0;
	return rates.map((rate, index) => {
		cumulative += Number(rate);
		return {
			cumulativeRate: cumulativeRates?.[index] ?? String(cumulative),
			rate,
			samples: 8,
			time: 1_790_496_000_000 + index * 8 * HOUR_MS,
		};
	});
}

function valueAt(ticks: { value: number; y: number }[], y: number): number {
	const [first, second] = ticks;
	if (!first || !second) throw new Error("Need two ticks");
	return first.value + ((y - first.y) / (second.y - first.y)) * (second.value - first.value);
}

describe("buildFundingHistoryChartModel", () => {
	it("keeps zero inside both axes and shares one zero line and gridline set", () => {
		const model = buildFundingHistoryChartModel(buckets(["0.0001", "-0.00005", "0.00008"]), SIZE);

		expect(model.rateTicks).toHaveLength(FUNDING_CHART_AXIS_INTERVALS + 1);
		expect(model.rateTicks.some((tick) => tick.value === 0)).toBe(true);
		expect(model.cumulativeTicks.some((tick) => tick.value === 0)).toBe(true);
		expect(model.rateTicks.map((tick) => tick.y)).toEqual(model.cumulativeTicks.map((tick) => tick.y));
		expect(model.rateTicks.find((tick) => tick.value === 0)?.y).toBe(model.zeroY);
		expect(model.cumulativeTicks.find((tick) => tick.value === 0)?.y).toBe(model.zeroY);
		expect(model.zeroOffset).toBeGreaterThan(0);
		expect(model.zeroOffset).toBeLessThan(1);
	});

	it("draws every point inside the plot on its own axis", () => {
		const data = buckets(["0.0001", "-0.00005", "0.00008", "0.00002"]);
		const model = buildFundingHistoryChartModel(data, SIZE);

		for (const [index, point] of model.points.entries()) {
			expect(point.rateY).toBeGreaterThanOrEqual(model.plotTop);
			expect(point.rateY).toBeLessThanOrEqual(model.plotBottom);
			expect(point.cumulativeY).toBeGreaterThanOrEqual(model.plotTop);
			expect(point.cumulativeY).toBeLessThanOrEqual(model.plotBottom);
			expect(valueAt(model.rateTicks, point.rateY)).toBeCloseTo(Number(data[index]?.rate), 12);
			expect(valueAt(model.cumulativeTicks, point.cumulativeY)).toBeCloseTo(Number(data[index]?.cumulativeRate), 12);
		}
		expect(model.points.at(0)?.x).toBe(FUNDING_CHART_PADDING.left);
		expect(model.points.at(-1)?.x).toBe(SIZE.width - FUNDING_CHART_PADDING.right);
		expect(model.ratePath.startsWith("M")).toBe(true);
		expect(model.ratePath.split(" L")).toHaveLength(4);
		expect(model.cumulativePath.split(" L")).toHaveLength(4);
	});

	it("puts zero at the bottom for positive-only data and at the top for negative-only data", () => {
		const positive = buildFundingHistoryChartModel(buckets(["0.0001", "0.00002"]), SIZE);
		expect(positive.zeroOffset).toBe(1);
		expect(positive.zeroY).toBe(positive.plotBottom);
		expect(positive.rateTicks.every((tick) => tick.value >= 0)).toBe(true);

		const negative = buildFundingHistoryChartModel(buckets(["-0.0001", "-0.00002"]), SIZE);
		expect(negative.zeroOffset).toBe(0);
		expect(negative.zeroY).toBe(negative.plotTop);
		expect(negative.rateTicks.every((tick) => tick.value <= 0)).toBe(true);
	});

	it("derives percent decimals from the nice step", () => {
		const model = buildFundingHistoryChartModel(buckets(["0.0001", "0.00003"]), SIZE);
		const step = (model.rateTicks[1]?.value ?? 0) - (model.rateTicks[0]?.value ?? 0);

		expect(step).toBeCloseTo(0.00005, 12);
		expect(model.rateTicks.map((tick) => tick.decimals)).toEqual([3, 3, 3, 3, 3]);
		expect(model.rateTicks.map((tick) => tick.value)).toEqual([0, 0.00005, 0.0001, 0.00015, 0.0002]);
	});

	it("centres a single bucket and draws no path", () => {
		const model = buildFundingHistoryChartModel(buckets(["0.0001"]), SIZE);

		expect(model.points).toHaveLength(1);
		expect(model.points[0]?.x).toBe((FUNDING_CHART_PADDING.left + SIZE.width - FUNDING_CHART_PADDING.right) / 2);
		expect(model.ratePath).toBe("");
		expect(model.cumulativePath).toBe("");
		expect(model.timeTicks).toHaveLength(1);
	});

	it("keeps flat zero data on a finite scale", () => {
		const model = buildFundingHistoryChartModel(buckets(["0", "0"], ["0", "0"]), SIZE);

		expect(model.rateTicks.every((tick) => Number.isFinite(tick.y))).toBe(true);
		expect(model.points.every((point) => point.rateY === model.zeroY)).toBe(true);
	});

	it("spreads time ticks across the plot width", () => {
		const model = buildFundingHistoryChartModel(buckets(Array.from({ length: 90 }, () => "0.0001")), SIZE);

		expect(model.timeTicks.length).toBeGreaterThanOrEqual(2);
		expect(model.timeTicks.length).toBeLessThanOrEqual(6);
		expect(model.timeTicks[0]?.x).toBe(model.plotLeft);
		expect(model.timeTicks.at(-1)?.x).toBe(model.plotRight);
	});
});

describe("findNearestFundingPointIndex", () => {
	const points = [{ x: 10 }, { x: 20 }, { x: 40 }];

	it.each([
		[0, 0],
		[14, 0],
		[16, 1],
		[29, 1],
		[31, 2],
		[100, 2],
	])("maps x=%s to point %s", (x, index) => {
		expect(findNearestFundingPointIndex(points, x)).toBe(index);
	});

	it("returns -1 without points", () => {
		expect(findNearestFundingPointIndex([], 10)).toBe(-1);
	});
});

describe("getFundingTooltipLeft", () => {
	it("places the tooltip right of the pointer and flips it near the right edge", () => {
		expect(getFundingTooltipLeft(100, 200, 640)).toBe(112);
		expect(getFundingTooltipLeft(600, 200, 640)).toBe(388);
		expect(getFundingTooltipLeft(150, 200, 250)).toBe(4);
	});
});
