import type { UserFillsResponse, UserTwapSliceFillsResponse } from "@nktkas/hyperliquid";
import Big from "big.js";
import type { Network } from "@/lib/network";
import { fetchHistoryPageWithRetry, fetchTimeRangeHistory } from "@/lib/trade/history-pagination";
import {
	createInfoWeightPacer,
	getItemWeightedInfoRequestWeight,
	INFO_REST_WEIGHT_LIMIT_PER_MINUTE,
	type InfoWeightPacer,
	type InfoWeightPacerOptions,
} from "@/lib/trade/info-weight-pacer";

export const TWAP_SLICE_FILLS_EXPORT_LIMIT = 10_000;
/** Share of the per-IP REST budget the TWAP export may spend per minute; the rest stays with the terminal. */
export const TWAP_SLICE_FILLS_EXPORT_WEIGHT_PER_MINUTE = (INFO_REST_WEIGHT_LIMIT_PER_MINUTE * 3) / 5;
/** Largest page observed from `userTwapSliceFillsByTime`; the pacer reserves its weight before each request. */
export const TWAP_SLICE_FILLS_OBSERVED_PAGE_SIZE = 2_000;
/** Retry delay after a 429 without `Retry-After`, long enough for the per-minute budget to recover. */
export const TWAP_SLICE_FILLS_EXPORT_RATE_LIMIT_FALLBACK_MS = 60_000;

const TWAP_SLICE_FILLS_EXPORT_RESERVE_WEIGHT = getItemWeightedInfoRequestWeight(TWAP_SLICE_FILLS_OBSERVED_PAGE_SIZE);
const twapSliceFillsExportPacers = new Map<Network, InfoWeightPacer>();

const UNSIGNED_DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;
const SIGNED_DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;
const TRANSACTION_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const ACCOUNT_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function isValidUserFillHistoryItem(item: unknown): item is UserFillsResponse[number] {
	if (!isRecord(item)) return false;
	return (
		typeof item.time === "number" &&
		Number.isSafeInteger(item.time) &&
		item.time >= 0 &&
		typeof item.oid === "number" &&
		Number.isSafeInteger(item.oid) &&
		item.oid >= 0 &&
		typeof item.tid === "number" &&
		Number.isSafeInteger(item.tid) &&
		item.tid >= 0 &&
		typeof item.coin === "string" &&
		item.coin.length > 0 &&
		typeof item.hash === "string" &&
		TRANSACTION_HASH_PATTERN.test(item.hash) &&
		typeof item.px === "string" &&
		UNSIGNED_DECIMAL_PATTERN.test(item.px) &&
		typeof item.sz === "string" &&
		UNSIGNED_DECIMAL_PATTERN.test(item.sz) &&
		typeof item.startPosition === "string" &&
		SIGNED_DECIMAL_PATTERN.test(item.startPosition) &&
		typeof item.closedPnl === "string" &&
		SIGNED_DECIMAL_PATTERN.test(item.closedPnl) &&
		typeof item.fee === "string" &&
		SIGNED_DECIMAL_PATTERN.test(item.fee) &&
		typeof item.feeToken === "string" &&
		item.feeToken.length > 0 &&
		typeof item.dir === "string" &&
		item.dir.length > 0 &&
		typeof item.crossed === "boolean" &&
		(item.side === "A" || item.side === "B") &&
		isValidUserFillLiquidation(item.liquidation) &&
		(item.twapId === null || (typeof item.twapId === "number" && Number.isSafeInteger(item.twapId) && item.twapId >= 0))
	);
}

function isValidUserFillLiquidation(value: unknown): boolean {
	if (value === undefined) return true;
	if (!isRecord(value)) return false;
	return (
		typeof value.markPx === "string" &&
		UNSIGNED_DECIMAL_PATTERN.test(value.markPx) &&
		(value.method === "market" || value.method === "backstop") &&
		(value.liquidatedUser === undefined ||
			(typeof value.liquidatedUser === "string" && ACCOUNT_ADDRESS_PATTERN.test(value.liquidatedUser)))
	);
}

export function filterNonTwapUserFills(fills: UserFillsResponse): UserFillsResponse {
	return fills.filter((fill) => fill.twapId === null);
}

export function getUserFillKey(fill: UserFillsResponse[number]): string {
	return `${fill.time}:${fill.coin}:${fill.tid}`;
}

export function isValidUserTwapSliceFillHistoryItem(item: unknown): item is UserTwapSliceFillsResponse[number] {
	if (!isRecord(item)) return false;
	return (
		typeof item.twapId === "number" &&
		Number.isSafeInteger(item.twapId) &&
		item.twapId >= 0 &&
		isValidUserFillHistoryItem(item.fill)
	);
}

export function getUserTwapSliceFillKey(entry: UserTwapSliceFillsResponse[number]): string {
	return getUserFillKey(entry.fill);
}

export function normalizeUserTwapSliceFills(entries: UserTwapSliceFillsResponse): UserFillsResponse {
	return entries.map((entry) => ({ ...entry.fill, twapId: entry.twapId }));
}

export interface UserTwapSliceFillHistoryResult {
	items: UserFillsResponse;
	truncated: boolean;
}

export function createTwapSliceFillsExportPacer(
	options: Pick<InfoWeightPacerOptions, "now" | "wait"> = {},
): InfoWeightPacer {
	return createInfoWeightPacer({
		...options,
		reserveWeight: TWAP_SLICE_FILLS_EXPORT_RESERVE_WEIGHT,
		weightPerWindow: TWAP_SLICE_FILLS_EXPORT_WEIGHT_PER_MINUTE,
	});
}

/**
 * Returns the export pacer of one request target, the network's API host. It lives as long as the
 * tab, so weight recorded by an earlier export, whether it finished, failed or was aborted, still
 * counts against the next one and the per-minute share holds across exports.
 */
export function getTwapSliceFillsExportPacer(network: Network): InfoWeightPacer {
	const existingPacer = twapSliceFillsExportPacers.get(network);
	if (existingPacer) return existingPacer;
	const pacer = createTwapSliceFillsExportPacer();
	twapSliceFillsExportPacers.set(network, pacer);
	return pacer;
}

export function clearTwapSliceFillsExportPacersForTests(): void {
	twapSliceFillsExportPacers.clear();
}

interface FetchUserTwapSliceFillHistoryOptions {
	endTime: number;
	maxPages?: number;
	pacer: InfoWeightPacer;
	signal: AbortSignal;
}

/**
 * Walks `userTwapSliceFillsByTime` forward from the epoch. The page size of this endpoint is not
 * documented, so paging ends on an empty or overlap-only page instead of on a short page, and an
 * out-of-order page fails closed. Only the latest {@link TWAP_SLICE_FILLS_EXPORT_LIMIT} fills are kept.
 * Every attempt, retries included, waits for room in `pacer` and is recorded against it: a returned
 * page at its item-weighted cost, any other outcome at the full-page reserve, since the server may
 * have counted it. A 408, 429 or 5xx attempt is retried up to three times, and a 429 without
 * `Retry-After` waits {@link TWAP_SLICE_FILLS_EXPORT_RATE_LIMIT_FALLBACK_MS}.
 */
export async function fetchUserTwapSliceFillHistory(
	requestPage: (startTime: number, endTime: number, signal: AbortSignal) => Promise<UserTwapSliceFillsResponse>,
	options: FetchUserTwapSliceFillHistoryOptions,
): Promise<UserTwapSliceFillHistoryResult> {
	const { pacer } = options;

	async function requestPacedPage(startTime: number, endTime: number, signal: AbortSignal) {
		await pacer.acquire(signal);
		let weight = TWAP_SLICE_FILLS_EXPORT_RESERVE_WEIGHT;
		try {
			const page = await requestPage(startTime, endTime, signal);
			weight = getItemWeightedInfoRequestWeight(Array.isArray(page) ? page.length : 0);
			return page;
		} finally {
			pacer.record(weight);
		}
	}

	const result = await fetchTimeRangeHistory({
		endTime: options.endTime,
		fetchPage: (startTime, endTime, signal) =>
			fetchHistoryPageWithRetry((requestSignal) => requestPacedPage(startTime, endTime, requestSignal), {
				rateLimitFallbackMs: TWAP_SLICE_FILLS_EXPORT_RATE_LIMIT_FALLBACK_MS,
				signal,
			}),
		getKey: getUserTwapSliceFillKey,
		getTime: (entry: UserTwapSliceFillsResponse[number]) => entry.fill.time,
		...(options.maxPages === undefined ? {} : { maxPages: options.maxPages }),
		requireAscending: true,
		retainLatestItems: TWAP_SLICE_FILLS_EXPORT_LIMIT,
		signal: options.signal,
		validateItem: isValidUserTwapSliceFillHistoryItem,
	});
	return {
		items: normalizeUserTwapSliceFills(result.items),
		truncated: result.truncated || result.items.length >= TWAP_SLICE_FILLS_EXPORT_LIMIT,
	};
}

export function getUserFillNotional(fill: UserFillsResponse[number]): string | null {
	try {
		return new Big(fill.px).times(fill.sz).toString();
	} catch {
		return null;
	}
}

export function hasUserFillExplorerTransaction(fill: UserFillsResponse[number]): boolean {
	return !/^0x0{64}$/i.test(fill.hash);
}

export function mergeUserFillSources(...sources: ReadonlyArray<UserFillsResponse | undefined>): UserFillsResponse {
	const fillsById = new Map<string, UserFillsResponse[number]>();

	for (const source of sources) {
		for (const fill of source ?? []) {
			fillsById.set(getUserFillKey(fill), fill);
		}
	}

	return [...fillsById.values()].sort((a, b) => b.time - a.time);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
