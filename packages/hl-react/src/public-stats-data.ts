import { isAddress } from "viem";
import type { HyperliquidEnv } from "./signing/types";

const STATS_DATA_BASE_URL = "https://stats-data.hyperliquid.xyz";
const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const PUBLIC_STATS_WINDOWS = ["day", "week", "month", "allTime"] as const;

export type PublicStatsWindow = (typeof PUBLIC_STATS_WINDOWS)[number];
export type PublicStatsWindowMap<T> = Readonly<Record<PublicStatsWindow, T>>;
export type PublicStatsDataset = "leaderboard" | "vaults";
export type PublicStatsDataErrorCode = "http_error" | "invalid_json" | "invalid_response" | "resource_limit";

export const PUBLIC_STATS_DATA_LIMITS = {
	leaderboard: { maximumContentLength: 64 * 1024 * 1024, maximumRows: 100_000 },
	vaults: { maximumContentLength: 32 * 1024 * 1024, maximumRows: 50_000 },
} as const;

interface CachedPublicStatsProjection {
	data: readonly unknown[];
	etag?: string;
	lastModified?: string;
}

let cachedProjectionEnv: HyperliquidEnv | null = null;
let cachedProjections: Partial<Record<PublicStatsDataset, CachedPublicStatsProjection>> = {};

export interface PublicLeaderboardPerformance {
	readonly pnl: string;
	readonly roi: string;
	readonly volume: string;
}

export interface PublicLeaderboardRow {
	readonly address: `0x${string}`;
	readonly accountValue: string;
	readonly displayName: string | null;
	readonly prize: number;
	readonly performance: PublicStatsWindowMap<PublicLeaderboardPerformance>;
}

export type PublicVaultRelationship =
	| { readonly type: "normal" | "child" }
	| { readonly type: "parent"; readonly childAddresses: readonly `0x${string}`[] };

export interface PublicVaultRow {
	readonly vaultAddress: `0x${string}`;
	readonly leader: `0x${string}`;
	readonly name: string;
	readonly tvl: string;
	readonly apr: number;
	readonly isClosed: boolean;
	readonly createTimeMillis: number;
	readonly relationship: PublicVaultRelationship;
	readonly pnlHistory: PublicStatsWindowMap<readonly string[]>;
}

export class PublicStatsDataError extends Error {
	readonly code: PublicStatsDataErrorCode;
	readonly dataset: PublicStatsDataset;
	readonly env: HyperliquidEnv;
	readonly status: number | undefined;

	constructor(
		code: PublicStatsDataErrorCode,
		dataset: PublicStatsDataset,
		env: HyperliquidEnv,
		message: string,
		options: { cause?: unknown; status?: number } = {},
	) {
		super(message, options.cause === undefined ? undefined : { cause: options.cause });
		this.name = "PublicStatsDataError";
		this.code = code;
		this.dataset = dataset;
		this.env = env;
		this.status = options.status;
	}
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(record: UnknownRecord, keys: readonly string[]): boolean {
	const actualKeys = Object.keys(record);
	return actualKeys.length === keys.length && keys.every((key) => Object.hasOwn(record, key));
}

function invalidResponse(dataset: PublicStatsDataset, env: HyperliquidEnv, path: string): never {
	throw new PublicStatsDataError(
		"invalid_response",
		dataset,
		env,
		`Invalid public Hyperliquid ${dataset} response at ${path}`,
	);
}

function normalizeAddress(
	value: unknown,
	dataset: PublicStatsDataset,
	env: HyperliquidEnv,
	path: string,
): `0x${string}` {
	if (typeof value !== "string" || !isAddress(value)) invalidResponse(dataset, env, path);
	return value.toLowerCase() as `0x${string}`;
}

function normalizeDecimalString(
	value: unknown,
	dataset: PublicStatsDataset,
	env: HyperliquidEnv,
	path: string,
): string {
	if (typeof value !== "string" || !DECIMAL_PATTERN.test(value)) invalidResponse(dataset, env, path);
	return value;
}

function normalizeFiniteNumber(value: unknown, dataset: PublicStatsDataset, env: HyperliquidEnv, path: string): number {
	if (typeof value !== "number" || !Number.isFinite(value)) invalidResponse(dataset, env, path);
	return value;
}

function normalizeWindowEntries<T>(
	value: unknown,
	dataset: PublicStatsDataset,
	env: HyperliquidEnv,
	path: string,
	normalizeValue: (value: unknown, path: string) => T,
): PublicStatsWindowMap<T> {
	if (!Array.isArray(value) || value.length !== PUBLIC_STATS_WINDOWS.length) {
		invalidResponse(dataset, env, path);
	}

	const result: Partial<Record<PublicStatsWindow, T>> = {};
	for (let index = 0; index < value.length; index += 1) {
		const entry = value[index];
		const entryPath = `${path}[${index}]`;
		if (!Array.isArray(entry) || entry.length !== 2) invalidResponse(dataset, env, entryPath);
		const window = entry[0];
		if (!PUBLIC_STATS_WINDOWS.includes(window as PublicStatsWindow)) {
			invalidResponse(dataset, env, `${entryPath}[0]`);
		}
		const normalizedWindow = window as PublicStatsWindow;
		if (Object.hasOwn(result, normalizedWindow)) invalidResponse(dataset, env, `${entryPath}[0]`);
		result[normalizedWindow] = normalizeValue(entry[1], `${entryPath}[1]`);
	}

	if (
		result.day === undefined ||
		result.week === undefined ||
		result.month === undefined ||
		result.allTime === undefined
	) {
		invalidResponse(dataset, env, path);
	}

	return {
		day: result.day,
		week: result.week,
		month: result.month,
		allTime: result.allTime,
	};
}

function normalizeLeaderboardPerformance(
	value: unknown,
	dataset: PublicStatsDataset,
	env: HyperliquidEnv,
	path: string,
): PublicLeaderboardPerformance {
	if (!isRecord(value) || !hasExactKeys(value, ["pnl", "roi", "vlm"])) invalidResponse(dataset, env, path);
	return {
		pnl: normalizeDecimalString(value.pnl, dataset, env, `${path}.pnl`),
		roi: normalizeDecimalString(value.roi, dataset, env, `${path}.roi`),
		volume: normalizeDecimalString(value.vlm, dataset, env, `${path}.vlm`),
	};
}

export function normalizePublicLeaderboard(value: unknown, env: HyperliquidEnv): readonly PublicLeaderboardRow[] {
	const dataset = "leaderboard";
	if (!isRecord(value) || !hasExactKeys(value, ["leaderboardRows"]) || !Array.isArray(value.leaderboardRows)) {
		invalidResponse(dataset, env, "$root");
	}
	if (value.leaderboardRows.length > PUBLIC_STATS_DATA_LIMITS.leaderboard.maximumRows) {
		resourceLimit(dataset, env, "leaderboardRows");
	}

	return value.leaderboardRows.map((row, index) => {
		const path = `leaderboardRows[${index}]`;
		if (
			!isRecord(row) ||
			!hasExactKeys(row, ["ethAddress", "accountValue", "windowPerformances", "prize", "displayName"])
		) {
			invalidResponse(dataset, env, path);
		}
		if (row.displayName !== null && typeof row.displayName !== "string") {
			invalidResponse(dataset, env, `${path}.displayName`);
		}

		return {
			address: normalizeAddress(row.ethAddress, dataset, env, `${path}.ethAddress`),
			accountValue: normalizeDecimalString(row.accountValue, dataset, env, `${path}.accountValue`),
			displayName: row.displayName,
			prize: normalizeFiniteNumber(row.prize, dataset, env, `${path}.prize`),
			performance: normalizeWindowEntries(
				row.windowPerformances,
				dataset,
				env,
				`${path}.windowPerformances`,
				(entry, entryPath) => normalizeLeaderboardPerformance(entry, dataset, env, entryPath),
			),
		};
	});
}

function normalizeVaultRelationship(
	value: unknown,
	dataset: PublicStatsDataset,
	env: HyperliquidEnv,
	path: string,
): PublicVaultRelationship {
	if (!isRecord(value) || typeof value.type !== "string") invalidResponse(dataset, env, path);
	if (value.type === "normal" || value.type === "child") {
		if (!hasExactKeys(value, ["type"])) invalidResponse(dataset, env, path);
		return { type: value.type };
	}
	if (value.type !== "parent" || !hasExactKeys(value, ["type", "data"]) || !isRecord(value.data)) {
		invalidResponse(dataset, env, path);
	}
	if (!hasExactKeys(value.data, ["childAddresses"]) || !Array.isArray(value.data.childAddresses)) {
		invalidResponse(dataset, env, `${path}.data`);
	}
	return {
		type: "parent",
		childAddresses: value.data.childAddresses.map((address, index) =>
			normalizeAddress(address, dataset, env, `${path}.data.childAddresses[${index}]`),
		),
	};
}

export function normalizePublicVaults(value: unknown, env: HyperliquidEnv): readonly PublicVaultRow[] {
	const dataset = "vaults";
	if (!Array.isArray(value)) invalidResponse(dataset, env, "$root");
	if (value.length > PUBLIC_STATS_DATA_LIMITS.vaults.maximumRows) resourceLimit(dataset, env, "$root");

	return value.map((row, index) => {
		const path = `vaults[${index}]`;
		if (!isRecord(row) || !hasExactKeys(row, ["apr", "pnls", "summary"]) || !isRecord(row.summary)) {
			invalidResponse(dataset, env, path);
		}
		if (
			!hasExactKeys(row.summary, [
				"name",
				"vaultAddress",
				"leader",
				"tvl",
				"isClosed",
				"relationship",
				"createTimeMillis",
			])
		) {
			invalidResponse(dataset, env, `${path}.summary`);
		}
		if (typeof row.summary.name !== "string") invalidResponse(dataset, env, `${path}.summary.name`);
		if (typeof row.summary.isClosed !== "boolean") invalidResponse(dataset, env, `${path}.summary.isClosed`);
		const createTimeMillis = normalizeFiniteNumber(
			row.summary.createTimeMillis,
			dataset,
			env,
			`${path}.summary.createTimeMillis`,
		);
		if (!Number.isSafeInteger(createTimeMillis) || createTimeMillis < 0) {
			invalidResponse(dataset, env, `${path}.summary.createTimeMillis`);
		}

		return {
			vaultAddress: normalizeAddress(row.summary.vaultAddress, dataset, env, `${path}.summary.vaultAddress`),
			leader: normalizeAddress(row.summary.leader, dataset, env, `${path}.summary.leader`),
			name: row.summary.name,
			tvl: normalizeDecimalString(row.summary.tvl, dataset, env, `${path}.summary.tvl`),
			apr: normalizeFiniteNumber(row.apr, dataset, env, `${path}.apr`),
			isClosed: row.summary.isClosed,
			createTimeMillis,
			relationship: normalizeVaultRelationship(row.summary.relationship, dataset, env, `${path}.summary.relationship`),
			pnlHistory: normalizeWindowEntries(row.pnls, dataset, env, `${path}.pnls`, (points, pointsPath) => {
				if (!Array.isArray(points)) invalidResponse(dataset, env, pointsPath);
				return points.map((point, pointIndex) =>
					normalizeDecimalString(point, dataset, env, `${pointsPath}[${pointIndex}]`),
				);
			}),
		};
	});
}

export function getPublicStatsDataUrl(env: HyperliquidEnv, dataset: PublicStatsDataset): string {
	return `${STATS_DATA_BASE_URL}/${env}/${dataset}`;
}

async function fetchPublicStatsData<T extends readonly unknown[]>(
	env: HyperliquidEnv,
	dataset: PublicStatsDataset,
	normalize: (value: unknown, env: HyperliquidEnv) => T,
	signal?: AbortSignal,
): Promise<T> {
	selectProjectionEnvironment(env);
	const cached = cachedProjections[dataset];
	const headers: Record<string, string> = {};
	if (cached?.etag) headers["If-None-Match"] = cached.etag;
	if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified;
	const response = await fetch(getPublicStatsDataUrl(env, dataset), {
		signal,
		...(Object.keys(headers).length > 0 ? { headers } : {}),
	});
	if (response.status === 304) {
		if (!cached) invalidResponse(dataset, env, "$http.304");
		return cached.data as T;
	}
	if (!response.ok) {
		throw new PublicStatsDataError(
			"http_error",
			dataset,
			env,
			`Public Hyperliquid ${dataset} request failed with HTTP ${response.status}`,
			{ status: response.status },
		);
	}
	const contentLengthHeader = response.headers?.get("content-length");
	if (contentLengthHeader !== null && contentLengthHeader !== undefined) {
		const contentLength = Number(contentLengthHeader);
		if (
			!Number.isSafeInteger(contentLength) ||
			contentLength < 0 ||
			contentLength > PUBLIC_STATS_DATA_LIMITS[dataset].maximumContentLength
		) {
			resourceLimit(dataset, env, "$http.content-length");
		}
	}

	try {
		const normalized = normalize(await readBoundedJsonResponse(response, dataset, env), env);
		if (cachedProjectionEnv === env) {
			cachedProjections[dataset] = {
				data: normalized,
				etag: response.headers?.get("etag") ?? undefined,
				lastModified: response.headers?.get("last-modified") ?? undefined,
			};
		}
		return normalized;
	} catch (cause) {
		if (cause instanceof PublicStatsDataError) throw cause;
		if (isAbortError(cause) || (signal?.aborted === true && cause === signal.reason)) throw cause;
		throw new PublicStatsDataError(
			"invalid_json",
			dataset,
			env,
			`Public Hyperliquid ${dataset} response was not valid JSON`,
			{ cause },
		);
	}
}

async function readBoundedJsonResponse(
	response: Response,
	dataset: PublicStatsDataset,
	env: HyperliquidEnv,
): Promise<unknown> {
	const maximumContentLength = PUBLIC_STATS_DATA_LIMITS[dataset].maximumContentLength;
	const body = response.body;
	if (body) {
		const reader = body.getReader();
		const chunks: Uint8Array[] = [];
		let byteLength = 0;
		try {
			while (true) {
				const result = await reader.read();
				if (result.done) break;
				const chunk = result.value;
				if (chunk.byteLength > maximumContentLength - byteLength) {
					try {
						await reader.cancel("Public stats response exceeded its byte limit");
					} catch {
						// The resource-limit result takes precedence once the oversized chunk was observed.
					}
					resourceLimit(dataset, env, "$http.body");
				}
				chunks.push(chunk);
				byteLength += chunk.byteLength;
			}
		} finally {
			reader.releaseLock();
		}
		return parseJsonBytes(concatenateBytes(chunks, byteLength));
	}

	// Real Fetch responses expose a stream, but these fallbacks keep non-streaming
	// runtimes and test doubles bounded as well.
	if (typeof response.arrayBuffer === "function") {
		const bytes = new Uint8Array(await response.arrayBuffer());
		assertBodyWithinLimit(bytes.byteLength, maximumContentLength, dataset, env);
		return parseJsonBytes(bytes);
	}
	if (typeof response.text === "function") {
		const text = await response.text();
		const bytes = new TextEncoder().encode(text);
		assertBodyWithinLimit(bytes.byteLength, maximumContentLength, dataset, env);
		return JSON.parse(text) as unknown;
	}

	const value = await response.json();
	const serialized = JSON.stringify(value);
	if (serialized === undefined) throw new SyntaxError("JSON response was undefined");
	const byteLength = new TextEncoder().encode(serialized).byteLength;
	assertBodyWithinLimit(byteLength, maximumContentLength, dataset, env);
	return value as unknown;
}

function concatenateBytes(chunks: readonly Uint8Array[], byteLength: number): Uint8Array {
	const bytes = new Uint8Array(byteLength);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}

function parseJsonBytes(bytes: Uint8Array): unknown {
	return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}

function assertBodyWithinLimit(
	byteLength: number,
	maximumContentLength: number,
	dataset: PublicStatsDataset,
	env: HyperliquidEnv,
): void {
	if (!Number.isSafeInteger(byteLength) || byteLength < 0 || byteLength > maximumContentLength) {
		resourceLimit(dataset, env, "$http.body");
	}
}

function isAbortError(cause: unknown): boolean {
	return (
		(typeof DOMException !== "undefined" && cause instanceof DOMException && cause.name === "AbortError") ||
		(isRecord(cause) && cause.name === "AbortError")
	);
}

export async function fetchPublicLeaderboard(
	env: HyperliquidEnv,
	signal?: AbortSignal,
): Promise<readonly PublicLeaderboardRow[]> {
	return fetchPublicStatsData(env, "leaderboard", normalizePublicLeaderboard, signal);
}

export async function fetchPublicVaults(env: HyperliquidEnv, signal?: AbortSignal): Promise<readonly PublicVaultRow[]> {
	return fetchPublicStatsData(env, "vaults", normalizePublicVaults, signal);
}

function resourceLimit(dataset: PublicStatsDataset, env: HyperliquidEnv, path: string): never {
	throw new PublicStatsDataError(
		"resource_limit",
		dataset,
		env,
		`Public Hyperliquid ${dataset} response exceeded the resource limit at ${path}`,
	);
}

function selectProjectionEnvironment(env: HyperliquidEnv): void {
	if (cachedProjectionEnv === env) return;
	cachedProjectionEnv = env;
	cachedProjections = {};
}

export function clearPublicStatsDataCacheForTests(): void {
	cachedProjectionEnv = null;
	cachedProjections = {};
}
