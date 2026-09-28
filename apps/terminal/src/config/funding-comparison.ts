import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type {
	FundingComparisonPeriod,
	FundingComparisonSortKey,
	FundingComparisonVenue,
} from "@/domain/market/funding-comparison";

export const FUNDING_COMPARISON_DEFAULT_PERIOD: FundingComparisonPeriod = "8h";
export const FUNDING_COMPARISON_DEFAULT_SORT_KEY: FundingComparisonSortKey = "openInterest";
export const FUNDING_COMPARISON_ROWS_PER_PAGE_OPTIONS = [10, 25, 50] as const;
export type FundingComparisonRowsPerPage = (typeof FUNDING_COMPARISON_ROWS_PER_PAGE_OPTIONS)[number];
export const FUNDING_COMPARISON_DEFAULT_ROWS_PER_PAGE: FundingComparisonRowsPerPage = 25;
export const FUNDING_COMPARISON_MISSING_VALUE = "--";

export const FUNDING_COMPARISON_QUERY_OPTIONS = {
	requestTimeoutMs: 10_000,
	staleTime: 30_000,
	refetchInterval: 60_000,
	retry: 1,
} as const;

export const FUNDING_COMPARISON_MAX_SNAPSHOT_AGE_MS = FUNDING_COMPARISON_QUERY_OPTIONS.refetchInterval * 2;

export const FUNDING_COMPARISON_RATE_FORMAT = {
	minimumFractionDigits: 4,
	maximumFractionDigits: 4,
} as const;

export const FUNDING_COMPARISON_PERIOD_OPTIONS: readonly {
	value: FundingComparisonPeriod;
	label: MessageDescriptor;
}[] = [
	{ value: "1h", label: msg`Hourly` },
	{ value: "8h", label: msg`8 Hours` },
	{ value: "1d", label: msg`Day` },
	{ value: "1w", label: msg`Week` },
	{ value: "1y", label: msg`Year` },
];

export const FUNDING_COMPARISON_VENUE_NAMES: Readonly<Record<FundingComparisonVenue, string>> = {
	HlPerp: "Hyperliquid",
	BinPerp: "Binance",
	BybitPerp: "Bybit",
};

export const FUNDING_COMPARISON_COLUMN_LABELS: Readonly<
	Record<Exclude<FundingComparisonSortKey, FundingComparisonVenue>, MessageDescriptor>
> = {
	market: msg`Market`,
	openInterest: msg`Hyperliquid OI`,
	binanceArb: msg`Binance-HL Arb`,
	bybitArb: msg`Bybit-HL Arb`,
};

export const FUNDING_COMPARISON_SORT_KEYS: readonly FundingComparisonSortKey[] = [
	"market",
	"openInterest",
	"HlPerp",
	"BinPerp",
	"binanceArb",
	"BybitPerp",
	"bybitArb",
];
