import type { MetaResponse, PerpDexsResponse, SpotMetaResponse } from "@nktkas/hyperliquid";
import { describe, expect, it, vi } from "vitest";
import {
	areAllPerpMetasValid,
	arePerpDexsValid,
	createMarketCatalogState,
	getRetryableMarketCatalogQueries,
	isSpotMetaValid,
	type MarketCatalogQueries,
	type MarketCatalogQuery,
} from "@/lib/hyperliquid/markets/market-catalog-state";

const SPOT_META = {
	tokens: [
		{
			name: "USDC",
			szDecimals: 2,
			weiDecimals: 6,
			index: 0,
			tokenId: "0x00000000000000000000000000000000",
			isCanonical: true,
			evmContract: null,
			fullName: "USD Coin",
			deployerTradingFeeShare: "0",
		},
	],
	universe: [],
} as SpotMetaResponse;
const ALL_PERP_METAS = [{ universe: [], marginTables: [], collateralToken: 0 }] as MetaResponse[];
const PERP_DEXS = [null] as unknown as PerpDexsResponse;

function createQuery<T>(data: T | undefined, overrides: Partial<MarketCatalogQuery<T>> = {}): MarketCatalogQuery<T> {
	return {
		data,
		status: data === undefined ? "pending" : "success",
		fetchStatus: data === undefined ? "fetching" : "idle",
		error: null,
		isStale: false,
		refetch: vi.fn(async () => undefined),
		...overrides,
	};
}

function createQueries(overrides: Partial<MarketCatalogQueries> = {}): MarketCatalogQueries {
	return {
		spotMeta: createQuery(SPOT_META),
		perpDexs: createQuery(PERP_DEXS),
		allPerpMetas: createQuery(ALL_PERP_METAS),
		...overrides,
	};
}

describe("market catalog state", () => {
	it("rejects nested catalog corruption before market construction", () => {
		expect(isSpotMetaValid({ tokens: [null], universe: [] })).toBe(false);
		expect(
			isSpotMetaValid({
				tokens: [],
				universe: [{ name: "@1", tokens: [1, 0], index: 1, isCanonical: true }],
			}),
		).toBe(false);
		expect(areAllPerpMetasValid([{ universe: [null], marginTables: [], collateralToken: 0 }])).toBe(false);
		expect(arePerpDexsValid([null, null])).toBe(false);
		expect(arePerpDexsValid([null, { name: "test" }])).toBe(true);
	});

	it("keeps an empty catalog in restoring state until persistence finishes", () => {
		const queries = createQueries({
			spotMeta: createQuery<SpotMetaResponse>(undefined),
			perpDexs: createQuery<PerpDexsResponse>(undefined),
			allPerpMetas: createQuery<MetaResponse[]>(undefined),
		});

		expect(createMarketCatalogState({ isRestoring: true, hasUsableMarkets: false, queries })).toMatchObject({
			status: "restoring",
			canResolveNotFound: false,
		});
	});

	it("distinguishes an active initial request from a paused request", () => {
		const loadingQueries = createQueries({
			spotMeta: createQuery<SpotMetaResponse>(undefined),
		});
		const pausedQueries = createQueries({
			spotMeta: createQuery<SpotMetaResponse>(undefined, { fetchStatus: "paused" }),
		});

		expect(
			createMarketCatalogState({ isRestoring: false, hasUsableMarkets: false, queries: loadingQueries }).status,
		).toBe("loading");
		expect(
			createMarketCatalogState({ isRestoring: false, hasUsableMarkets: false, queries: pausedQueries }).status,
		).toBe("paused");
	});

	it("keeps a failed query paused while the network is offline", () => {
		const queries = createQueries({
			spotMeta: createQuery<SpotMetaResponse>(undefined, {
				status: "error",
				fetchStatus: "paused",
				error: new Error("offline"),
			}),
		});

		expect(createMarketCatalogState({ isRestoring: false, hasUsableMarkets: false, queries })).toMatchObject({
			status: "paused",
			isPaused: true,
			canResolveNotFound: false,
		});
	});

	it("exposes a terminal error instead of treating a failed query as loading", () => {
		const error = new Error("catalog unavailable");
		const queries = createQueries({
			spotMeta: createQuery<SpotMetaResponse>(undefined, { status: "error", fetchStatus: "idle", error }),
		});

		expect(createMarketCatalogState({ isRestoring: false, hasUsableMarkets: false, queries })).toMatchObject({
			status: "error",
			canResolveNotFound: false,
			error,
		});
	});

	it("shows a real loading state while an explicit retry is in flight", () => {
		const queries = createQueries({
			spotMeta: createQuery<SpotMetaResponse>(undefined, {
				status: "error",
				fetchStatus: "fetching",
				error: new Error("previous request failed"),
			}),
		});

		expect(createMarketCatalogState({ isRestoring: false, hasUsableMarkets: false, queries })).toMatchObject({
			status: "loading",
			canResolveNotFound: false,
		});
	});

	it("keeps usable identity data ready while another source refresh fails", () => {
		const error = new Error("spot refresh failed");
		const queries = createQueries({
			spotMeta: createQuery(SPOT_META, { status: "error", error, isStale: true }),
		});

		expect(createMarketCatalogState({ isRestoring: false, hasUsableMarkets: true, queries })).toMatchObject({
			status: "ready",
			canResolveNotFound: false,
			isRestoring: false,
			isPaused: false,
			isStale: true,
			error,
		});
	});

	it("keeps persistence restoration visible when partial cached data makes the catalog ready", () => {
		const queries = createQueries({
			perpDexs: createQuery<PerpDexsResponse>(undefined),
		});

		expect(createMarketCatalogState({ isRestoring: true, hasUsableMarkets: true, queries })).toMatchObject({
			status: "ready",
			canResolveNotFound: false,
			isRestoring: true,
		});
	});

	it("preserves a paused source on ready state for route-level unavailable handling", () => {
		const queries = createQueries({
			perpDexs: createQuery<PerpDexsResponse>(undefined, { fetchStatus: "paused" }),
		});

		expect(createMarketCatalogState({ isRestoring: false, hasUsableMarkets: true, queries })).toMatchObject({
			status: "ready",
			canResolveNotFound: false,
			isPaused: true,
			isRefreshing: false,
		});
	});

	it("allows not-found only after every source is fresh, successful, complete, and idle", () => {
		const fresh = createQueries();
		const stale = createQueries({ spotMeta: createQuery(SPOT_META, { isStale: true }) });
		const refreshing = createQueries({ spotMeta: createQuery(SPOT_META, { fetchStatus: "fetching" }) });

		expect(
			createMarketCatalogState({ isRestoring: false, hasUsableMarkets: false, queries: fresh }).canResolveNotFound,
		).toBe(true);
		expect(
			createMarketCatalogState({ isRestoring: false, hasUsableMarkets: false, queries: stale }).canResolveNotFound,
		).toBe(false);
		expect(
			createMarketCatalogState({ isRestoring: false, hasUsableMarkets: false, queries: refreshing }),
		).toMatchObject({ status: "ready", canResolveNotFound: false, isRefreshing: true });
	});

	it("fails closed when successful query data is structurally incomplete", () => {
		const queries = createQueries({
			spotMeta: createQuery({} as SpotMetaResponse),
		});

		expect(createMarketCatalogState({ isRestoring: false, hasUsableMarkets: false, queries })).toMatchObject({
			status: "error",
			canResolveNotFound: false,
		});
	});

	it("retries only failed, missing, invalid, or stale idle sources", () => {
		const freshSpot = createQuery(SPOT_META);
		const failedDexs = createQuery(PERP_DEXS, { status: "error", error: new Error("failed") });
		const staleMetas = createQuery(ALL_PERP_METAS, { isStale: true });
		const queries = createQueries({ spotMeta: freshSpot, perpDexs: failedDexs, allPerpMetas: staleMetas });

		expect(getRetryableMarketCatalogQueries(queries)).toEqual([failedDexs, staleMetas]);
	});

	it("does not restart a catalog source that is already fetching", () => {
		const retryingSpot = createQuery<SpotMetaResponse>(undefined, {
			status: "error",
			fetchStatus: "fetching",
			error: new Error("retrying"),
		});
		const queries = createQueries({ spotMeta: retryingSpot });

		expect(getRetryableMarketCatalogQueries(queries)).not.toContain(retryingSpot);
	});

	it("retries both sides of an invalid collateral reference", () => {
		const spotMeta = createQuery(SPOT_META);
		const allPerpMetas = createQuery([{ universe: [], marginTables: [], collateralToken: 1 }] as MetaResponse[]);
		const queries = createQueries({ spotMeta, allPerpMetas });

		expect(getRetryableMarketCatalogQueries(queries)).toEqual([spotMeta, allPerpMetas]);
	});
});
