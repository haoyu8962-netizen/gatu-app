import Big from "big.js";
import type { FundingRateBucket } from "@/domain/market/funding-rate-history";

export interface FundingChartSize {
	height: number;
	width: number;
}

export interface FundingChartAxisTick {
	decimals: number;
	value: number;
	y: number;
}

export interface FundingChartTimeTick {
	time: number;
	x: number;
}

export interface FundingChartPoint {
	cumulativeY: number;
	rateY: number;
	time: number;
	x: number;
}

export interface FundingChartModel {
	cumulativePath: string;
	cumulativeTicks: FundingChartAxisTick[];
	plotBottom: number;
	plotLeft: number;
	plotRight: number;
	plotTop: number;
	points: FundingChartPoint[];
	ratePath: string;
	rateTicks: FundingChartAxisTick[];
	timeTicks: FundingChartTimeTick[];
	zeroOffset: number;
	zeroY: number;
}

interface SeriesExtent {
	max: number;
	min: number;
}

interface AxisScale {
	decimals: number;
	step: number;
}

export const FUNDING_CHART_PADDING = { bottom: 22, left: 58, right: 58, top: 10 } as const;
export const FUNDING_CHART_AXIS_INTERVALS = 4;

const EMPTY_SERIES_STEP = 0.0001;
const EXTENT_HEADROOM = 1.08;
const TIME_TICK_SPACING = 96;
const MAX_TIME_TICKS = 6;
const TOOLTIP_GAP = 12;
const TOOLTIP_INSET = 4;

/**
 * Pixel geometry for the funding history chart. The funding rate uses the left axis and the
 * cumulative rate the right axis; both scales include zero and share one zero line and one set of
 * gridlines, so the split between intervals above and below zero is chosen to fit both series.
 * Numbers are converted from decimal strings only here, for coordinates.
 */
export function buildFundingHistoryChartModel(
	buckets: readonly FundingRateBucket[],
	size: FundingChartSize,
): FundingChartModel {
	const plotLeft = FUNDING_CHART_PADDING.left;
	const plotRight = Math.max(plotLeft + 1, size.width - FUNDING_CHART_PADDING.right);
	const plotTop = FUNDING_CHART_PADDING.top;
	const plotBottom = Math.max(plotTop + 1, size.height - FUNDING_CHART_PADDING.bottom);
	const plotHeight = plotBottom - plotTop;
	const rates = buckets.map((bucket) => new Big(bucket.rate).toNumber());
	const cumulativeRates = buckets.map((bucket) => new Big(bucket.cumulativeRate).toNumber());
	const rateExtent = getExtent(rates);
	const cumulativeExtent = getExtent(cumulativeRates);
	const up = chooseIntervalsAboveZero([rateExtent, cumulativeExtent]);
	const rateScale = getAxisScale(rateExtent, up);
	const cumulativeScale = getAxisScale(cumulativeExtent, up);
	const zeroY = plotTop + (up / FUNDING_CHART_AXIS_INTERVALS) * plotHeight;

	function toY(value: number, scale: AxisScale): number {
		return plotTop + ((up * scale.step - value) / (FUNDING_CHART_AXIS_INTERVALS * scale.step)) * plotHeight;
	}

	const startTime = buckets[0]?.time ?? 0;
	const endTime = buckets.at(-1)?.time ?? startTime;
	const toX = createTimeScale(startTime, endTime, plotLeft, plotRight);
	const points = buckets.map((bucket, index) => ({
		cumulativeY: toY(cumulativeRates[index] ?? 0, cumulativeScale),
		rateY: toY(rates[index] ?? 0, rateScale),
		time: bucket.time,
		x: toX(bucket.time),
	}));

	return {
		cumulativePath: createPath(points.map((point) => [point.x, point.cumulativeY])),
		cumulativeTicks: createAxisTicks(cumulativeScale, up, toY),
		plotBottom,
		plotLeft,
		plotRight,
		plotTop,
		points,
		ratePath: createPath(points.map((point) => [point.x, point.rateY])),
		rateTicks: createAxisTicks(rateScale, up, toY),
		timeTicks: buckets.length ? createTimeTicks(startTime, endTime, plotLeft, plotRight, toX) : [],
		zeroOffset: up / FUNDING_CHART_AXIS_INTERVALS,
		zeroY,
	};
}

export function findNearestFundingPointIndex(points: readonly { x: number }[], x: number): number {
	if (points.length === 0) return -1;

	let lowerBound = 0;
	let upperBound = points.length;
	while (lowerBound < upperBound) {
		const midpoint = lowerBound + Math.floor((upperBound - lowerBound) / 2);
		if ((points[midpoint]?.x ?? 0) < x) lowerBound = midpoint + 1;
		else upperBound = midpoint;
	}

	if (lowerBound === 0) return 0;
	if (lowerBound === points.length) return points.length - 1;
	const before = points[lowerBound - 1]?.x ?? 0;
	const after = points[lowerBound]?.x ?? 0;
	return x - before <= after - x ? lowerBound - 1 : lowerBound;
}

export function getFundingTooltipLeft(anchorX: number, tooltipWidth: number, chartWidth: number): number {
	const maximumLeft = Math.max(TOOLTIP_INSET, chartWidth - tooltipWidth - TOOLTIP_INSET);
	const right = anchorX + TOOLTIP_GAP;
	const left = right + tooltipWidth <= chartWidth - TOOLTIP_INSET ? right : anchorX - TOOLTIP_GAP - tooltipWidth;
	return Math.min(Math.max(left, TOOLTIP_INSET), maximumLeft);
}

function getExtent(values: readonly number[]): SeriesExtent {
	let max = 0;
	let min = 0;
	for (const value of values) {
		if (value > max) max = value;
		if (value < min) min = value;
	}
	return { max, min };
}

function chooseIntervalsAboveZero(series: readonly SeriesExtent[]): number {
	const hasPositive = series.some((extent) => extent.max > 0);
	const hasNegative = series.some((extent) => extent.min < 0);
	let best: { balance: number; empty: number; score: number; total: number; up: number } | null = null;
	for (let up = 0; up <= FUNDING_CHART_AXIS_INTERVALS; up += 1) {
		const down = FUNDING_CHART_AXIS_INTERVALS - up;
		if ((hasPositive && up === 0) || (hasNegative && down === 0)) continue;
		const utilizations = series.map((extent) => {
			const scale = getAxisScale(extent, up);
			return (extent.max - extent.min) / (FUNDING_CHART_AXIS_INTERVALS * scale.step);
		});
		const candidate = {
			balance: Math.abs(up - FUNDING_CHART_AXIS_INTERVALS / 2),
			empty: (hasPositive ? 0 : up) + (hasNegative ? 0 : down),
			score: Math.min(...utilizations),
			total: utilizations.reduce((sum, value) => sum + value, 0),
			up,
		};
		if (!best || compareSplits(candidate, best) < 0) best = candidate;
	}
	return best?.up ?? FUNDING_CHART_AXIS_INTERVALS / 2;
}

function compareSplits(
	left: { balance: number; empty: number; score: number; total: number },
	right: { balance: number; empty: number; score: number; total: number },
): number {
	if (left.score !== right.score) return right.score - left.score;
	if (left.empty !== right.empty) return left.empty - right.empty;
	if (left.total !== right.total) return right.total - left.total;
	return left.balance - right.balance;
}

function getAxisScale(extent: SeriesExtent, up: number): AxisScale {
	const down = FUNDING_CHART_AXIS_INTERVALS - up;
	const stepAbove = up > 0 ? (extent.max * EXTENT_HEADROOM) / up : 0;
	const stepBelow = down > 0 ? (-extent.min * EXTENT_HEADROOM) / down : 0;
	const rawStep = Math.max(stepAbove, stepBelow);
	const step = rawStep > 0 ? getNiceStep(rawStep) : EMPTY_SERIES_STEP;
	return { decimals: getStepDecimals(step), step };
}

function createAxisTicks(
	scale: AxisScale,
	up: number,
	toY: (value: number, scale: AxisScale) => number,
): FundingChartAxisTick[] {
	const ticks: FundingChartAxisTick[] = [];
	for (let index = up - FUNDING_CHART_AXIS_INTERVALS; index <= up; index += 1) {
		const value = normalizeTickValue(index * scale.step, scale.decimals);
		ticks.push({ decimals: Math.max(0, scale.decimals - 2), value, y: toY(value, scale) });
	}
	return ticks;
}

function createTimeScale(startTime: number, endTime: number, plotLeft: number, plotRight: number) {
	const span = endTime - startTime;
	const width = plotRight - plotLeft;
	return (time: number) => (span === 0 ? plotLeft + width / 2 : plotLeft + ((time - startTime) / span) * width);
}

function createTimeTicks(
	startTime: number,
	endTime: number,
	plotLeft: number,
	plotRight: number,
	toX: (time: number) => number,
): FundingChartTimeTick[] {
	if (startTime === endTime) return [{ time: startTime, x: toX(startTime) }];
	const count = Math.min(Math.max(Math.floor((plotRight - plotLeft) / TIME_TICK_SPACING) + 1, 2), MAX_TIME_TICKS);
	return Array.from({ length: count }, (_, index) => {
		const time = Math.round(startTime + ((endTime - startTime) * index) / (count - 1));
		return { time, x: toX(time) };
	});
}

function createPath(coordinates: ReadonlyArray<readonly [number, number]>): string {
	if (coordinates.length < 2) return "";
	return coordinates
		.map(([x, y], index) => `${index === 0 ? "M" : "L"}${roundCoordinate(x)},${roundCoordinate(y)}`)
		.join(" ");
}

function getNiceStep(value: number): number {
	const exponent = Math.floor(Math.log10(value));
	const magnitude = 10 ** exponent;
	const fraction = value / magnitude;
	let niceFraction = 10;
	if (fraction <= 1) niceFraction = 1;
	else if (fraction <= 2) niceFraction = 2;
	else if (fraction <= 2.5) niceFraction = 2.5;
	else if (fraction <= 5) niceFraction = 5;
	return Number((niceFraction * magnitude).toPrecision(12));
}

function getStepDecimals(step: number): number {
	for (let decimals = 0; decimals <= 20; decimals += 1) {
		const scaled = step * 10 ** decimals;
		if (Math.abs(scaled - Math.round(scaled)) <= Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4) return decimals;
	}
	return 20;
}

function normalizeTickValue(value: number, decimals: number): number {
	const rounded = Number(value.toFixed(Math.min(20, decimals + 2)));
	return Object.is(rounded, -0) ? 0 : rounded;
}

function roundCoordinate(value: number): number {
	return Math.round(value * 100) / 100;
}
