import {
	FUNDING_HISTORY_RANGES,
	type FundingHistoryRange,
	type FundingRateBucket,
	type FundingRateBucketSummary,
} from "@/domain/market/funding-rate-history";
import { formatDateTime, type NumberFormatters } from "@/lib/format";
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
 * Formatting for the funding history chart. Callers pass the interface locale and the number
 * formatters from `useNumberFormat()`, so React Compiler recomputes the labels when the language or
 * the number format changes. Daily buckets are UTC days, so their dates are shown in UTC; hourly and
 * eight-hour buckets show local time.
 */
export function formatFundingChartAxisLabels(
	model: FundingChartModel,
	range: FundingHistoryRange,
	locale: string,
	numberFormat: NumberFormatters,
): FundingChartAxisLabels {
	const timeTicks: FundingChartTimeLabel[] = [];
	for (const tick of model.timeTicks) {
		const label = formatDateTime(tick.time, { locale, day: "numeric", month: "numeric", ...getRangeTimeZone(range) });
		if (timeTicks.at(-1)?.label !== label) timeTicks.push({ label, time: tick.time, x: tick.x });
	}

	return {
		cumulativeTicks: model.cumulativeTicks.map((tick) =>
			numberFormat.formatPercent(tick.value, { decimals: tick.decimals, signDisplay: "auto" }),
		),
		rateTicks: model.rateTicks.map((tick) =>
			numberFormat.formatPercent(tick.value, { decimals: tick.decimals, signDisplay: "auto" }),
		),
		timeTicks,
	};
}

export function formatFundingBucketLabels(
	bucket: FundingRateBucket,
	range: FundingHistoryRange,
	locale: string,
	numberFormat: NumberFormatters,
): FundingBucketLabels {
	return {
		cumulativeRate: formatFundingRate(bucket.cumulativeRate, numberFormat),
		rate: formatFundingRate(bucket.rate, numberFormat),
		time: formatBucketTime(bucket.time, range, locale),
	};
}

export function formatFundingSummaryLabels(
	summary: FundingRateBucketSummary,
	range: FundingHistoryRange,
	locale: string,
	numberFormat: NumberFormatters,
): FundingSummaryLabels {
	return {
		cumulativeRate: formatFundingRate(summary.cumulativeRate, numberFormat),
		endTime: formatBucketTime(summary.endTime, range, locale),
		latestRate: formatFundingRate(summary.latestRate, numberFormat),
		maxRate: formatFundingRate(summary.maxRate, numberFormat),
		minRate: formatFundingRate(summary.minRate, numberFormat),
		startTime: formatBucketTime(summary.startTime, range, locale),
	};
}

function formatFundingRate(value: string, numberFormat: NumberFormatters): string {
	return numberFormat.formatPercent(value, { decimals: 4, signDisplay: "exceptZero" });
}

function formatBucketTime(time: number, range: FundingHistoryRange, locale: string): string {
	if (FUNDING_HISTORY_RANGES[range].bucketMs >= DAY_MS) {
		return formatDateTime(time, {
			locale,
			day: "numeric",
			month: "short",
			year: "numeric",
			...getRangeTimeZone(range),
		});
	}
	return formatDateTime(time, {
		locale,
		day: "numeric",
		hour: "2-digit",
		hourCycle: "h23",
		minute: "2-digit",
		month: "short",
	});
}

function getRangeTimeZone(range: FundingHistoryRange): { timeZone?: string } {
	return FUNDING_HISTORY_RANGES[range].bucketMs >= DAY_MS ? { timeZone: "UTC" } : {};
}
