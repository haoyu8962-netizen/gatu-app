import type { MetaResponse, PerpDexsResponse, SpotMetaResponse } from "@nktkas/hyperliquid";
import { HL_PERP_PRICE_MAX_DECIMALS, HL_PRICE_MAX_DECIMALS } from "@/config/trade";

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

function isFiniteInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value);
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
	return isFiniteInteger(value) && value >= min && value <= max;
}

function isSpotTokenValid(value: unknown): boolean {
	return (
		isRecord(value) &&
		typeof value.name === "string" &&
		value.name.length > 0 &&
		isIntegerInRange(value.szDecimals, 0, HL_PRICE_MAX_DECIMALS) &&
		isFiniteInteger(value.weiDecimals) &&
		value.weiDecimals >= 0 &&
		isFiniteInteger(value.index) &&
		typeof value.tokenId === "string" &&
		typeof value.isCanonical === "boolean" &&
		(value.fullName === null || typeof value.fullName === "string")
	);
}

function isSpotPairValid(value: unknown, tokenIndexes: ReadonlySet<number>): boolean {
	return (
		isRecord(value) &&
		typeof value.name === "string" &&
		value.name.length > 0 &&
		isFiniteInteger(value.index) &&
		typeof value.isCanonical === "boolean" &&
		Array.isArray(value.tokens) &&
		value.tokens.length === 2 &&
		value.tokens.every((tokenIndex) => isFiniteInteger(tokenIndex) && tokenIndexes.has(tokenIndex))
	);
}

export function isSpotMetaValid(value: unknown): value is SpotMetaResponse {
	if (!isRecord(value) || !Array.isArray(value.tokens) || !Array.isArray(value.universe)) return false;
	if (!value.tokens.every(isSpotTokenValid)) return false;
	const tokenIndexes = new Set<number>();
	for (const token of value.tokens) {
		if (!isRecord(token) || !isFiniteInteger(token.index) || tokenIndexes.has(token.index)) return false;
		tokenIndexes.add(token.index);
	}
	return value.universe.every((pair) => isSpotPairValid(pair, tokenIndexes));
}

function isPerpMetaValid(value: unknown): value is MetaResponse {
	if (
		!isRecord(value) ||
		!Array.isArray(value.universe) ||
		!Array.isArray(value.marginTables) ||
		!isFiniteInteger(value.collateralToken)
	) {
		return false;
	}
	return value.universe.every(
		(asset) =>
			isRecord(asset) &&
			typeof asset.name === "string" &&
			asset.name.length > 0 &&
			isIntegerInRange(asset.szDecimals, 0, HL_PERP_PRICE_MAX_DECIMALS) &&
			typeof asset.maxLeverage === "number" &&
			Number.isFinite(asset.maxLeverage) &&
			isFiniteInteger(asset.marginTableId),
	);
}

export function areAllPerpMetasValid(value: unknown): value is MetaResponse[] {
	return Array.isArray(value) && value.length > 0 && value.every(isPerpMetaValid);
}

export function arePerpDexsValid(value: unknown): value is PerpDexsResponse {
	return (
		Array.isArray(value) &&
		value.every(
			(dex, index) =>
				(index === 0 && dex === null) ||
				(index > 0 &&
					isRecord(dex) &&
					typeof dex.name === "string" &&
					dex.name.length > 0 &&
					(dex.deployerFeeScale === undefined || typeof dex.deployerFeeScale === "string")),
		)
	);
}

export function hasCompleteMarketCatalogData({
	spotMeta,
	perpDexs,
	allPerpMetas,
}: {
	spotMeta: unknown;
	perpDexs: unknown;
	allPerpMetas: unknown;
}): boolean {
	if (!isSpotMetaValid(spotMeta)) return false;
	if (!areAllPerpMetasValid(allPerpMetas)) return false;
	if (!arePerpDexsValid(perpDexs)) return false;
	if (perpDexs.length < allPerpMetas.length) return false;
	const spotTokenIndexes = new Set(spotMeta.tokens.map((token) => token.index));
	return allPerpMetas.every((meta) => spotTokenIndexes.has(meta.collateralToken));
}

function hasCompleteCatalogData(queries: MarketCatalogQueries): boolean {
	return hasCompleteMarketCatalogData({
		spotMeta: queries.spotMeta.data,
		perpDexs: queries.perpDexs.data,
		allPerpMetas: queries.allPerpMetas.data,
	});
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
	const spotMetaIsValid = isSpotMetaValid(queries.spotMeta.data);
	const perpDexsAreValid = arePerpDexsValid(queries.perpDexs.data);
	const allPerpMetasAreValid = areAllPerpMetasValid(queries.allPerpMetas.data);
	const isRetryable = (query: MarketCatalogQuery<unknown>, isValid: boolean) =>
		query.fetchStatus !== "fetching" && (query.status === "error" || !isValid || query.isStale);
	const retryable: MarketCatalogQuery<unknown>[] = [];
	if (isRetryable(queries.spotMeta, spotMetaIsValid)) retryable.push(queries.spotMeta);
	if (isRetryable(queries.perpDexs, perpDexsAreValid)) retryable.push(queries.perpDexs);
	if (isRetryable(queries.allPerpMetas, allPerpMetasAreValid)) {
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
	if (
		spotMetaIsValid &&
		perpDexsAreValid &&
		allPerpMetasAreValid &&
		queries.perpDexs.data.length >= queries.allPerpMetas.data.length &&
		!hasCompleteCatalogData(queries) &&
		queries.spotMeta.fetchStatus !== "fetching" &&
		queries.allPerpMetas.fetchStatus !== "fetching"
	) {
		if (!retryable.includes(queries.spotMeta)) retryable.push(queries.spotMeta);
		if (!retryable.includes(queries.allPerpMetas)) retryable.push(queries.allPerpMetas);
	}
	return retryable;
}
