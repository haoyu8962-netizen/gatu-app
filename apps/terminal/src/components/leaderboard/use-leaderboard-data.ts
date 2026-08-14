import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { isAddress } from "viem";
import {
	getLeaderboardApiUrl,
	type LeaderboardApiErrorResponse,
	type LeaderboardApiQuery,
	type LeaderboardApiSuccessResponse,
} from "@/lib/leaderboard/leaderboard-api";
import type { LeaderboardRow } from "./leaderboard-domain";

export const LEADERBOARD_REQUEST_TIMEOUT_MS = 20_000;
export const LEADERBOARD_STALE_TIME_MS = 30_000;
export const LEADERBOARD_GC_TIME_MS = 5 * 60_000;
export const LEADERBOARD_STALE_REVALIDATION_DELAY_MS = 16_000;

const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const RESPONSE_KEYS = [
	"version",
	"env",
	"generatedAt",
	"stale",
	"period",
	"sortKey",
	"sortDirection",
	"query",
	"rowsPerPage",
	"rows",
	"totalRows",
	"totalPages",
	"page",
	"start",
	"end",
] as const;
const ROW_KEYS = ["rank", "address", "displayName", "accountValue", "pnl", "roi", "volume", "prize"] as const;
const ERROR_KEYS = ["error"] as const;

export type LeaderboardApiErrorCode = LeaderboardApiErrorResponse["error"];

export class LeaderboardApiError extends Error {
	readonly code: LeaderboardApiErrorCode;
	readonly status: number;

	constructor(code: LeaderboardApiErrorCode, status: number) {
		super(`Leaderboard request failed: ${code}`);
		this.name = "LeaderboardApiError";
		this.code = code;
		this.status = status;
	}
}

export class LeaderboardResponseError extends Error {
	constructor(path: string) {
		super(`Invalid leaderboard response at ${path}`);
		this.name = "LeaderboardResponseError";
	}
}

export class LeaderboardRequestTimeoutError extends Error {
	constructor() {
		super("Leaderboard request timed out");
		this.name = "LeaderboardRequestTimeoutError";
	}
}

type UnknownRecord = Record<string, unknown>;
type FetchLeaderboardOptions = {
	signal?: AbortSignal;
	fetcher?: typeof fetch;
	timeoutMs?: number;
};

function isRecord(value: unknown): value is UnknownRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(record: UnknownRecord, keys: readonly string[]): boolean {
	const actualKeys = Object.keys(record);
	return actualKeys.length === keys.length && keys.every((key) => Object.hasOwn(record, key));
}

function invalidResponse(path: string): never {
	throw new LeaderboardResponseError(path);
}

function parseSafeInteger(value: unknown, path: string, minimum: number): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) invalidResponse(path);
	return value;
}

function parseDecimal(value: unknown, path: string): string {
	if (typeof value !== "string" || !DECIMAL_PATTERN.test(value)) invalidResponse(path);
	return value;
}

function parseRow(value: unknown, path: string): LeaderboardRow {
	if (!isRecord(value) || !hasExactKeys(value, ROW_KEYS)) invalidResponse(path);
	if (typeof value.address !== "string" || !isAddress(value.address)) invalidResponse(`${path}.address`);
	if (value.displayName !== null && typeof value.displayName !== "string") invalidResponse(`${path}.displayName`);
	if (typeof value.prize !== "number" || !Number.isFinite(value.prize)) invalidResponse(`${path}.prize`);

	return {
		rank: parseSafeInteger(value.rank, `${path}.rank`, 1),
		address: value.address,
		displayName: value.displayName,
		accountValue: parseDecimal(value.accountValue, `${path}.accountValue`),
		pnl: parseDecimal(value.pnl, `${path}.pnl`),
		roi: parseDecimal(value.roi, `${path}.roi`),
		volume: parseDecimal(value.volume, `${path}.volume`),
		prize: value.prize,
	};
}

function assertResponseIdentity(record: UnknownRecord, request: LeaderboardApiQuery): void {
	if (record.version !== 1) invalidResponse("$.version");
	if (record.env !== request.env) invalidResponse("$.env");
	if (record.period !== request.period) invalidResponse("$.period");
	if (record.sortKey !== request.sortKey) invalidResponse("$.sortKey");
	if (record.sortDirection !== request.sortDirection) invalidResponse("$.sortDirection");
	if (record.query !== request.query) invalidResponse("$.query");
	if (record.rowsPerPage !== request.pageSize) invalidResponse("$.rowsPerPage");
}

export function parseLeaderboardResponse(value: unknown, request: LeaderboardApiQuery): LeaderboardApiSuccessResponse {
	if (!isRecord(value) || !hasExactKeys(value, RESPONSE_KEYS)) invalidResponse("$");
	assertResponseIdentity(value, request);
	if (typeof value.stale !== "boolean") invalidResponse("$.stale");
	if (!Array.isArray(value.rows) || value.rows.length > request.pageSize) invalidResponse("$.rows");

	const generatedAt = parseSafeInteger(value.generatedAt, "$.generatedAt", 0);
	const totalRows = parseSafeInteger(value.totalRows, "$.totalRows", 0);
	const totalPages = parseSafeInteger(value.totalPages, "$.totalPages", 1);
	const page = parseSafeInteger(value.page, "$.page", 1);
	const start = parseSafeInteger(value.start, "$.start", 0);
	const end = parseSafeInteger(value.end, "$.end", 0);
	const expectedTotalPages = Math.max(1, Math.ceil(totalRows / request.pageSize));
	if (totalPages !== expectedTotalPages || page > totalPages) invalidResponse("$.totalPages");

	const rows = value.rows.map((row, index) => parseRow(row, `$.rows[${index}]`));
	if (totalRows === 0) {
		if (page !== 1 || start !== 0 || end !== 0 || rows.length !== 0) invalidResponse("$.rows");
	} else {
		const expectedStart = (page - 1) * request.pageSize + 1;
		const expectedEnd = Math.min(page * request.pageSize, totalRows);
		if (start !== expectedStart || end !== expectedEnd || rows.length !== expectedEnd - expectedStart + 1) {
			invalidResponse("$.rows");
		}
		for (let index = 1; index < rows.length; index += 1) {
			if ((rows[index - 1]?.rank ?? 0) >= (rows[index]?.rank ?? 0)) invalidResponse(`$.rows[${index}].rank`);
		}
	}

	return {
		version: 1,
		env: request.env,
		generatedAt,
		stale: value.stale,
		period: request.period,
		sortKey: request.sortKey,
		sortDirection: request.sortDirection,
		query: request.query,
		rowsPerPage: request.pageSize,
		rows,
		totalRows,
		totalPages,
		page,
		start,
		end,
	};
}

function parseErrorResponse(value: unknown, status: number): LeaderboardApiError {
	if (!isRecord(value) || !hasExactKeys(value, ERROR_KEYS)) invalidResponse("$");
	if (value.error !== "invalid_request" && value.error !== "temporarily_unavailable") {
		invalidResponse("$.error");
	}
	return new LeaderboardApiError(value.error, status);
}

export async function fetchLeaderboardPage(
	request: LeaderboardApiQuery,
	options: FetchLeaderboardOptions = {},
): Promise<LeaderboardApiSuccessResponse> {
	const controller = new AbortController();
	const fetcher = options.fetcher ?? fetch;
	const timeoutMs = options.timeoutMs ?? LEADERBOARD_REQUEST_TIMEOUT_MS;
	let timedOut = false;
	const handleAbort = () => controller.abort(options.signal?.reason);
	if (options.signal?.aborted) handleAbort();
	else options.signal?.addEventListener("abort", handleAbort, { once: true });
	const timeout = globalThis.setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutMs);

	try {
		const response = await fetcher(getLeaderboardApiUrl(request), {
			cache: "no-cache",
			headers: { accept: "application/json" },
			signal: controller.signal,
		});
		let body: unknown;
		try {
			body = await response.json();
		} catch {
			invalidResponse("$");
		}
		if (!response.ok) throw parseErrorResponse(body, response.status);
		return parseLeaderboardResponse(body, request);
	} catch (error) {
		if (timedOut) throw new LeaderboardRequestTimeoutError();
		throw error;
	} finally {
		globalThis.clearTimeout(timeout);
		options.signal?.removeEventListener("abort", handleAbort);
	}
}

export function useLeaderboardData(request: LeaderboardApiQuery) {
	const staleRevalidationKeysRef = useRef(new Set<string>());
	const query = useQuery({
		queryKey: ["leaderboard", request] as const,
		queryFn: ({ signal }) => fetchLeaderboardPage(request, { signal }),
		retry: false,
		staleTime: LEADERBOARD_STALE_TIME_MS,
		gcTime: LEADERBOARD_GC_TIME_MS,
	});
	const stale = query.data?.stale;
	const staleEnv = query.data?.env;
	const staleGeneration = query.data?.generatedAt;

	useEffect(() => {
		if (!stale || staleEnv === undefined || staleGeneration === undefined || query.fetchStatus !== "idle") return;
		const staleRevalidationKey = `${staleEnv}:${staleGeneration}`;
		if (staleRevalidationKeysRef.current.has(staleRevalidationKey)) return;
		const timeout = globalThis.setTimeout(() => {
			staleRevalidationKeysRef.current.add(staleRevalidationKey);
			void query.refetch();
		}, LEADERBOARD_STALE_REVALIDATION_DELAY_MS);
		return () => globalThis.clearTimeout(timeout);
	}, [query.fetchStatus, query.refetch, stale, staleEnv, staleGeneration]);

	return query;
}
