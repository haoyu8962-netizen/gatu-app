// @vitest-environment jsdom

import { infoPersistedKey } from "@gatu/hl-react/query/info";
import type { InfoClient, MetaResponse, PerpDexsResponse, SpotMetaResponse } from "@nktkas/hyperliquid";
import { dehydrate, hydrate, onlineManager, QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RQ_CACHE_BUSTER, STORAGE_KEYS } from "@/config/app";
import { RQ_CACHE_MAX_AGE_MS } from "@/config/time";
import {
	bootstrapMarketCatalog,
	startMarketCatalogBootstrap,
} from "@/lib/hyperliquid/markets/market-catalog-bootstrap";
import {
	createMarketCatalogQueryOptions,
	MARKET_CATALOG_DEXS_STALE_TIME_MS,
	MARKET_CATALOG_META_STALE_TIME_MS,
} from "@/lib/hyperliquid/markets/market-catalog-query";

const mocks = vi.hoisted(() => ({
	getMarketCatalogInfoClient: vi.fn(),
	network: "mainnet" as "mainnet" | "testnet",
}));

vi.mock("@/lib/hyperliquid/markets/market-catalog-info-client", () => ({
	getMarketCatalogInfoClient: mocks.getMarketCatalogInfoClient,
}));

vi.mock("@/lib/network", () => ({
	getNetwork: () => mocks.network,
}));

const QUERY_DATA = {
	spotMeta: {
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
	} as SpotMetaResponse,
	perpDexs: [null] as unknown as PerpDexsResponse,
	allPerpMetas: [{ universe: [], marginTables: [], collateralToken: 0 }] as MetaResponse[],
};

function createInfoClient() {
	return {
		spotMeta: vi.fn().mockResolvedValue(QUERY_DATA.spotMeta),
		perpDexs: vi.fn().mockResolvedValue(QUERY_DATA.perpDexs),
		allPerpMetas: vi.fn().mockResolvedValue(QUERY_DATA.allPerpMetas),
	} as unknown as InfoClient;
}

function persistCatalog(env: "Mainnet" | "Testnet", data = QUERY_DATA, dataUpdatedAt = Date.now()) {
	const source = new QueryClient();
	source.setQueryData(infoPersistedKey("spotMeta", undefined, env), data.spotMeta, { updatedAt: dataUpdatedAt });
	source.setQueryData(infoPersistedKey("perpDexs", undefined, env), data.perpDexs, { updatedAt: dataUpdatedAt });
	source.setQueryData(infoPersistedKey("allPerpMetas", undefined, env), data.allPerpMetas, {
		updatedAt: dataUpdatedAt,
	});
	const clientState = dehydrate(source);
	localStorage.setItem(
		STORAGE_KEYS.RQ_CACHE,
		JSON.stringify({
			timestamp: Date.now(),
			buster: RQ_CACHE_BUSTER,
			clientState,
		}),
	);
	source.clear();
	return clientState;
}

describe("market catalog bootstrap", () => {
	beforeEach(() => {
		localStorage.clear();
		mocks.network = "mainnet";
		mocks.getMarketCatalogInfoClient.mockReset();
	});

	afterEach(() => {
		onlineManager.setOnline(true);
	});

	it("starts all persisted SDK catalog queries with the provider's cache policy", async () => {
		const info = createInfoClient();
		mocks.getMarketCatalogInfoClient.mockReturnValue(info);
		const queryClient = new QueryClient();

		await bootstrapMarketCatalog(queryClient);

		expect(mocks.getMarketCatalogInfoClient).toHaveBeenCalledWith(false);
		expect(info.spotMeta).toHaveBeenCalledTimes(1);
		expect(info.perpDexs).toHaveBeenCalledTimes(1);
		expect(info.allPerpMetas).toHaveBeenCalledTimes(1);
		expect(queryClient.getQueryData(infoPersistedKey("spotMeta", undefined, "Mainnet"))).toEqual(QUERY_DATA.spotMeta);
		expect(queryClient.getQueryData(infoPersistedKey("perpDexs", undefined, "Mainnet"))).toEqual(QUERY_DATA.perpDexs);
		expect(queryClient.getQueryData(infoPersistedKey("allPerpMetas", undefined, "Mainnet"))).toEqual(
			QUERY_DATA.allPerpMetas,
		);

		const options = createMarketCatalogQueryOptions(info, "Mainnet");
		expect(options.map((option) => option.queryKey[0])).toEqual(["persisted", "persisted", "persisted"]);
		expect(options.map((option) => option.retry)).toEqual([false, false, false]);
		expect(options.map((option) => option.gcTime)).toEqual([
			RQ_CACHE_MAX_AGE_MS,
			RQ_CACHE_MAX_AGE_MS,
			RQ_CACHE_MAX_AGE_MS,
		]);
		expect(options.map((option) => option.staleTime)).toEqual([
			MARKET_CATALOG_META_STALE_TIME_MS,
			MARKET_CATALOG_DEXS_STALE_TIME_MS,
			MARKET_CATALOG_META_STALE_TIME_MS,
		]);
	});

	it("hydrates a fresh persisted catalog before deciding whether to fetch", async () => {
		persistCatalog("Mainnet");
		const info = createInfoClient();
		mocks.getMarketCatalogInfoClient.mockReturnValue(info);
		const queryClient = new QueryClient();

		await bootstrapMarketCatalog(queryClient);

		expect(mocks.getMarketCatalogInfoClient).not.toHaveBeenCalled();
		expect(info.spotMeta).not.toHaveBeenCalled();
		expect(info.perpDexs).not.toHaveBeenCalled();
		expect(info.allPerpMetas).not.toHaveBeenCalled();
		expect(queryClient.getQueryData(infoPersistedKey("spotMeta", undefined, "Mainnet"))).toEqual(QUERY_DATA.spotMeta);
	});

	it("revalidates a fresh persisted catalog when its structure is incomplete", async () => {
		persistCatalog("Mainnet", {
			...QUERY_DATA,
			spotMeta: {} as SpotMetaResponse,
		});
		const info = createInfoClient();
		mocks.getMarketCatalogInfoClient.mockReturnValue(info);
		const queryClient = new QueryClient();

		await bootstrapMarketCatalog(queryClient);

		expect(info.spotMeta).toHaveBeenCalledTimes(1);
		expect(info.perpDexs).toHaveBeenCalledTimes(1);
		expect(info.allPerpMetas).toHaveBeenCalledTimes(1);
		expect(queryClient.getQueryData(infoPersistedKey("spotMeta", undefined, "Mainnet"))).toEqual(QUERY_DATA.spotMeta);
	});

	it("never exposes an incomplete persisted catalog while revalidation is pending", async () => {
		persistCatalog("Mainnet", {
			...QUERY_DATA,
			spotMeta: { tokens: "invalid", universe: [] } as unknown as SpotMetaResponse,
		});
		let resolveSpotMeta: ((value: SpotMetaResponse) => void) | undefined;
		const info = {
			...createInfoClient(),
			spotMeta: vi.fn(
				() =>
					new Promise<SpotMetaResponse>((resolve) => {
						resolveSpotMeta = resolve;
					}),
			),
		} as unknown as InfoClient;
		mocks.getMarketCatalogInfoClient.mockReturnValue(info);
		const queryClient = new QueryClient();
		const queryKey = infoPersistedKey("spotMeta", undefined, "Mainnet");

		const bootstrap = bootstrapMarketCatalog(queryClient);
		await vi.waitFor(() => expect(info.spotMeta).toHaveBeenCalledTimes(1));

		expect(queryClient.getQueryData(queryKey)).toBeUndefined();
		const persisted = JSON.parse(localStorage.getItem(STORAGE_KEYS.RQ_CACHE) ?? "null") as {
			clientState: { queries: Array<{ queryKey: unknown }> };
		};
		expect(
			persisted.clientState.queries.some((query) => JSON.stringify(query.queryKey) === JSON.stringify(queryKey)),
		).toBe(false);
		resolveSpotMeta?.(QUERY_DATA.spotMeta);
		await bootstrap;
		expect(queryClient.getQueryData(queryKey)).toEqual(QUERY_DATA.spotMeta);
	});

	it("removes nested catalog corruption and malformed persisted query entries before revalidation", async () => {
		persistCatalog("Mainnet", {
			...QUERY_DATA,
			spotMeta: { tokens: [null], universe: [] } as unknown as SpotMetaResponse,
		});
		const persisted = JSON.parse(localStorage.getItem(STORAGE_KEYS.RQ_CACHE) ?? "null") as {
			clientState: { queries: unknown[] };
		};
		persisted.clientState.queries.push(null);
		localStorage.setItem(STORAGE_KEYS.RQ_CACHE, JSON.stringify(persisted));

		let resolveSpotMeta: ((value: SpotMetaResponse) => void) | undefined;
		const info = {
			...createInfoClient(),
			spotMeta: vi.fn(
				() =>
					new Promise<SpotMetaResponse>((resolve) => {
						resolveSpotMeta = resolve;
					}),
			),
		} as unknown as InfoClient;
		mocks.getMarketCatalogInfoClient.mockReturnValue(info);
		const queryClient = new QueryClient();
		const queryKey = infoPersistedKey("spotMeta", undefined, "Mainnet");

		const bootstrap = bootstrapMarketCatalog(queryClient);
		await vi.waitFor(() => expect(info.spotMeta).toHaveBeenCalledTimes(1));

		expect(queryClient.getQueryData(queryKey)).toBeUndefined();
		const cleaned = JSON.parse(localStorage.getItem(STORAGE_KEYS.RQ_CACHE) ?? "null") as {
			clientState: { queries: Array<{ queryKey: unknown }> };
		};
		expect(cleaned.clientState.queries).not.toContain(null);
		expect(
			cleaned.clientState.queries.some((query) => JSON.stringify(query.queryKey) === JSON.stringify(queryKey)),
		).toBe(false);

		resolveSpotMeta?.(QUERY_DATA.spotMeta);
		await bootstrap;
		expect(queryClient.getQueryData(queryKey)).toEqual(QUERY_DATA.spotMeta);
	});

	it("keeps mainnet and testnet bootstrap data isolated", async () => {
		persistCatalog("Mainnet");
		mocks.network = "testnet";
		const info = createInfoClient();
		mocks.getMarketCatalogInfoClient.mockReturnValue(info);
		const queryClient = new QueryClient();

		await bootstrapMarketCatalog(queryClient);

		expect(mocks.getMarketCatalogInfoClient).toHaveBeenCalledWith(true);
		expect(info.spotMeta).toHaveBeenCalledTimes(1);
		expect(queryClient.getQueryData(infoPersistedKey("spotMeta", undefined, "Testnet"))).toEqual(QUERY_DATA.spotMeta);
	});

	it("removes a future persisted envelope before deferred revalidation", async () => {
		persistCatalog("Mainnet");
		const persisted = JSON.parse(localStorage.getItem(STORAGE_KEYS.RQ_CACHE) ?? "null") as { timestamp: number };
		persisted.timestamp = Date.now() + MARKET_CATALOG_DEXS_STALE_TIME_MS + 1_000;
		localStorage.setItem(STORAGE_KEYS.RQ_CACHE, JSON.stringify(persisted));

		let resolveSpotMeta: ((value: SpotMetaResponse) => void) | undefined;
		const info = {
			...createInfoClient(),
			spotMeta: vi.fn(
				() =>
					new Promise<SpotMetaResponse>((resolve) => {
						resolveSpotMeta = resolve;
					}),
			),
		} as unknown as InfoClient;
		mocks.getMarketCatalogInfoClient.mockReturnValue(info);
		const queryClient = new QueryClient();

		const bootstrap = bootstrapMarketCatalog(queryClient);
		await vi.waitFor(() => expect(info.spotMeta).toHaveBeenCalledTimes(1));

		expect(localStorage.getItem(STORAGE_KEYS.RQ_CACHE)).toBeNull();
		resolveSpotMeta?.(QUERY_DATA.spotMeta);
		await bootstrap;
	});

	it("replaces complete QueryClient data whose update time is unacceptably far in the future", async () => {
		const info = createInfoClient();
		mocks.getMarketCatalogInfoClient.mockReturnValue(info);
		const queryClient = new QueryClient();
		const future = Date.now() + MARKET_CATALOG_DEXS_STALE_TIME_MS + 1_000;
		queryClient.setQueryData(infoPersistedKey("spotMeta", undefined, "Mainnet"), QUERY_DATA.spotMeta, {
			updatedAt: future,
		});
		queryClient.setQueryData(infoPersistedKey("perpDexs", undefined, "Mainnet"), QUERY_DATA.perpDexs, {
			updatedAt: future,
		});
		queryClient.setQueryData(infoPersistedKey("allPerpMetas", undefined, "Mainnet"), QUERY_DATA.allPerpMetas, {
			updatedAt: future,
		});

		await bootstrapMarketCatalog(queryClient);

		expect(info.spotMeta).toHaveBeenCalledTimes(1);
		expect(info.perpDexs).toHaveBeenCalledTimes(1);
		expect(info.allPerpMetas).toHaveBeenCalledTimes(1);
		expect(queryClient.getQueryState(infoPersistedKey("spotMeta", undefined, "Mainnet"))?.dataUpdatedAt).toBeLessThan(
			future,
		);
	});

	it("ignores an invalid persisted payload and fetches a real catalog instead", async () => {
		localStorage.setItem(STORAGE_KEYS.RQ_CACHE, "{invalid");
		const info = createInfoClient();
		mocks.getMarketCatalogInfoClient.mockReturnValue(info);
		const queryClient = new QueryClient();

		await bootstrapMarketCatalog(queryClient);

		expect(info.spotMeta).toHaveBeenCalledTimes(1);
		expect(info.perpDexs).toHaveBeenCalledTimes(1);
		expect(info.allPerpMetas).toHaveBeenCalledTimes(1);
	});

	it("leaves offline work paused for the provider state machine instead of failing open", async () => {
		onlineManager.setOnline(false);
		const info = createInfoClient();
		mocks.getMarketCatalogInfoClient.mockReturnValue(info);
		const queryClient = new QueryClient();
		queryClient.mount();
		const queryKey = infoPersistedKey("spotMeta", undefined, "Mainnet");

		startMarketCatalogBootstrap(queryClient);

		await vi.waitFor(() => expect(queryClient.getQueryState(queryKey)?.fetchStatus).toBe("paused"));
		expect(info.spotMeta).not.toHaveBeenCalled();

		onlineManager.setOnline(true);
		await vi.waitFor(() => expect(info.spotMeta).toHaveBeenCalledTimes(1));
		queryClient.unmount();
	});

	it("stores SDK failures in the shared query state for the existing retry UI", async () => {
		const info = {
			...createInfoClient(),
			spotMeta: vi.fn().mockRejectedValue(new Error("catalog failed")),
		} as unknown as InfoClient;
		mocks.getMarketCatalogInfoClient.mockReturnValue(info);
		const queryClient = new QueryClient();
		const queryKey = infoPersistedKey("spotMeta", undefined, "Mainnet");

		await bootstrapMarketCatalog(queryClient);

		expect(queryClient.getQueryState(queryKey)).toMatchObject({
			status: "error",
			fetchStatus: "idle",
		});
	});

	it("deduplicates concurrent route bootstrap calls for one query client", async () => {
		let resolveSpotMeta: ((value: SpotMetaResponse) => void) | undefined;
		const spotMeta = vi.fn(
			() =>
				new Promise<SpotMetaResponse>((resolve) => {
					resolveSpotMeta = resolve;
				}),
		);
		const info = {
			...createInfoClient(),
			spotMeta,
		} as unknown as InfoClient;
		mocks.getMarketCatalogInfoClient.mockReturnValue(info);
		const queryClient = new QueryClient();

		startMarketCatalogBootstrap(queryClient);
		startMarketCatalogBootstrap(queryClient);

		await vi.waitFor(() => expect(spotMeta).toHaveBeenCalledTimes(1));
		expect(info.perpDexs).toHaveBeenCalledTimes(1);
		expect(info.allPerpMetas).toHaveBeenCalledTimes(1);
		resolveSpotMeta?.(QUERY_DATA.spotMeta);
		await vi.waitFor(() => {
			expect(queryClient.getQueryData(infoPersistedKey("spotMeta", undefined, "Mainnet"))).toEqual(QUERY_DATA.spotMeta);
		});
	});

	it("keeps a newer bootstrap response when the provider later restores the same persisted cache", async () => {
		const persistedData = {
			...QUERY_DATA,
			spotMeta: { tokens: [{ name: "persisted" }], universe: [] } as unknown as SpotMetaResponse,
		};
		const clientState = persistCatalog("Mainnet", persistedData, Date.now() - 31 * 60 * 1_000);
		const info = createInfoClient();
		mocks.getMarketCatalogInfoClient.mockReturnValue(info);
		const queryClient = new QueryClient();

		await bootstrapMarketCatalog(queryClient);
		hydrate(queryClient, clientState);

		expect(info.spotMeta).toHaveBeenCalledTimes(1);
		expect(queryClient.getQueryData(infoPersistedKey("spotMeta", undefined, "Mainnet"))).toEqual(QUERY_DATA.spotMeta);
	});
});
