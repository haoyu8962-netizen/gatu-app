// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMarketsInfoInternal } from "@/lib/hyperliquid/hooks/useMarketsInfo";

const mocks = vi.hoisted(() => ({
	fastPriceSubscription: {
		data: undefined as Record<string, { markPx?: string; midPx?: string | null }> | undefined,
		status: "idle" as "idle" | "subscribing" | "active" | "error",
		error: null as unknown,
		isStale: false,
		lastMessageAt: undefined as number | undefined,
	},
	useSubscription: vi.fn(),
}));

vi.mock("@gatu/hl-react", () => ({
	useHyperliquidTransport: () => ({ env: "Mainnet" }),
	useSubscription: (...args: unknown[]) => {
		mocks.useSubscription(...args);
		if (args[0] === "fastAssetCtxs") return mocks.fastPriceSubscription;
		return { data: undefined, status: "idle", error: null, isStale: false, lastMessageAt: undefined };
	},
}));

vi.mock("@/lib/hyperliquid/markets/use-markets", () => ({
	useMarkets: () => ({
		builderPerp: [],
		error: null,
		isLoading: false,
		perp: [
			{
				assetId: 0,
				ctxIndex: 0,
				iconUrl: undefined,
				kind: "perp",
				maxLeverage: 50,
				name: "BTC",
				pairName: "BTC-USDC",
				routeName: "BTC",
				shortName: "BTC",
				szDecimals: 5,
			},
		],
		spot: [],
	}),
}));

vi.mock("@/providers/exchange-scope", () => ({
	useExchangeScope: () => ({ scope: "all" }),
}));

vi.mock("@/stores/use-market-store", () => ({
	useSelectedMarket: () => "BTC",
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Probe({ subscriptionsEnabled }: { subscriptionsEnabled: boolean }) {
	captured = useMarketsInfoInternal({
		alwaysSubscribeAll: true,
		subscriptionKeepAliveMs: 10_000,
		subscriptionsEnabled,
	});
	return null;
}

let captured: ReturnType<typeof useMarketsInfoInternal>;

describe("useMarketsInfoInternal subscription gate", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		mocks.useSubscription.mockReset();
		mocks.fastPriceSubscription.data = undefined;
		mocks.fastPriceSubscription.status = "idle";
		mocks.fastPriceSubscription.error = null;
		mocks.fastPriceSubscription.isStale = false;
		mocks.fastPriceSubscription.lastMessageAt = undefined;
		sessionStorage.clear();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderProbe(subscriptionsEnabled: boolean) {
		act(() => root.render(<Probe subscriptionsEnabled={subscriptionsEnabled} />));
	}

	function expectLatestSubscriptionState(enabled: boolean) {
		expect(mocks.useSubscription).toHaveBeenCalledTimes(3);
		expect(mocks.useSubscription).toHaveBeenCalledWith("allDexsAssetCtxs", undefined, { enabled, throttleMs: 5_000 });
		expect(mocks.useSubscription).toHaveBeenCalledWith("spotAssetCtxs", undefined, { enabled, throttleMs: 5_000 });
		expect(mocks.useSubscription).toHaveBeenCalledWith("fastAssetCtxs", undefined, {
			enabled,
			maxStaleMs: 10_000,
		});
	}

	it("mounts exactly one group of public market subscriptions", () => {
		renderProbe(true);

		expectLatestSubscriptionState(true);
		expect(mocks.useSubscription.mock.calls.map(([method]) => method)).toEqual([
			"allDexsAssetCtxs",
			"spotAssetCtxs",
			"fastAssetCtxs",
		]);
	});

	it("stops both market feeds immediately when the route-level gate closes", () => {
		renderProbe(false);
		expectLatestSubscriptionState(false);

		mocks.useSubscription.mockClear();
		renderProbe(true);
		expectLatestSubscriptionState(true);

		mocks.useSubscription.mockClear();
		renderProbe(false);
		expectLatestSubscriptionState(false);
	});

	it("uses aggregate stream receipt time for retained fast prices", () => {
		mocks.fastPriceSubscription.data = {
			BTC: { markPx: "100000", midPx: "100001" },
			HYPE: { markPx: "42" },
		};
		mocks.fastPriceSubscription.status = "active";
		mocks.fastPriceSubscription.lastMessageAt = 11_000;

		renderProbe(true);

		expect(captured.getMarketByName("BTC")).toMatchObject({
			markPx: "100000",
			midPx: "100001",
			markPriceStatus: "success",
			markPriceReceivedAt: 11_000,
			midPriceReceivedAt: 11_000,
		});
	});
});
