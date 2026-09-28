import {
	FUNDING_HISTORY_RANGES,
	type FundingHistoryRange,
	type FundingRateBucket,
	type FundingRateBucketSummary,
} from "@/domain/market/funding-rate-history";
import { formatDateTime, formatPercent } from "@/lib/format";
import type { FundingChartModel } from "./funding-history-chart-model";

const DAY_MS = 86_400_000;

export interface FundingChartTimeLabel {
	label: string;
	time: number;
	x: number;
}

export interface FundingChartAxisLabels {
	cumulativeTicks: string[];
	rateTicks: string[];
	timeTicks: FundingChartTimeLabel[];
}

export interface FundingBucketLabels {
	cumulativeRate: string;
	rate: string;
	time: string;
}

export interface FundingSummaryLabels {
	cumulativeRate: string;
	endTime: string;
	latestRate: string;
	maxRate: string;
	minRate: string;
	startTime: string;
}

/**
 * Formatting for the funding history chart. Callers pass the interface locale and the
 * number-format revision so React Compiler recomputes the labels when either one changes; the
 * formatters read both from global state. Daily buckets are UTC days, so their dates are shown in
 * UTC; hourly and eight-hour buckets show local time.
 */
export function formatFundingChartAxisLabels(
	model: FundingChartModel,
	range: FundingHistoryRange,
	_locale: string,
	_numberFormatRevision: number,
): FundingChartAxisLabels {
	const timeTicks: FundingChartTimeLabel[] = [];
	for (const tick of model.timeTicks) {
		const label = formatDateTime(tick.time, { day: "numeric", month: "numeric", ...getRangeTimeZone(range) });
		if (timeTicks.at(-1)?.label !== label) timeTicks.push({ label, time: tick.time, x: tick.x });
	}

	return {
		cumulativeTicks: model.cumulativeTicks.map((tick) =>
			formatPercent(tick.value, { decimals: tick.decimals, signDisplay: "auto" }),
		),
		rateTicks: model.rateTicks.map((tick) =>
			formatPercent(tick.value, { decimals: tick.decimals, signDisplay: "auto" }),
		),
		timeTicks,
	};
}

export function formatFundingBucketLabels(
	bucket: FundingRateBucket,
	range: FundingHistoryRange,
	_locale: string,
	_numberFormatRevision: number,
): FundingBucketLabels {
	return {
		cumulativeRate: formatFundingRate(bucket.cumulativeRate),
		rate: formatFundingRate(bucket.rate),
		time: formatBucketTime(bucket.time, range),
	};
}

export function formatFundingSummaryLabels(
	summary: FundingRateBucketSummary,
	range: FundingHistoryRange,
	_locale: string,
	_numberFormatRevision: number,
): FundingSummaryLabels {
	return {
		cumulativeRate: formatFundingRate(summary.cumulativeRate),
		endTime: formatBucketTime(summary.endTime, range),
		latestRate: formatFundingRate(summary.latestRate),
		maxRate: formatFundingRate(summary.maxRate),
		minRate: formatFundingRate(summary.minRate),
		startTime: formatBucketTime(summary.startTime, range),
	};
}

function formatFundingRate(value: string): string {
	return formatPercent(value, { decimals: 4, signDisplay: "exceptZero" });
}

function formatBucketTime(time: number, range: FundingHistoryRange): string {
	if (FUNDING_HISTORY_RANGES[range].bucketMs >= DAY_MS) {
		return formatDateTime(time, { day: "numeric", month: "short", year: "numeric", ...getRangeTimeZone(range) });
	}
	return formatDateTime(time, { day: "numeric", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "short" });
}

function getRangeTimeZone(range: FundingHistoryRange): { timeZone?: string } {
	return FUNDING_HISTORY_RANGES[range].bucketMs >= DAY_MS ? { timeZone: "UTC" } : {};
}
