// @vitest-environment jsdom

import type { MetaResponse, PerpDexsResponse, SpotMetaResponse } from "@nktkas/hyperliquid";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RQ_CACHE_MAX_AGE_MS } from "@/config/time";
import { MarketsProvider, useMarkets } from "@/lib/hyperliquid/markets/use-markets";

const mocks = vi.hoisted(() => ({
	useInfo: vi.fn(),
	isRestoring: false,
}));

const QUERY_DATA = {
	spotMeta: { tokens: [], universe: [] } as SpotMetaResponse,
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
			});
		}
	});
});
