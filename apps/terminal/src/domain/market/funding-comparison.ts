import type { PredictedFundingsResponse } from "@nktkas/hyperliquid";
import type Big from "big.js";
import { type Numeric, toBig } from "@/lib/trade/numbers";

export type FundingComparisonVenue = "HlPerp" | "BinPerp" | "BybitPerp";
export type FundingComparisonCexVenue = Exclude<FundingComparisonVenue, "HlPerp">;
export type FundingComparisonPeriod = "1h" | "8h" | "1d" | "1w" | "1y";
export type FundingComparisonSortKey =
	| "market"
	| "openInterest"
	| "HlPerp"
	| "BinPerp"
	| "binanceArb"
	| "BybitPerp"
	| "bybitArb";
export type FundingComparisonSortDirection = "ascending" | "descending";
export type FundingComparisonTone = "positive" | "negative" | "neutral";
export type FundingComparisonArbDirection = "venueHigher" | "hyperliquidHigher" | "equal";

export type PredictedFundingVenueData = NonNullable<PredictedFundingsResponse[number][1][number][1]>;

export const FUNDING_COMPARISON_VENUES = [
	"HlPerp",
	"BinPerp",
	"BybitPerp",
] as const satisfies readonly FundingComparisonVenue[];
export const FUNDING_COMPARISON_CEX_VENUES = [
	"BinPerp",
	"BybitPerp",
] as const satisfies readonly FundingComparisonCexVenue[];

export const FUNDING_COMPARISON_PERIOD_HOURS = {
	"1h": 1,
	"8h": 8,
	"1d": 24,
	"1w": 168,
	"1y": 8760,
} as const satisfies Record<FundingComparisonPeriod, number>;

export const FUNDING_COMPARISON_NEUTRAL_EIGHT_HOUR_RATE = "0.0001";

const HYPERLIQUID_DEFAULT_INTERVAL_HOURS = 1;
const TONE_REFERENCE_HOURS = 8;
const DECIMAL_RATE_PATTERN = /^-?\d+(\.\d+)?$/;
const KNOWN_VENUES: ReadonlySet<string> = new Set<string>(FUNDING_COMPARISON_VENUES);
export const FUNDING_COMPARISON_ARB_VENUE_BY_SORT_KEY = {
	binanceArb: "BinPerp",
	bybitArb: "BybitPerp",
} as const satisfies Record<"binanceArb" | "bybitArb", FundingComparisonCexVenue>;

export interface FundingComparisonMarketContext {
	name: string;
	openInterest?: string;
	markPx?: string;
}

export interface FundingComparisonSourceRow {
	coin: string;
	openInterestUsd: string | null;
	hourlyRates: Readonly<Record<FundingComparisonVenue, string | null>>;
}

export interface FundingComparisonRate {
	value: string | null;
	tone: FundingComparisonTone;
}

export interface FundingComparisonArb {
	value: string;
	magnitude: string;
	direction: FundingComparisonArbDirection;
}

export interface FundingComparisonPageRow {
	coin: string;
	openInterestUsd: string | null;
	rates: Readonly<Record<FundingComparisonVenue, FundingComparisonRate>>;
	arbs: Readonly<Record<FundingComparisonCexVenue, FundingComparisonArb | null>>;
}

export interface DeriveFundingComparisonPageInput {
	rows: readonly FundingComparisonSourceRow[];
	period: FundingComparisonPeriod;
	sortKey: FundingComparisonSortKey;
	sortDirection: FundingComparisonSortDirection;
	query: string;
	page: number;
	rowsPerPage: number;
}

export interface FundingComparisonPageResult {
	rows: readonly FundingComparisonPageRow[];
	totalRows: number;
	totalPages: number;
	page: number;
	start: number;
	end: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVenueData(value: unknown): value is PredictedFundingVenueData {
	if (!isRecord(value)) return false;
	if (typeof value.fundingRate !== "string" || !DECIMAL_RATE_PATTERN.test(value.fundingRate)) return false;
	if (typeof value.nextFundingTime !== "number" || !Number.isSafeInteger(value.nextFundingTime)) return false;
	const interval = value.fundingIntervalHours;
	if (interval === undefined) return true;
	return typeof interval === "number" && Number.isSafeInteger(interval) && interval > 0;
}

function isVenueEntry(value: unknown): value is [string, PredictedFundingVenueData | null] {
	if (!Array.isArray(value) || value.length !== 2) return false;
	const [venue, data] = value;
	if (typeof venue !== "string" || venue.length === 0) return false;
	if (data === null) return true;
	if (!KNOWN_VENUES.has(venue)) return isRecord(data);
	return isVenueData(data);
}

export function parsePredictedFundings(value: unknown): PredictedFundingsResponse | null {
	if (!Array.isArray(value)) return null;
	const assets = new Set<string>();
	for (const entry of value) {
		if (!Array.isArray(entry) || entry.length !== 2) return null;
		const [asset, venues] = entry;
		if (typeof asset !== "string" || asset.length === 0 || !Array.isArray(venues)) return null;
		if (assets.has(asset)) return null;
		assets.add(asset);
		const venueNames = new Set<string>();
		for (const venueEntry of venues) {
			if (!isVenueEntry(venueEntry)) return null;
			if (venueNames.has(venueEntry[0])) return null;
			venueNames.add(venueEntry[0]);
		}
	}
	return value as PredictedFundingsResponse;
}

export function getFundingComparisonHourlyRate(
	venue: FundingComparisonVenue,
	data: PredictedFundingVenueData | null | undefined,
): string | null {
	if (!data) return null;
	const rate = toBig(data.fundingRate);
	if (!rate) return null;
	const interval =
		venue === "HlPerp" ? (data.fundingIntervalHours ?? HYPERLIQUID_DEFAULT_INTERVAL_HOURS) : data.fundingIntervalHours;
	if (interval === undefined || interval <= 0) return null;
	return rate.div(interval).toFixed();
}

export function getFundingComparisonPeriodRate(hourlyRate: Numeric, period: FundingComparisonPeriod): string | null {
	const hourly = toBig(hourlyRate);
	if (!hourly) return null;
	return hourly.times(FUNDING_COMPARISON_PERIOD_HOURS[period]).toFixed();
}

export function getFundingComparisonRateTone(hourlyRate: Numeric): FundingComparisonTone {
	const hourly = toBig(hourlyRate);
	if (!hourly) return "neutral";
	const eightHourRate = hourly.times(TONE_REFERENCE_HOURS);
	if (eightHourRate.lt(0)) return "negative";
	if (eightHourRate.gt(FUNDING_COMPARISON_NEUTRAL_EIGHT_HOUR_RATE)) return "positive";
	return "neutral";
}

export function getFundingComparisonArb(venueRate: Numeric, hyperliquidRate: Numeric): FundingComparisonArb | null {
	const venue = toBig(venueRate);
	const hyperliquid = toBig(hyperliquidRate);
	if (!venue || !hyperliquid) return null;
	const difference = venue.minus(hyperliquid);
	return {
		value: difference.toFixed(),
		magnitude: difference.abs().toFixed(),
		direction: getArbDirection(difference),
	};
}

function getArbDirection(difference: Big): FundingComparisonArbDirection {
	if (difference.gt(0)) return "venueHigher";
	if (difference.lt(0)) return "hyperliquidHigher";
	return "equal";
}

function getOpenInterestUsd(market: FundingComparisonMarketContext): string | null {
	const openInterest = toBig(market.openInterest);
	const markPx = toBig(market.markPx);
	if (!openInterest || !markPx) return null;
	return openInterest.times(markPx).toFixed();
}

export function buildFundingComparisonRows(
	snapshot: PredictedFundingsResponse,
	perpMarkets: readonly FundingComparisonMarketContext[],
): FundingComparisonSourceRow[] {
	const marketsByName = new Map(perpMarkets.map((market) => [market.name, market]));
	const rows: FundingComparisonSourceRow[] = [];
	for (const [coin, venues] of snapshot) {
		const market = marketsByName.get(coin);
		if (!market) continue;
		const venueData = new Map<string, PredictedFundingVenueData | null>(venues);
		const hasCexData = FUNDING_COMPARISON_CEX_VENUES.some((venue) => venueData.get(venue) != null);
		if (!hasCexData) continue;
		rows.push({
			coin,
			openInterestUsd: getOpenInterestUsd(market),
			hourlyRates: {
				HlPerp: getFundingComparisonHourlyRate("HlPerp", venueData.get("HlPerp")),
				BinPerp: getFundingComparisonHourlyRate("BinPerp", venueData.get("BinPerp")),
				BybitPerp: getFundingComparisonHourlyRate("BybitPerp", venueData.get("BybitPerp")),
			},
		});
	}
	return rows;
}

function toPageRow(row: FundingComparisonSourceRow, period: FundingComparisonPeriod): FundingComparisonPageRow {
	const hyperliquidRate = getFundingComparisonPeriodRate(row.hourlyRates.HlPerp, period);
	const binanceRate = getFundingComparisonPeriodRate(row.hourlyRates.BinPerp, period);
	const bybitRate = getFundingComparisonPeriodRate(row.hourlyRates.BybitPerp, period);
	return {
		coin: row.coin,
		openInterestUsd: row.openInterestUsd,
		rates: {
			HlPerp: { value: hyperliquidRate, tone: getFundingComparisonRateTone(row.hourlyRates.HlPerp) },
			BinPerp: { value: binanceRate, tone: getFundingComparisonRateTone(row.hourlyRates.BinPerp) },
			BybitPerp: { value: bybitRate, tone: getFundingComparisonRateTone(row.hourlyRates.BybitPerp) },
		},
		arbs: {
			BinPerp: getFundingComparisonArb(binanceRate, hyperliquidRate),
			BybitPerp: getFundingComparisonArb(bybitRate, hyperliquidRate),
		},
	};
}

function getSortValue(row: FundingComparisonPageRow, sortKey: Exclude<FundingComparisonSortKey, "market">): Big | null {
	if (sortKey === "openInterest") return toBig(row.openInterestUsd);
	if (sortKey === "binanceArb" || sortKey === "bybitArb") {
		return toBig(row.arbs[FUNDING_COMPARISON_ARB_VENUE_BY_SORT_KEY[sortKey]]?.magnitude);
	}
	return toBig(row.rates[sortKey].value);
}

function compareCoins(left: string, right: string): number {
	const leftKey = left.toLowerCase();
	const rightKey = right.toLowerCase();
	if (leftKey !== rightKey) return leftKey < rightKey ? -1 : 1;
	if (left === right) return 0;
	return left < right ? -1 : 1;
}

function compareRows(
	left: FundingComparisonPageRow,
	right: FundingComparisonPageRow,
	sortKey: FundingComparisonSortKey,
	direction: FundingComparisonSortDirection,
): number {
	if (sortKey === "market") {
		const compared = compareCoins(left.coin, right.coin);
		return direction === "descending" ? -compared : compared;
	}
	const leftValue = getSortValue(left, sortKey);
	const rightValue = getSortValue(right, sortKey);
	if (leftValue === null && rightValue === null) return compareCoins(left.coin, right.coin);
	if (leftValue === null) return 1;
	if (rightValue === null) return -1;
	const compared = leftValue.cmp(rightValue);
	if (compared !== 0) return direction === "descending" ? -compared : compared;
	return compareCoins(left.coin, right.coin);
}

export function normalizeFundingComparisonQuery(value: string): string {
	return value.trim().toLowerCase();
}

export function deriveFundingComparisonPage(input: DeriveFundingComparisonPageInput): FundingComparisonPageResult {
	const query = normalizeFundingComparisonQuery(input.query);
	const matchingRows = input.rows
		.filter((row) => !query || row.coin.toLowerCase().includes(query))
		.map((row) => toPageRow(row, input.period))
		.sort((left, right) => compareRows(left, right, input.sortKey, input.sortDirection));

	const totalRows = matchingRows.length;
	const totalPages = Math.max(1, Math.ceil(totalRows / input.rowsPerPage));
	const page = Math.min(Math.max(1, input.page), totalPages);
	const startIndex = (page - 1) * input.rowsPerPage;

	return {
		rows: matchingRows.slice(startIndex, startIndex + input.rowsPerPage),
		totalRows,
		totalPages,
		page,
		start: totalRows === 0 ? 0 : startIndex + 1,
		end: Math.min(startIndex + input.rowsPerPage, totalRows),
	};
}

export function toggleFundingComparisonSort(
	currentKey: FundingComparisonSortKey,
	currentDirection: FundingComparisonSortDirection,
	nextKey: FundingComparisonSortKey,
): { sortKey: FundingComparisonSortKey; sortDirection: FundingComparisonSortDirection } {
	if (currentKey !== nextKey) {
		return { sortKey: nextKey, sortDirection: nextKey === "market" ? "ascending" : "descending" };
	}
	return {
		sortKey: nextKey,
		sortDirection: currentDirection === "descending" ? "ascending" : "descending",
	};
}
