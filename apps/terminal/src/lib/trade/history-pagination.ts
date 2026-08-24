import { getHttpStatus, getQueryRetryDelayMs } from "@/lib/query-retry";

const DEFAULT_MAX_PAGES = 200;
const DEFAULT_RATE_LIMIT_RETRIES = 3;

export interface TimeRangeHistoryResult<T> {
	items: T[];
	truncated: boolean;
}

export class IncompleteHistorySnapshotError extends Error {
	constructor() {
		super("The recent history snapshot exceeded the safe pagination limit.");
		this.name = "IncompleteHistorySnapshotError";
	}
}

export class MalformedHistoryPageError extends Error {
	constructor() {
		super("The history endpoint returned an invalid item.");
		this.name = "MalformedHistoryPageError";
	}
}

export function requireCompleteHistorySnapshot<T>(result: TimeRangeHistoryResult<T>): T[] {
	if (result.truncated) throw new IncompleteHistorySnapshotError();
	return result.items;
}

export function isIncompleteHistorySnapshotError(error: unknown): error is IncompleteHistorySnapshotError {
	return error instanceof IncompleteHistorySnapshotError;
}

export function isMalformedHistoryPageError(error: unknown): error is MalformedHistoryPageError {
	return error instanceof MalformedHistoryPageError;
}

interface FetchTimeRangeHistoryOptions<T> {
	endTime: number;
	fetchPage: (startTime: number, endTime: number, signal: AbortSignal) => Promise<readonly T[]>;
	getKey: (item: T) => string;
	getTime: (item: T) => number;
	pageLimit?: number;
	requireAscending?: boolean;
	validateItem?: (item: T) => boolean;
	maxItems?: number;
	maxPages?: number;
	/**
	 * Bounds memory while still walking the complete requested range. Unlike
	 * `maxItems`, this does not stop pagination or mark the result truncated.
	 */
	retainLatestItems?: number;
	/**
	 * Keeps matching items in addition to the latest bounded display rows. The
	 * requested time range and `maxPages` still bound the retained match set.
	 */
	retainItemsMatching?: (item: T) => boolean;
	signal: AbortSignal;
	startTime?: number;
}

interface RateLimitRetryOptions {
	maxRetries?: number;
	signal: AbortSignal;
	wait?: (delayMs: number, signal: AbortSignal) => Promise<void>;
}

function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted) throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

function isAbortError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return error.name === "AbortError" || (error.cause !== error && isAbortError(error.cause));
}

function isRetryableHistoryPageError(error: unknown): boolean {
	if (isAbortError(error)) return false;
	const status = getHttpStatus(error);
	if (status === 408 || status === 429 || (status !== null && status >= 500)) return true;
	return status === null && error instanceof Error && error.name === "HttpRequestError";
}

export function waitForHistoryRetry(delayMs: number, signal: AbortSignal): Promise<void> {
	throwIfAborted(signal);

	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			signal.removeEventListener("abort", handleAbort);
			resolve();
		}, delayMs);
		function handleAbort() {
			clearTimeout(timeout);
			reject(signal.reason ?? new DOMException("The operation was aborted.", "AbortError"));
		}
		signal.addEventListener("abort", handleAbort, { once: true });
	});
}

export async function fetchHistoryPageWithRetry<T>(
	request: (signal: AbortSignal) => Promise<T>,
	options: RateLimitRetryOptions,
): Promise<T> {
	const { maxRetries = DEFAULT_RATE_LIMIT_RETRIES, signal, wait = waitForHistoryRetry } = options;
	let retries = 0;

	while (true) {
		throwIfAborted(signal);
		try {
			return await request(signal);
		} catch (error) {
			throwIfAborted(signal);
			if (!isRetryableHistoryPageError(error) || retries >= maxRetries) throw error;
			const delayMs = getQueryRetryDelayMs(retries, error, () => 0);
			retries++;
			await wait(delayMs, signal);
		}
	}
}

/**
 * Pages Hyperliquid time-range Info endpoints using their inclusive `startTime` cursor.
 * Items at the overlap timestamp are deduplicated by protocol identity rather than dropped
 * wholesale because several events can legitimately share the same timestamp.
 */
export async function fetchTimeRangeHistory<T>(
	options: FetchTimeRangeHistoryOptions<T>,
): Promise<TimeRangeHistoryResult<T>> {
	const {
		endTime,
		fetchPage,
		getKey,
		getTime,
		pageLimit,
		requireAscending = false,
		validateItem,
		maxItems = Number.POSITIVE_INFINITY,
		maxPages = DEFAULT_MAX_PAGES,
		retainLatestItems = Number.POSITIVE_INFINITY,
		retainItemsMatching,
		signal,
		startTime: initialStartTime = 0,
	} = options;
	const itemsByKey = new Map<string, T>();
	let startTime = initialStartTime;
	let previousCursor = initialStartTime - 1;

	for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
		throwIfAborted(signal);
		const page = await fetchPage(startTime, endTime, signal);
		if (!Array.isArray(page)) throw new MalformedHistoryPageError();
		if (pageLimit !== undefined && page.length > pageLimit) throw new MalformedHistoryPageError();
		if (page.length === 0) {
			return { items: sortHistory(itemsByKey.values(), getTime), truncated: false };
		}

		let maxPageTime = previousCursor;
		let newItems = 0;
		let previousItemTime: number | undefined;
		for (const item of page) {
			if (validateItem && !validateItem(item)) throw new MalformedHistoryPageError();
			const time = getTime(item);
			if (!Number.isSafeInteger(time) || time < startTime || time > endTime) {
				throw new MalformedHistoryPageError();
			}
			if (requireAscending && previousItemTime !== undefined && time < previousItemTime) {
				throw new MalformedHistoryPageError();
			}
			previousItemTime = time;
			maxPageTime = Math.max(maxPageTime, time);
			const key = getKey(item);
			if (typeof key !== "string" || key.length === 0) throw new MalformedHistoryPageError();
			if (!itemsByKey.has(key)) newItems++;
			itemsByKey.set(key, item);
		}

		if (itemsByKey.size >= maxItems) {
			return {
				items: sortHistory(itemsByKey.values(), getTime).slice(-maxItems),
				truncated: true,
			};
		}

		retainLatestHistoryItems(itemsByKey, retainLatestItems, getKey, getTime, retainItemsMatching);
		const nextCursor = requireAscending ? (previousItemTime ?? previousCursor) : maxPageTime;

		// A repeated inclusive page with no new identities cannot advance. If it is a
		// full page, report truncation because more events may share that timestamp.
		if (newItems === 0 || nextCursor <= previousCursor) {
			return {
				items: sortHistory(itemsByKey.values(), getTime),
				truncated: page.length >= (pageLimit ?? 500),
			};
		}
		if (pageLimit !== undefined && page.length < pageLimit) {
			return { items: sortHistory(itemsByKey.values(), getTime), truncated: false };
		}

		previousCursor = nextCursor;
		startTime = nextCursor;
	}

	return { items: sortHistory(itemsByKey.values(), getTime), truncated: true };
}

function retainLatestHistoryItems<T>(
	itemsByKey: Map<string, T>,
	retainLatestItems: number,
	getKey: (item: T) => string,
	getTime: (item: T) => number,
	retainItemsMatching?: (item: T) => boolean,
): void {
	if (!Number.isFinite(retainLatestItems) || itemsByKey.size <= retainLatestItems) return;
	const sortedItems = sortHistory(itemsByKey.values(), getTime);
	const retainedItems = sortedItems.slice(-retainLatestItems);
	if (retainItemsMatching) {
		for (const item of sortedItems) {
			if (retainItemsMatching(item)) retainedItems.push(item);
		}
	}
	itemsByKey.clear();
	for (const item of retainedItems) itemsByKey.set(getKey(item), item);
}

function sortHistory<T>(items: Iterable<T>, getTime: (item: T) => number): T[] {
	return [...items].sort((left, right) => getTime(left) - getTime(right));
}
