import type { MetaResponse, PerpDexsResponse, SpotMetaResponse } from "@nktkas/hyperliquid";

export type MarketCatalogQueryStatus = "pending" | "error" | "success";
export type MarketCatalogFetchStatus = "fetching" | "paused" | "idle";

export interface MarketCatalogQuery<TData> {
	readonly data: TData | undefined;
	readonly status: MarketCatalogQueryStatus;
	readonly fetchStatus: MarketCatalogFetchStatus;
	readonly error: Error | null;
	readonly isStale: boolean;
	readonly refetch: () => Promise<unknown>;
}

export interface MarketCatalogQueries {
	readonly spotMeta: MarketCatalogQuery<SpotMetaResponse>;
	readonly perpDexs: MarketCatalogQuery<PerpDexsResponse>;
	readonly allPerpMetas: MarketCatalogQuery<MetaResponse[]>;
}

interface MarketCatalogStateBase {
	readonly canResolveNotFound: boolean;
	readonly isRefreshing: boolean;
	readonly isRestoring: boolean;
	readonly isPaused: boolean;
	readonly isStale: boolean;
	readonly error: Error | null;
}

export type MarketCatalogState =
	| (MarketCatalogStateBase & {
			readonly status: "restoring";
			readonly canResolveNotFound: false;
	  })
	| (MarketCatalogStateBase & {
			readonly status: "loading";
			readonly canResolveNotFound: false;
	  })
	| (MarketCatalogStateBase & {
			readonly status: "paused";
			readonly canResolveNotFound: false;
	  })
	| (MarketCatalogStateBase & {
			readonly status: "error";
			readonly canResolveNotFound: false;
			readonly error: Error;
	  })
	| (MarketCatalogStateBase & {
			readonly status: "ready";
	  });

interface CreateMarketCatalogStateParams {
	readonly isRestoring: boolean;
	readonly hasUsableMarkets: boolean;
	readonly queries: MarketCatalogQueries;
}

const INVALID_CATALOG_ERROR = new Error("Market catalog response is incomplete");

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSpotMetaValid(value: unknown): value is SpotMetaResponse {
	return isRecord(value) && Array.isArray(value.tokens) && Array.isArray(value.universe);
}

function isPerpMetaValid(value: unknown): value is MetaResponse {
	return isRecord(value) && Array.isArray(value.universe) && Array.isArray(value.marginTables);
}

function areAllPerpMetasValid(value: unknown): value is MetaResponse[] {
	return Array.isArray(value) && value.length > 0 && value.every(isPerpMetaValid);
}

function arePerpDexsValid(value: unknown): value is PerpDexsResponse {
	return Array.isArray(value);
}

function hasCompleteCatalogData(queries: MarketCatalogQueries): boolean {
	const { spotMeta, perpDexs, allPerpMetas } = queries;
	if (!isSpotMetaValid(spotMeta.data)) return false;
	if (!areAllPerpMetasValid(allPerpMetas.data)) return false;
	if (!arePerpDexsValid(perpDexs.data)) return false;
	return perpDexs.data.length >= allPerpMetas.data.length;
}

function getQueryList(queries: MarketCatalogQueries) {
	return [queries.spotMeta, queries.perpDexs, queries.allPerpMetas] as const;
}

function getFirstQueryError(queries: MarketCatalogQueries): Error | null {
	for (const query of getQueryList(queries)) {
		if (query.status === "error" && query.error) return query.error;
	}
	return null;
}

function getFirstIdleQueryError(queries: MarketCatalogQueries): Error | null {
	for (const query of getQueryList(queries)) {
		if (query.status === "error" && query.fetchStatus === "idle" && query.error) return query.error;
	}
	return null;
}

function isCatalogAuthoritative(isRestoring: boolean, queries: MarketCatalogQueries): boolean {
	if (isRestoring || !hasCompleteCatalogData(queries)) return false;
	return getQueryList(queries).every(
		(query) => query.status === "success" && query.fetchStatus === "idle" && !query.isStale,
	);
}

export function createMarketCatalogState({
	isRestoring,
	hasUsableMarkets,
	queries,
}: CreateMarketCatalogStateParams): MarketCatalogState {
	const queryList = getQueryList(queries);
	const hasCompleteData = hasCompleteCatalogData(queries);
	const isPaused = queryList.some((query) => query.fetchStatus === "paused");
	const isRefreshing =
		(hasUsableMarkets || hasCompleteData) && queryList.some((query) => query.fetchStatus === "fetching");
	const firstError = getFirstQueryError(queries);
	const firstIdleError = getFirstIdleQueryError(queries);
	const isStale = queryList.some((query) => query.isStale || query.status !== "success") || !hasCompleteData;

	if (hasUsableMarkets || hasCompleteData) {
		return {
			status: "ready",
			canResolveNotFound: isCatalogAuthoritative(isRestoring, queries),
			isRefreshing,
			isRestoring,
			isPaused,
			isStale,
			error: firstError,
		};
	}

	if (isRestoring) {
		return {
			status: "restoring",
			canResolveNotFound: false,
			isRefreshing,
			isRestoring,
			isPaused,
			isStale: true,
			error: null,
		};
	}

	if (firstIdleError) {
		return {
			status: "error",
			canResolveNotFound: false,
			isRefreshing,
			isRestoring,
			isPaused,
			isStale: true,
			error: firstIdleError,
		};
	}

	if (queryList.some((query) => query.fetchStatus === "paused")) {
		return {
			status: "paused",
			canResolveNotFound: false,
			isRefreshing: false,
			isRestoring,
			isPaused: true,
			isStale: true,
			error: null,
		};
	}

	if (queryList.some((query) => query.status === "pending" || query.fetchStatus === "fetching")) {
		return {
			status: "loading",
			canResolveNotFound: false,
			isRefreshing,
			isRestoring,
			isPaused,
			isStale: true,
			error: null,
		};
	}

	if (firstError) {
		return {
			status: "error",
			canResolveNotFound: false,
			isRefreshing,
			isRestoring,
			isPaused,
			isStale: true,
			error: firstError,
		};
	}

	return {
		status: "error",
		canResolveNotFound: false,
		isRefreshing: false,
		isRestoring,
		isPaused: false,
		isStale: true,
		error: INVALID_CATALOG_ERROR,
	};
}

export function getRetryableMarketCatalogQueries(queries: MarketCatalogQueries) {
	const isRetryable = (query: MarketCatalogQuery<unknown>, isValid: boolean) =>
		query.fetchStatus !== "fetching" && (query.status === "error" || !isValid || query.isStale);
	const retryable: MarketCatalogQuery<unknown>[] = [];
	if (isRetryable(queries.spotMeta, isSpotMetaValid(queries.spotMeta.data))) retryable.push(queries.spotMeta);
	if (isRetryable(queries.perpDexs, arePerpDexsValid(queries.perpDexs.data))) retryable.push(queries.perpDexs);
	if (isRetryable(queries.allPerpMetas, areAllPerpMetasValid(queries.allPerpMetas.data))) {
		retryable.push(queries.allPerpMetas);
	}
	if (
		queries.perpDexs.data &&
		queries.allPerpMetas.data &&
		queries.perpDexs.data.length < queries.allPerpMetas.data.length
	) {
		if (!retryable.includes(queries.perpDexs)) retryable.push(queries.perpDexs);
		if (!retryable.includes(queries.allPerpMetas)) retryable.push(queries.allPerpMetas);
	}
	return retryable;
}
