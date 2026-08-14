// @vitest-environment jsdom

import type { MetaResponse, PerpDexsResponse, SpotMetaResponse } from "@nktkas/hyperliquid";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RQ_CACHE_MAX_AGE_MS } from "@/config/time";
import { createMarketCatalogQueryOptions } from "@/lib/hyperliquid/markets/market-catalog-query";
import { MarketsProvider, useMarkets } from "@/lib/hyperliquid/markets/use-markets";

const mocks = vi.hoisted(() => ({
	useInfo: vi.fn(),
	isRestoring: false,
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

vi.mock("@gatu/hl-react", () => ({
	useInfo: (method: keyof typeof QUERY_DATA, params: undefined, options: unknown) => {
		mocks.useInfo(method, params, options);
		return {
			data: QUERY_DATA[method],
			status: "success",
			fetchStatus: "idle",
			isLoading: false,
			isStale: false,
			error: null,
			refetch: vi.fn(async () => undefined),
		};
	},
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const original = await importOriginal<typeof import("@tanstack/react-query")>();
	return { ...original, useIsRestoring: () => mocks.isRestoring };
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Probe() {
	useMarkets();
	return null;
}

describe("market catalog query policy", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		mocks.useInfo.mockClear();
		mocks.isRestoring = false;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("owns the boot timeout, disables automatic retries, and retains persisted data for its full max age", () => {
		act(() =>
			root.render(
				<MarketsProvider>
					<Probe />
				</MarketsProvider>,
			),
		);

		expect(mocks.useInfo).toHaveBeenCalledTimes(3);
		for (const [, , options] of mocks.useInfo.mock.calls) {
			expect(options).toMatchObject({
				gcTime: RQ_CACHE_MAX_AGE_MS,
				persist: true,
				requestTimeoutMs: 6_000,
				retry: false,
				retryOnMount: false,
			});
		}
	});

	it("does not repeat a failed bootstrap request when the provider mounts", async () => {
		const spotMeta = vi.fn(async () => {
			throw new Error("catalog unavailable");
		});
		const queryClient = new QueryClient();
		const queryOptions = createMarketCatalogQueryOptions(
			{
				spotMeta,
				perpDexs: vi.fn(),
				allPerpMetas: vi.fn(),
			},
			"Mainnet",
		)[0];

		await queryClient.prefetchQuery(queryOptions);
		expect(spotMeta).toHaveBeenCalledOnce();

		const observer = new QueryObserver(queryClient, queryOptions);
		const unsubscribe = observer.subscribe(() => undefined);
		await Promise.resolve();
		expect(spotMeta).toHaveBeenCalledOnce();

		await observer.refetch();
		expect(spotMeta).toHaveBeenCalledTimes(2);
		unsubscribe();
		queryClient.clear();
	});
});
