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
	responses: {} as Record<string, unknown>,
	disableCompactMarketCtxs: vi.fn(),
	compactDisabled: false,
}));

vi.mock("@gatu/hl-react", () => ({
	canUseL2Decompression: () => true,
	useHyperliquidTransport: () => ({ env: "Mainnet" }),
	useSubscription: (...args: unknown[]) => {
		mocks.useSubscription(...args);
		if (args[0] === "fastAssetCtxs") return mocks.fastPriceSubscription;
		const enabled = (args[2] as { enabled?: boolean } | undefined)?.enabled;
		const response = mocks.responses[args[0] as string];
		if (enabled && response) return response;
		return { data: undefined, status: "idle", error: null, isStale: false, lastMessageAt: undefined };
	},
}));

vi.mock("@/lib/hyperliquid/markets/market-ctxs-fallback", () => ({
	isCompactMarketCtxsDisabled: () => mocks.compactDisabled,
	disableCompactMarketCtxs: (error: unknown) => {
		mocks.compactDisabled = true;
		mocks.disableCompactMarketCtxs(error);
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
		spot: [
			{
				assetId: 10_001,
				ctxIndex: 1,
				iconUrl: undefined,
				index: 1,
				isCanonical: true,
				isStablePair: false,
				kind: "spot",
				name: "@1",
				pairName: "HYPE/USDC",
				routeName: "HYPE/USDC",
				shortName: "HYPE",
				szDecimals: 2,
				tokens: [1, 0],
				tokensInfo: [],
			},
		],
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
		mocks.disableCompactMarketCtxs.mockReset();
		mocks.compactDisabled = false;
		for (const key of Object.keys(mocks.responses)) delete mocks.responses[key];
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

	function latestSubscriptionOptions() {
		const latest = new Map<string, unknown>();
		for (const [method, , options] of mocks.useSubscription.mock.calls) latest.set(method as string, options);
		return latest;
	}

	function expectLatestSubscriptionState(enabled: boolean, compact = true) {
		const latest = latestSubscriptionOptions();
		expect([...latest.keys()]).toEqual(["pac", "sac", "allDexsAssetCtxs", "spotAssetCtxs", "fastAssetCtxs"]);
		expect(latest.get("pac")).toEqual({ enabled: enabled && compact, throttleMs: 5_000 });
		expect(latest.get("sac")).toEqual({ enabled: enabled && compact, throttleMs: 5_000 });
		expect(latest.get("allDexsAssetCtxs")).toEqual({ enabled: enabled && !compact, throttleMs: 5_000 });
		expect(latest.get("spotAssetCtxs")).toEqual({ enabled: enabled && !compact, throttleMs: 5_000 });
		expect(latest.get("fastAssetCtxs")).toEqual({ enabled, maxStaleMs: 10_000 });
	}

	it("mounts exactly one group of public market subscriptions, compact channels first", () => {
		renderProbe(true);

		expectLatestSubscriptionState(true);
		expect(mocks.useSubscription).toHaveBeenCalledTimes(5);
	});

	it("reads perp contexts by dex index and spot contexts by market name from the compact channels", () => {
		mocks.responses.pac = {
			data: [["", [{ prevDayPx: "90000", markPx: "100000", openInterest: "12" }]]],
			status: "active",
			error: undefined,
			isStale: false,
			lastMessageAt: 1,
		};
		mocks.responses.sac = {
			data: { "@1": { prevDayPx: "40", markPx: "42", circulatingSupply: "7" } },
			status: "active",
			error: undefined,
			isStale: false,
			lastMessageAt: 1,
		};

		renderProbe(true);

		expect(captured.getMarketByName("BTC")).toMatchObject({ prevDayPx: "90000", openInterest: "12" });
		expect(captured.getMarketByName("@1")).toMatchObject({ prevDayPx: "40", circulatingSupply: "7" });
		expect(JSON.parse(sessionStorage.getItem("hl-mkt-stats-v2") ?? "null")).toMatchObject({
			spotCtxs: { "@1": { prevDayPx: "40" } },
		});
	});

	it("falls back to the plain channels once a compact stream fails and keeps that across remounts", () => {
		const error = new Error("bad frame");
		mocks.responses.pac = { data: undefined, status: "error", error, isStale: false };

		renderProbe(true);

		expectLatestSubscriptionState(true, false);
		expect(mocks.disableCompactMarketCtxs).toHaveBeenCalledTimes(1);
		expect(mocks.disableCompactMarketCtxs).toHaveBeenCalledWith(error);

		act(() => root.unmount());
		root = createRoot(container);
		mocks.useSubscription.mockClear();
		delete mocks.responses.pac;
		renderProbe(true);

		expectLatestSubscriptionState(true, false);
		expect(mocks.useSubscription).toHaveBeenCalledTimes(5);
	});

	it("discards a cached snapshot whose entries no longer parse", () => {
		sessionStorage.setItem(
			"hl-mkt-stats-v2",
			JSON.stringify({
				env: "Mainnet",
				savedAt: Date.now(),
				allDexsCtxs: [["", [{ markPx: 1 }]]],
				spotCtxs: undefined,
			}),
		);

		renderProbe(true);

		expect(captured.getMarketByName("BTC")?.prevDayPx).toBeUndefined();
		expect(sessionStorage.getItem("hl-mkt-stats-v2")).toBeNull();
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
