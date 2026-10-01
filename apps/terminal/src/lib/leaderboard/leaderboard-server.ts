import {
	getPublicStatsDataUrl,
	normalizePublicLeaderboard,
	PUBLIC_STATS_DATA_LIMITS,
	type PublicLeaderboardRow,
} from "@sairn/hl-react/public-stats-data";
import Big from "big.js";
import { isAddress } from "viem";
import {
	getLeaderboardExcludedAddresses,
	LEADERBOARD_ACCOUNT_VALUE_THRESHOLD,
	LEADERBOARD_ALL_TIME_VOLUME_THRESHOLD,
	type LeaderboardResult,
	type LeaderboardRow,
	normalizeLeaderboardQuery,
} from "@/components/leaderboard/leaderboard-domain";
import {
	type LeaderboardApiErrorResponse,
	type LeaderboardApiQuery,
	type LeaderboardApiSuccessResponse,
	parseLeaderboardApiQuery,
} from "./leaderboard-api";

export const LEADERBOARD_API_CACHE_POLICY = {
	freshForMs: 5 * 60 * 1_000,
	staleIfErrorForMs: 30 * 60 * 1_000,
	retryAfterFailureMs: 30_000,
	upstreamTimeoutMs: 15_000,
	maximumResponseBytes: 256 * 1_024,
} as const;

const MAX_SORT_INDEXES_PER_SNAPSHOT = 26;
const JSON_CONTENT_TYPE_PATTERN = /^application\/json(?:\s*;|$)/i;
const DECIMAL_CONTENT_LENGTH_PATTERN = /^(?:0|[1-9]\d*)$/;

type UpstreamDataset = "leaderboard" | "vaults";
type FetchImplementation = (input: string, init: RequestInit) => Promise<Response>;
type UpstreamProjection<T> = {
	readonly data: T;
	readonly etag: string | null;
	readonly lastModified: string | null;
};
type LoadedProjection<T> = UpstreamProjection<T> & { readonly notModified: boolean };

interface LeaderboardSnapshot {
	readonly leaderboard: UpstreamProjection<readonly PublicLeaderboardRow[]>;
	readonly vaultAddresses: UpstreamProjection<readonly string[]>;
	readonly eligibleIndexes: Uint32Array;
	readonly generatedAt: number;
	readonly checkedAt: number;
	readonly sortedIndexes: Map<string, Uint32Array>;
}

interface SnapshotResult {
	readonly snapshot: LeaderboardSnapshot;
	readonly stale: boolean;
}

interface CreateLeaderboardApiHandlerOptions {
	readonly fetch?: FetchImplementation;
	readonly now?: () => number;
	/**
	 * A long-lived process refreshes a stale snapshot in the background and answers with the old one.
	 * A Lambda invocation ends with its response and gets no reliable time afterwards, so it awaits
	 * the refresh instead; CloudFront's `stale-while-revalidate` keeps that wait off the viewer.
	 */
	readonly awaitStaleRefresh?: boolean;
}

export function createLeaderboardApiHandler(
	options: CreateLeaderboardApiHandlerOptions = {},
): (request: Request) => Promise<Response> {
	const fetchImplementation = options.fetch ?? globalThis.fetch;
	const now = options.now ?? Date.now;
	const snapshots = new Map<LeaderboardApiQuery["env"], LeaderboardSnapshot>();
	const refreshes = new Map<LeaderboardApiQuery["env"], Promise<LeaderboardSnapshot>>();
	const failedRefreshes = new Map<LeaderboardApiQuery["env"], number>();

	function startRefresh(
		env: LeaderboardApiQuery["env"],
		current: LeaderboardSnapshot | undefined,
		requestTime: number,
	): Promise<LeaderboardSnapshot> {
		const activeRefresh = refreshes.get(env);
		if (activeRefresh) return activeRefresh;

		const refresh = refreshSnapshot(fetchImplementation, env, current, requestTime)
			.then((snapshot) => {
				snapshots.set(env, snapshot);
				failedRefreshes.delete(env);
				return snapshot;
			})
			.catch((cause: unknown) => {
				failedRefreshes.set(env, getValidNow(now));
				throw cause;
			})
			.finally(() => {
				if (refreshes.get(env) === refresh) refreshes.delete(env);
			});
		refreshes.set(env, refresh);
		return refresh;
	}

	async function getSnapshot(env: LeaderboardApiQuery["env"]): Promise<SnapshotResult> {
		const requestTime = getValidNow(now);
		const current = snapshots.get(env);
		const cacheAge = current ? requestTime - current.checkedAt : Number.POSITIVE_INFINITY;
		if (current && cacheAge < LEADERBOARD_API_CACHE_POLICY.freshForMs) {
			return { snapshot: current, stale: false };
		}
		if (
			current &&
			cacheAge <= LEADERBOARD_API_CACHE_POLICY.freshForMs + LEADERBOARD_API_CACHE_POLICY.staleIfErrorForMs
		) {
			const failedAt = failedRefreshes.get(env);
			if (failedAt === undefined || requestTime - failedAt >= LEADERBOARD_API_CACHE_POLICY.retryAfterFailureMs) {
				const refresh = startRefresh(env, current, requestTime);
				if (options.awaitStaleRefresh) {
					try {
						return { snapshot: await refresh, stale: false };
					} catch {
						return { snapshot: current, stale: true };
					}
				}
				void refresh.catch(() => undefined);
			}
			return { snapshot: current, stale: true };
		}

		const failedAt = failedRefreshes.get(env);
		if (failedAt !== undefined && requestTime - failedAt < LEADERBOARD_API_CACHE_POLICY.retryAfterFailureMs) {
			throw new Error("Upstream leaderboard refresh is cooling down");
		}
		return { snapshot: await startRefresh(env, current, requestTime), stale: false };
	}

	return async function handleLeaderboardApiRequest(request: Request): Promise<Response> {
		if (request.method !== "GET") {
			return errorResponse("invalid_request", 405, { allow: "GET" });
		}

		let url: URL;
		try {
			url = new URL(request.url);
		} catch {
			return errorResponse("invalid_request", 400);
		}
		const query = parseLeaderboardApiQuery(url.searchParams);
		if (!query) return errorResponse("invalid_request", 400);

		let snapshotResult: SnapshotResult;
		try {
			snapshotResult = await getSnapshot(query.env);
		} catch {
			return errorResponse("temporarily_unavailable", 503, { "retry-after": "30" });
		}

		const result = deriveLeaderboardPage(snapshotResult.snapshot, query);
		const body: LeaderboardApiSuccessResponse = {
			version: 1,
			env: query.env,
			generatedAt: snapshotResult.snapshot.generatedAt,
			stale: snapshotResult.stale,
			period: query.period,
			sortKey: query.sortKey,
			sortDirection: query.sortDirection,
			query: query.query,
			rowsPerPage: query.pageSize,
			rows: result.rows,
			totalRows: result.totalRows,
			totalPages: result.totalPages,
			page: result.page,
			start: result.start,
			end: result.end,
		};
		try {
			return await successResponse(request, body, snapshotResult.snapshot.checkedAt);
		} catch {
			return errorResponse("temporarily_unavailable", 503, { "retry-after": "30" });
		}
	};
}

export const handleLeaderboardApiRequest = createLeaderboardApiHandler();

async function refreshSnapshot(
	fetchImplementation: FetchImplementation,
	env: LeaderboardApiQuery["env"],
	current: LeaderboardSnapshot | undefined,
	requestTime: number,
): Promise<LeaderboardSnapshot> {
	const controller = new AbortController();
	let timeout: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_resolve, reject) => {
		timeout = setTimeout(() => {
			controller.abort();
			reject(new Error("Upstream leaderboard deadline exceeded"));
		}, LEADERBOARD_API_CACHE_POLICY.upstreamTimeoutMs);
	});
	try {
		const [leaderboard, vaultAddresses] = await Promise.race([
			Promise.all([
				loadProjection(
					fetchImplementation,
					env,
					"leaderboard",
					PUBLIC_STATS_DATA_LIMITS.leaderboard.maximumContentLength,
					current?.leaderboard,
					(value) => normalizePublicLeaderboard(value, env),
					controller.signal,
				),
				loadProjection(
					fetchImplementation,
					env,
					"vaults",
					PUBLIC_STATS_DATA_LIMITS.vaults.maximumContentLength,
					current?.vaultAddresses,
					(value) => normalizeVaultAddresses(value),
					controller.signal,
				),
			]),
			deadline,
		]);

		if (current && leaderboard.notModified && vaultAddresses.notModified) {
			return {
				...current,
				leaderboard: withoutNotModified(leaderboard),
				vaultAddresses: withoutNotModified(vaultAddresses),
				checkedAt: requestTime,
			};
		}

		const leaderboardProjection = withoutNotModified(leaderboard);
		const vaultAddressProjection = withoutNotModified(vaultAddresses);
		const excludedAddresses = getLeaderboardExcludedAddresses(vaultAddressProjection.data);
		return {
			leaderboard: leaderboardProjection,
			vaultAddresses: vaultAddressProjection,
			eligibleIndexes: getEligibleIndexes(leaderboardProjection.data, excludedAddresses),
			generatedAt: requestTime,
			checkedAt: requestTime,
			sortedIndexes: new Map(),
		};
	} catch (cause) {
		controller.abort();
		throw cause;
	} finally {
		if (timeout !== undefined) clearTimeout(timeout);
	}
}

async function loadProjection<T>(
	fetchImplementation: FetchImplementation,
	env: LeaderboardApiQuery["env"],
	dataset: UpstreamDataset,
	maximumContentLength: number,
	current: UpstreamProjection<T> | undefined,
	normalize: (value: unknown) => T,
	signal: AbortSignal,
): Promise<LoadedProjection<T>> {
	const headers = new Headers({ accept: "application/json" });
	if (current?.etag) headers.set("if-none-match", current.etag);
	if (current?.lastModified) headers.set("if-modified-since", current.lastModified);

	const response = await fetchImplementation(getPublicStatsDataUrl(env, dataset), {
		method: "GET",
		headers,
		redirect: "error",
		signal,
	});
	if (response.status === 304) {
		if (!current) throw new Error("Upstream returned 304 without a cached representation");
		return {
			...current,
			etag: normalizeEtag(response.headers.get("etag")) ?? current.etag,
			lastModified: normalizeLastModified(response.headers.get("last-modified")) ?? current.lastModified,
			notModified: true,
		};
	}
	if (!response.ok) throw new Error(`Upstream ${dataset} request failed`);
	if (!JSON_CONTENT_TYPE_PATTERN.test(response.headers.get("content-type") ?? "")) {
		throw new Error(`Upstream ${dataset} response was not JSON`);
	}

	return {
		data: normalize(await readBoundedJson(response, maximumContentLength)),
		etag: normalizeEtag(response.headers.get("etag")),
		lastModified: normalizeLastModified(response.headers.get("last-modified")),
		notModified: false,
	};
}

async function readBoundedJson(response: Response, maximumContentLength: number): Promise<unknown> {
	const declaredLength = response.headers.get("content-length");
	if (declaredLength !== null) {
		if (!DECIMAL_CONTENT_LENGTH_PATTERN.test(declaredLength)) throw new Error("Invalid upstream Content-Length");
		const parsedLength = Number(declaredLength);
		if (!Number.isSafeInteger(parsedLength) || parsedLength > maximumContentLength) {
			throw new Error("Upstream response exceeded its declared byte limit");
		}
	}

	const body = response.body;
	if (!body) {
		const bytes = new Uint8Array(await response.arrayBuffer());
		if (bytes.byteLength > maximumContentLength) throw new Error("Upstream response exceeded its byte limit");
		return parseJson(bytes);
	}

	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let byteLength = 0;
	try {
		while (true) {
			const result = await reader.read();
			if (result.done) break;
			if (result.value.byteLength > maximumContentLength - byteLength) {
				await reader.cancel().catch(() => undefined);
				throw new Error("Upstream response exceeded its byte limit");
			}
			chunks.push(result.value);
			byteLength += result.value.byteLength;
		}
	} finally {
		reader.releaseLock();
	}

	const bytes = new Uint8Array(byteLength);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return parseJson(bytes);
}

function parseJson(bytes: Uint8Array): unknown {
	return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}

function normalizeVaultAddresses(value: unknown): readonly string[] {
	if (!Array.isArray(value) || value.length > PUBLIC_STATS_DATA_LIMITS.vaults.maximumRows) {
		throw new Error("Invalid upstream vault response");
	}
	return value.map((row) => {
		if (!isRecord(row) || !isRecord(row.summary) || typeof row.summary.vaultAddress !== "string") {
			throw new Error("Invalid upstream vault address");
		}
		if (!isAddress(row.summary.vaultAddress)) throw new Error("Invalid upstream vault address");
		return row.summary.vaultAddress.toLocaleLowerCase();
	});
}

function deriveLeaderboardPage(snapshot: LeaderboardSnapshot, query: LeaderboardApiQuery): LeaderboardResult {
	const sortedIndexes = getSortedIndexes(snapshot, query);
	const normalizedQuery = normalizeLeaderboardQuery(query.query);
	const matchingPositions = normalizedQuery
		? sortedIndexes.reduce<number[]>((positions, sourceIndex, sortedPosition) => {
				const row = snapshot.leaderboard.data[sourceIndex];
				if (row && matchesLeaderboardQuery(row, normalizedQuery)) positions.push(sortedPosition);
				return positions;
			}, [])
		: null;
	const totalRows = matchingPositions?.length ?? sortedIndexes.length;
	const totalPages = Math.max(1, Math.ceil(totalRows / query.pageSize));
	const page = Math.min(Math.max(1, query.page), totalPages);
	const startIndex = (page - 1) * query.pageSize;
	const endIndex = Math.min(startIndex + query.pageSize, totalRows);
	const rows: LeaderboardRow[] = [];

	for (let resultIndex = startIndex; resultIndex < endIndex; resultIndex += 1) {
		const sortedPosition = matchingPositions?.[resultIndex] ?? resultIndex;
		const sourceIndex = sortedIndexes[sortedPosition];
		const source = sourceIndex === undefined ? undefined : snapshot.leaderboard.data[sourceIndex];
		if (!source) continue;
		const performance = source.performance[query.period];
		rows.push({
			rank: sortedPosition + 1,
			address: source.address,
			displayName: source.displayName,
			accountValue: source.accountValue,
			pnl: performance.pnl,
			roi: performance.roi,
			volume: performance.volume,
			prize: source.prize,
		});
	}

	return {
		rows,
		totalRows,
		totalPages,
		page,
		start: totalRows === 0 ? 0 : startIndex + 1,
		end: endIndex,
	};
}

function getEligibleIndexes(
	rows: readonly PublicLeaderboardRow[],
	excludedAddresses: ReadonlySet<string>,
): Uint32Array {
	const indexes: number[] = [];
	for (let index = 0; index < rows.length; index += 1) {
		const row = rows[index];
		if (!row || excludedAddresses.has(row.address.toLocaleLowerCase()) || !isEligibleLeaderboardRow(row)) continue;
		indexes.push(index);
	}
	return Uint32Array.from(indexes);
}

function isEligibleLeaderboardRow(row: PublicLeaderboardRow): boolean {
	try {
		const accountValue = new Big(row.accountValue);
		const allTimeVolume = new Big(row.performance.allTime.volume);
		return !(
			accountValue.lt(LEADERBOARD_ACCOUNT_VALUE_THRESHOLD) && allTimeVolume.lt(LEADERBOARD_ALL_TIME_VOLUME_THRESHOLD)
		);
	} catch {
		return false;
	}
}

function getSortedIndexes(snapshot: LeaderboardSnapshot, query: LeaderboardApiQuery): Uint32Array {
	const key =
		query.sortKey === "accountValue"
			? [query.sortKey, query.sortDirection].join("\u0000")
			: [query.period, query.sortKey, query.sortDirection].join("\u0000");
	const cached = snapshot.sortedIndexes.get(key);
	if (cached) {
		snapshot.sortedIndexes.delete(key);
		snapshot.sortedIndexes.set(key, cached);
		return cached;
	}

	const sorted = new Uint32Array(snapshot.eligibleIndexes).sort((leftIndex, rightIndex) => {
		const left = snapshot.leaderboard.data[leftIndex];
		const right = snapshot.leaderboard.data[rightIndex];
		if (!left || !right) return leftIndex - rightIndex;
		const compared = getLeaderboardSortValue(left, query).cmp(getLeaderboardSortValue(right, query));
		if (compared !== 0) return query.sortDirection === "descending" ? -compared : compared;
		return left.address.localeCompare(right.address);
	});
	if (snapshot.sortedIndexes.size >= MAX_SORT_INDEXES_PER_SNAPSHOT) {
		const oldestKey = snapshot.sortedIndexes.keys().next().value;
		if (oldestKey !== undefined) snapshot.sortedIndexes.delete(oldestKey);
	}
	snapshot.sortedIndexes.set(key, sorted);
	return sorted;
}

function getLeaderboardSortValue(row: PublicLeaderboardRow, query: LeaderboardApiQuery): Big {
	if (query.sortKey === "accountValue") return new Big(row.accountValue);
	return new Big(row.performance[query.period][query.sortKey]);
}

function matchesLeaderboardQuery(row: PublicLeaderboardRow, query: string): boolean {
	return (
		row.address.toLocaleLowerCase().includes(query) || row.displayName?.toLocaleLowerCase().includes(query) === true
	);
}

async function successResponse(
	request: Request,
	body: LeaderboardApiSuccessResponse,
	verifiedAt: number,
): Promise<Response> {
	const serialized = JSON.stringify(body);
	if (new TextEncoder().encode(serialized).byteLength > LEADERBOARD_API_CACHE_POLICY.maximumResponseBytes) {
		return errorResponse("temporarily_unavailable", 503, { "retry-after": "30" });
	}
	const etag = await createEntityTag(serialized);
	const lastModified = new Date(verifiedAt).toUTCString();
	const headers = new Headers({
		"cache-control": body.stale
			? "public, max-age=0, s-maxage=30, stale-if-error=1800"
			: "public, max-age=60, s-maxage=300, stale-while-revalidate=60, stale-if-error=1800",
		"content-type": "application/json; charset=utf-8",
		etag,
		"last-modified": lastModified,
		vary: "Accept-Encoding",
	});
	if (body.stale) headers.set("warning", '110 - "Response is stale"');
	if (isNotModified(request.headers, etag, verifiedAt, body.stale)) {
		headers.delete("content-type");
		return new Response(null, { status: 304, headers });
	}
	return new Response(serialized, { status: 200, headers });
}

async function createEntityTag(body: string): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
	const value = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
	return `"${value}"`;
}

function isNotModified(headers: Headers, etag: string, generatedAt: number, stale: boolean): boolean {
	const ifNoneMatch = headers.get("if-none-match");
	if (ifNoneMatch !== null) {
		return ifNoneMatch.split(",").some((candidate) => {
			const normalized = candidate.trim();
			return normalized === "*" || removeWeakPrefix(normalized) === removeWeakPrefix(etag);
		});
	}
	if (stale) return false;
	const ifModifiedSince = headers.get("if-modified-since");
	if (ifModifiedSince === null) return false;
	const parsed = Date.parse(ifModifiedSince);
	return Number.isFinite(parsed) && Math.floor(generatedAt / 1_000) <= Math.floor(parsed / 1_000);
}

function removeWeakPrefix(value: string): string {
	return value.startsWith("W/") ? value.slice(2) : value;
}

function errorResponse(
	error: LeaderboardApiErrorResponse["error"],
	status: number,
	headers: HeadersInit = {},
): Response {
	const responseHeaders = new Headers(headers);
	responseHeaders.set("cache-control", "no-store");
	return Response.json({ error } satisfies LeaderboardApiErrorResponse, {
		status,
		headers: responseHeaders,
	});
}

function normalizeEtag(value: string | null): string | null {
	if (value === null) return null;
	const normalized = value.trim();
	return normalized.length > 0 && normalized.length <= 512 ? normalized : null;
}

function normalizeLastModified(value: string | null): string | null {
	if (value === null) return null;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? new Date(parsed).toUTCString() : null;
}

function withoutNotModified<T>(projection: LoadedProjection<T>): UpstreamProjection<T> {
	return {
		data: projection.data,
		etag: projection.etag,
		lastModified: projection.lastModified,
	};
}

function getValidNow(now: () => number): number {
	const value = now();
	if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid server clock");
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
