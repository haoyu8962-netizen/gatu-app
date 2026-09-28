import type { FundingHistoryResponse, InfoClient } from "@nktkas/hyperliquid";
import { FUNDING_HISTORY_RANGES, type FundingHistoryRange } from "@/domain/market/funding-rate-history";
import {
	fetchHistoryPageWithRetry,
	fetchTimeRangeHistory,
	requireCompleteHistorySnapshot,
} from "@/lib/trade/history-pagination";

export type MarketFundingRate = FundingHistoryResponse[number];

export const MARKET_FUNDING_HISTORY_PAGE_LIMIT = 500;
export const MARKET_FUNDING_HISTORY_MAX_PAGES = 20;

const PROTOCOL_DECIMAL_PATTERN = /^-?[0-9]+(\.[0-9]+)?$/;

interface FetchMarketFundingHistoryOptions {
	coin: string;
	info: Pick<InfoClient, "fundingHistory">;
	now: number;
	range: FundingHistoryRange;
	signal: AbortSignal;
	wait?: (delayMs: number, signal: AbortSignal) => Promise<void>;
}

export function isValidMarketFundingRate(item: unknown, coin: string): item is MarketFundingRate {
	if (typeof item !== "object" || item === null) return false;
	const candidate = item as Record<string, unknown>;
	return (
		candidate.coin === coin &&
		typeof candidate.time === "number" &&
		Number.isSafeInteger(candidate.time) &&
		candidate.time >= 0 &&
		typeof candidate.fundingRate === "string" &&
		PROTOCOL_DECIMAL_PATTERN.test(candidate.fundingRate)
	);
}

/**
 * Loads the complete funding history of one market for a range window ending at `now`. The inclusive
 * `startTime` cursor walks ascending pages of up to 500 records; a truncated walk fails instead of
 * drawing a cumulative line over a partial window.
 */
export async function fetchMarketFundingHistory({
	coin,
	info,
	now,
	range,
	signal,
	wait,
}: FetchMarketFundingHistoryOptions): Promise<MarketFundingRate[]> {
	const result = await fetchTimeRangeHistory<MarketFundingRate>({
		endTime: now,
		fetchPage: (startTime, endTime, pageSignal) =>
			fetchHistoryPageWithRetry((requestSignal) => info.fundingHistory({ coin, endTime, startTime }, requestSignal), {
				signal: pageSignal,
				wait,
			}),
		getKey: (item) => String(item.time),
		getTime: (item) => item.time,
		maxPages: MARKET_FUNDING_HISTORY_MAX_PAGES,
		pageLimit: MARKET_FUNDING_HISTORY_PAGE_LIMIT,
		requireAscending: true,
		signal,
		startTime: Math.max(0, now - FUNDING_HISTORY_RANGES[range].windowMs),
		validateItem: (item) => isValidMarketFundingRate(item, coin),
	});

	return requireCompleteHistorySnapshot(result);
}
