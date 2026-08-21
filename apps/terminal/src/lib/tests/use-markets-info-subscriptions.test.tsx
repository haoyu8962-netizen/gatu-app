// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMarketsInfoInternal } from "@/lib/hyperliquid/hooks/useMarketsInfo";

const mocks = vi.hoisted(() => ({
	useSubscription: vi.fn(),
}));

vi.mock("@gatu/hl-react", () => ({
	useHyperliquidTransport: () => ({ env: "Mainnet" }),
	useSubscription: (...args: unknown[]) => {
		mocks.useSubscription(...args);
		return { data: undefined, status: "idle", error: null, isStale: false, lastMessageAt: undefined };
	},
}));

vi.mock("@/lib/hyperliquid/markets/use-markets", () => ({
	useMarkets: () => ({ builderPerp: [], error: null, isLoading: false, perp: [], spot: [] }),
}));

vi.mock("@/providers/exchange-scope", () => ({
	useExchangeScope: () => ({ scope: "all" }),
}));

vi.mock("@/stores/use-market-store", () => ({
	useSelectedMarket: () => "BTC",
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Probe({ subscriptionsEnabled }: { subscriptionsEnabled: boolean }) {
	useMarketsInfoInternal({
		alwaysSubscribeAll: true,
		subscriptionKeepAliveMs: 10_000,
		subscriptionsEnabled,
	});
	return null;
}

describe("useMarketsInfoInternal subscription gate", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		mocks.useSubscription.mockReset();
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
});
