import type {
	LeaderboardPeriod,
	LeaderboardRow,
	LeaderboardSortDirection,
	LeaderboardSortKey,
} from "@/components/leaderboard/leaderboard-domain";

export type LeaderboardApiEnv = "Mainnet" | "Testnet";

export interface LeaderboardApiQuery {
	readonly env: LeaderboardApiEnv;
	readonly period: LeaderboardPeriod;
	readonly sortKey: LeaderboardSortKey;
	readonly sortDirection: LeaderboardSortDirection;
	readonly query: string;
	readonly page: number;
	readonly pageSize: LeaderboardApiPageSize;
}

export interface LeaderboardApiSuccessResponse {
	readonly version: 1;
	readonly env: LeaderboardApiEnv;
	readonly generatedAt: number;
	readonly stale: boolean;
	readonly period: LeaderboardPeriod;
	readonly sortKey: LeaderboardSortKey;
	readonly sortDirection: LeaderboardSortDirection;
	readonly query: string;
	readonly rowsPerPage: LeaderboardApiPageSize;
	readonly rows: readonly LeaderboardRow[];
	readonly totalRows: number;
	readonly totalPages: number;
	readonly page: number;
	readonly start: number;
	readonly end: number;
}

export interface LeaderboardApiErrorResponse {
	readonly error: "invalid_request" | "temporarily_unavailable";
}

export type LeaderboardApiResponse = LeaderboardApiSuccessResponse | LeaderboardApiErrorResponse;

export const LEADERBOARD_API_PAGE_SIZES = [5, 10, 25, 50] as const;
export type LeaderboardApiPageSize = (typeof LEADERBOARD_API_PAGE_SIZES)[number];

export const LEADERBOARD_API_DEFAULTS = {
	period: "month",
	sortKey: "pnl",
	sortDirection: "descending",
	query: "",
	page: 1,
	pageSize: 10,
} as const satisfies Omit<LeaderboardApiQuery, "env">;

const LEADERBOARD_API_QUERY_KEYS = ["env", "period", "sortKey", "sortDirection", "query", "page", "pageSize"] as const;
const LEADERBOARD_API_ENVS = ["Mainnet", "Testnet"] as const;
const LEADERBOARD_PERIODS = ["day", "week", "month", "allTime"] as const;
const LEADERBOARD_SORT_KEYS = ["accountValue", "pnl", "roi", "volume"] as const;
const LEADERBOARD_SORT_DIRECTIONS = ["ascending", "descending"] as const;
const LEADERBOARD_API_MAX_PAGE = 1_000_000;
export const LEADERBOARD_API_MAX_QUERY_LENGTH = 128;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

export function parseLeaderboardApiQuery(searchParams: URLSearchParams): LeaderboardApiQuery | null {
	const allowedKeys = new Set<string>(LEADERBOARD_API_QUERY_KEYS);
	for (const key of searchParams.keys()) {
		if (!allowedKeys.has(key) || searchParams.getAll(key).length !== 1) return null;
	}

	const env = searchParams.get("env");
	if (!isOneOf(env, LEADERBOARD_API_ENVS)) return null;

	const period = parseOptionalEnum(searchParams, "period", LEADERBOARD_PERIODS, LEADERBOARD_API_DEFAULTS.period);
	const sortKey = parseOptionalEnum(searchParams, "sortKey", LEADERBOARD_SORT_KEYS, LEADERBOARD_API_DEFAULTS.sortKey);
	const sortDirection = parseOptionalEnum(
		searchParams,
		"sortDirection",
		LEADERBOARD_SORT_DIRECTIONS,
		LEADERBOARD_API_DEFAULTS.sortDirection,
	);
	const page = parseOptionalPositiveInteger(searchParams, "page", LEADERBOARD_API_DEFAULTS.page);
	const pageSize = parseOptionalPageSize(searchParams);
	const query = searchParams.get("query") ?? LEADERBOARD_API_DEFAULTS.query;

	if (
		period === null ||
		sortKey === null ||
		sortDirection === null ||
		page === null ||
		pageSize === null ||
		Array.from(query).length > LEADERBOARD_API_MAX_QUERY_LENGTH ||
		hasUnsafeQueryCharacter(query)
	) {
		return null;
	}

	return { env, period, sortKey, sortDirection, query, page, pageSize };
}

export function getLeaderboardApiUrl(query: LeaderboardApiQuery): string {
	const searchParams = new URLSearchParams({
		env: query.env,
		period: query.period,
		sortKey: query.sortKey,
		sortDirection: query.sortDirection,
		query: query.query,
		page: String(query.page),
		pageSize: String(query.pageSize),
	});
	return `/api/leaderboard?${searchParams.toString()}`;
}

function parseOptionalEnum<const T extends readonly string[]>(
	searchParams: URLSearchParams,
	key: string,
	values: T,
	fallback: T[number],
): T[number] | null {
	const value = searchParams.get(key);
	if (value === null) return fallback;
	return isOneOf(value, values) ? value : null;
}

function parseOptionalPositiveInteger(searchParams: URLSearchParams, key: string, fallback: number): number | null {
	const value = searchParams.get(key);
	if (value === null) return fallback;
	if (!POSITIVE_INTEGER_PATTERN.test(value)) return null;
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed <= LEADERBOARD_API_MAX_PAGE ? parsed : null;
}

function parseOptionalPageSize(searchParams: URLSearchParams): LeaderboardApiPageSize | null {
	const value = searchParams.get("pageSize");
	if (value === null) return LEADERBOARD_API_DEFAULTS.pageSize;
	if (!POSITIVE_INTEGER_PATTERN.test(value)) return null;
	const parsed = Number(value);
	return isOneOf(parsed, LEADERBOARD_API_PAGE_SIZES) ? parsed : null;
}

function isOneOf<const T>(value: unknown, values: readonly T[]): value is T {
	return values.some((candidate) => candidate === value);
}

function hasUnsafeQueryCharacter(value: string): boolean {
	for (const character of value) {
		const codePoint = character.codePointAt(0);
		if (codePoint !== undefined && (codePoint <= 31 || codePoint === 127)) return true;
	}
	return false;
}
