// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TokenSelectorRow } from "@/components/trade/chart/token-selector-row";
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
	decompressionSupported: true,
	fastDisabled: false,
}));

vi.mock("@sairn/hl-react", () => ({
	canUseL2Decompression: () => mocks.decompressionSupported,
	isFastAssetCtxsDisabled: () => mocks.fastDisabled,
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
		builderPerp: [
			{
				assetId: 110_000,
				ctxIndex: 0,
				deployerFeeScale: "1",
				dex: "xyz",
				dexIndex: 1,
				iconUrl: undefined,
				kind: "builderPerp",
				maxLeverage: 10,
				name: "xyz:AAPL",
				pairName: "AAPL-USDC",
				quoteToken: undefined,
				routeName: "xyz:AAPL",
				shortName: "AAPL",
				szDecimals: 3,
			},
		],
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

vi.mock("@/components/trade/components/asset-display", () => ({
	AssetDisplay: ({ coin }: { coin: string }) => <span>{coin}</span>,
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

const BTC_PERP_CTX = {
	funding: "0.0000125",
	openInterest: "12",
	prevDayPx: "90000",
	dayNtlVlm: "1000000",
	oraclePx: "99990",
	markPx: "100000",
	midPx: "100001",
	dayBaseVlm: "10",
};

const SPOT_CTX = {
	prevDayPx: "40",
	dayNtlVlm: "5000",
	markPx: "42",
	midPx: "42.1",
	dayBaseVlm: "120",
	circulatingSupply: "7",
};

function subscriptionResponse(data: unknown, overrides: Record<string, unknown> = {}) {
	return { data, status: "active", error: undefined, isStale: false, lastMessageAt: 1, ...overrides };
}

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
		mocks.fastDisabled = false;
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
	});

	it("keeps live market contexts out of browser storage", () => {
		mocks.responses.pac = subscriptionResponse([["", [BTC_PERP_CTX]]]);
		mocks.responses.sac = subscriptionResponse({ "@1": SPOT_CTX });

		renderProbe(true);

		expect(captured.getMarketByName("@1")).toMatchObject({ prevDayPx: "40" });
		expect(sessionStorage.getItem("hl-mkt-stats-v2")).toBeNull();
		expect(sessionStorage.length).toBe(0);
	});

	it("shows no market context before the first live frame, even with a stored snapshot from an earlier version", () => {
		sessionStorage.setItem(
			"hl-mkt-stats-v2",
			JSON.stringify({
				env: "Mainnet",
				savedAt: Date.now(),
				allDexsCtxs: [["", [{ ...BTC_PERP_CTX, prevDayPx: "80000" }]]],
				spotCtxs: { "@1": { ...SPOT_CTX, prevDayPx: "30" } },
			}),
		);
		mocks.responses.pac = subscriptionResponse(undefined, { status: "subscribing" });
		mocks.responses.sac = subscriptionResponse(undefined, { status: "subscribing" });
		mocks.fastPriceSubscription.data = { BTC: { markPx: "100000", midPx: "100001" }, "@1": { markPx: "42" } };
		mocks.fastPriceSubscription.status = "active";
		mocks.fastPriceSubscription.lastMessageAt = Date.now();

		renderProbe(true);

		const btc = captured.getMarketByName("BTC");
		const hype = captured.getMarketByName("@1");
		expect(btc).toMatchObject({ markPx: "100000", midPx: "100001", markPriceStatus: "success" });
		expect(btc?.prevDayPx).toBeUndefined();
		expect(btc?.openInterest).toBeUndefined();
		expect(btc?.dayNtlVlm).toBeUndefined();
		expect(hype).toMatchObject({ markPx: "42", markPriceStatus: "success" });
		expect(hype?.prevDayPx).toBeUndefined();
		expect(hype && "circulatingSupply" in hype).toBe(false);
		expect(captured.perpContextsLive).toBe(false);
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

	it("prices rows from the plain context channels without subscribing to fast prices when the browser cannot decompress", async () => {
		mocks.decompressionSupported = false;
		vi.resetModules();
		const { useMarketsInfoInternal: useWithoutDecompression } = await import("@/lib/hyperliquid/hooks/useMarketsInfo");
		mocks.decompressionSupported = true;
		function UnsupportedProbe() {
			captured = useWithoutDecompression({ alwaysSubscribeAll: true, subscriptionKeepAliveMs: 10_000 });
			return null;
		}
		const perpReceivedAt = Date.now() - 1_000;
		const spotReceivedAt = Date.now() - 2_000;
		mocks.responses.allDexsAssetCtxs = subscriptionResponse(
			{
				ctxs: [
					["", [BTC_PERP_CTX]],
					["xyz", [{ ...BTC_PERP_CTX, markPx: "200" }]],
				],
			},
			{ lastMessageAt: perpReceivedAt },
		);
		mocks.responses.spotAssetCtxs = subscriptionResponse([{ ...SPOT_CTX, coin: "@1" }], {
			lastMessageAt: spotReceivedAt,
		});

		act(() => root.render(<UnsupportedProbe />));

		const latest = latestSubscriptionOptions();
		expect(latest.get("fastAssetCtxs")).toEqual({ enabled: false, maxStaleMs: 10_000 });
		expect(latest.get("pac")).toMatchObject({ enabled: false });
		expect(latest.get("allDexsAssetCtxs")).toMatchObject({ enabled: true, maxStaleMs: 10_000 });
		expect(latest.get("spotAssetCtxs")).toMatchObject({ enabled: true, maxStaleMs: 10_000 });
		expect(captured.getMarketByName("BTC")).toMatchObject({
			markPx: "100000",
			midPx: "100001",
			markPriceStatus: "success",
			markPriceReceivedAt: perpReceivedAt,
		});
		expect(captured.getMarketByName("@1")).toMatchObject({
			markPx: "42",
			markPriceStatus: "success",
			markPriceReceivedAt: spotReceivedAt,
		});
		expect(captured.getMarketByName("xyz:AAPL")).toMatchObject({
			markPx: "200",
			markPriceStatus: "success",
			markPriceReceivedAt: perpReceivedAt,
		});

		mocks.responses.allDexsAssetCtxs = subscriptionResponse(
			{ ctxs: [["", [BTC_PERP_CTX]]] },
			{ lastMessageAt: Date.now() - 12_000, isStale: true },
		);
		act(() => root.render(<UnsupportedProbe />));
		expect(captured.getMarketByName("BTC")?.markPriceStatus).not.toBe("success");
	});

	it("falls back to the compact context prices once the fast price stream is turned off for the session", () => {
		const receivedAt = Date.now() - 1_000;
		mocks.responses.pac = subscriptionResponse([["", [BTC_PERP_CTX]]], { lastMessageAt: receivedAt });
		renderProbe(true);
		expect(latestSubscriptionOptions().get("fastAssetCtxs")).toEqual({ enabled: true, maxStaleMs: 10_000 });

		mocks.fastDisabled = true;
		mocks.fastPriceSubscription.status = "error";
		mocks.fastPriceSubscription.error = new Error("bad frame");
		renderProbe(true);

		const latest = latestSubscriptionOptions();
		expect(latest.get("fastAssetCtxs")).toEqual({ enabled: false, maxStaleMs: 10_000 });
		expect(latest.get("pac")).toMatchObject({ enabled: true, maxStaleMs: 10_000 });
		expect(captured.getMarketByName("BTC")).toMatchObject({
			markPx: "100000",
			markPriceStatus: "success",
			markPriceReceivedAt: receivedAt,
		});
	});

	it("keeps fast prices after an ordinary fast stream failure", () => {
		mocks.fastPriceSubscription.status = "error";
		mocks.fastPriceSubscription.error = new Error("closed");
		renderProbe(true);
		renderProbe(true);
		expect(latestSubscriptionOptions().get("fastAssetCtxs")).toEqual({ enabled: true, maxStaleMs: 10_000 });
	});

	it("reports live perp contexts only for an active, fresh compact frame", () => {
		mocks.responses.pac = subscriptionResponse([["", [BTC_PERP_CTX]]]);
		renderProbe(true);
		expect(captured.perpContextsLive).toBe(true);
		expect(captured.getMarketByName("BTC")).toMatchObject({ openInterest: "12" });
	});

	it.each([
		["stale", { isStale: true }],
		["recovering", { status: "subscribing" }],
	])("does not report %s compact perp contexts as live and keeps the retained values", (_state, overrides) => {
		mocks.responses.pac = subscriptionResponse([["", [BTC_PERP_CTX]]], overrides);
		renderProbe(true);
		expect(captured.perpContextsLive).toBe(false);
		expect(captured.getMarketByName("BTC")).toMatchObject({ openInterest: "12" });
	});

	it("does not report an active compact subscription without a frame as live", () => {
		mocks.responses.pac = subscriptionResponse(undefined);
		renderProbe(true);
		expect(captured.perpContextsLive).toBe(false);
	});

	it("does not report failed compact perp contexts as live", () => {
		mocks.responses.pac = subscriptionResponse([["", [BTC_PERP_CTX]]], {
			status: "error",
			error: new Error("bad frame"),
		});
		renderProbe(true);
		expect(mocks.disableCompactMarketCtxs).toHaveBeenCalledTimes(1);
		expect(captured.perpContextsLive).toBe(false);
	});

	it("does not report perp contexts as live while the route-level gate is closed", () => {
		mocks.responses.pac = subscriptionResponse([["", [BTC_PERP_CTX]]]);
		renderProbe(false);
		expect(captured.perpContextsLive).toBe(false);
	});

	it.each([
		["active and fresh", {}, true],
		["stale", { isStale: true }, false],
		["failed", { status: "error", error: new Error("closed") }, false],
		["recovering", { status: "subscribing" }, false],
	])(
		"reports whether %s plain-channel perp contexts are live after the compact fallback",
		(_state, overrides, live) => {
			mocks.compactDisabled = true;
			mocks.responses.allDexsAssetCtxs = subscriptionResponse({ ctxs: [["", [BTC_PERP_CTX]]] }, overrides);
			renderProbe(true);
			expectLatestSubscriptionState(true, false);
			expect(captured.perpContextsLive).toBe(live);
			expect(captured.getMarketByName("BTC")).toMatchObject({ openInterest: "12" });
		},
	);

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

	it.each([
		["live", {}, true],
		["stale", { isStale: true }, false],
		["recovering", { status: "subscribing" }, false],
		["failed", { status: "error", error: new Error("closed") }, false],
	])("marks each row's asset context as live only for %s compact frames", (_state, overrides, live) => {
		mocks.responses.pac = subscriptionResponse([["", [BTC_PERP_CTX]]], overrides);
		mocks.responses.sac = subscriptionResponse({ "@1": SPOT_CTX }, overrides);

		renderProbe(true);

		expect(captured.getMarketByName("BTC")?.assetContextLive).toBe(live);
		expect(captured.getMarketByName("@1")?.assetContextLive).toBe(live);
	});

	it("tracks spot and perp context liveness separately", () => {
		mocks.responses.pac = subscriptionResponse([["", [BTC_PERP_CTX]]], { isStale: true });
		mocks.responses.sac = subscriptionResponse({ "@1": SPOT_CTX });

		renderProbe(true);

		expect(captured.getMarketByName("BTC")?.assetContextLive).toBe(false);
		expect(captured.getMarketByName("@1")?.assetContextLive).toBe(true);
	});

	it.each([
		["active and fresh", {}, true],
		["stale", { isStale: true }, false],
		["recovering", { status: "subscribing" }, false],
	])("marks plain-channel spot contexts that are %s after the compact fallback", (_state, overrides, live) => {
		mocks.compactDisabled = true;
		mocks.responses.spotAssetCtxs = subscriptionResponse([{ coin: "@1", ...SPOT_CTX }], overrides);

		renderProbe(true);

		expect(captured.getMarketByName("@1")).toMatchObject({ prevDayPx: "40", assetContextLive: live });
	});

	it.each([
		["live all-dex perp contexts", {}, { isStale: true }, true],
		["stale all-dex perp contexts", { isStale: true }, {}, false],
	])(
		"marks builder-deployed perp rows by %s, whatever the spot contexts",
		(_case, perpOverrides, spotOverrides, live) => {
			mocks.responses.pac = subscriptionResponse(
				[
					["", [BTC_PERP_CTX]],
					["xyz", [{ ...BTC_PERP_CTX, markPx: "200" }]],
				],
				perpOverrides,
			);
			mocks.responses.sac = subscriptionResponse({ "@1": SPOT_CTX }, spotOverrides);

			renderProbe(true);

			expect(captured.getMarketByName("xyz:AAPL")).toMatchObject({ markPx: "200", assetContextLive: live });
		},
	);

	it("does not mark a row live when its own context has not arrived", () => {
		mocks.responses.pac = subscriptionResponse([["", []]]);
		mocks.responses.sac = subscriptionResponse({ "@2": SPOT_CTX });

		renderProbe(true);

		expect(captured.perpContextsLive).toBe(true);
		expect(captured.getMarketByName("BTC")?.assetContextLive).toBe(false);
		expect(captured.getMarketByName("@1")?.assetContextLive).toBe(false);
	});
});

describe("market selector rows from the live market contexts", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		mocks.compactDisabled = false;
		for (const key of Object.keys(mocks.responses)) delete mocks.responses[key];
		mocks.fastPriceSubscription.data = { BTC: { markPx: "100000", midPx: "100001" } };
		mocks.fastPriceSubscription.status = "active";
		mocks.fastPriceSubscription.error = null;
		mocks.fastPriceSubscription.isStale = false;
		mocks.fastPriceSubscription.lastMessageAt = Date.now();
		mocks.responses.pac = subscriptionResponse([["", [BTC_PERP_CTX]]]);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function SelectorRowProbe() {
		const { getMarketByName } = useMarketsInfoInternal({ alwaysSubscribeAll: true });
		const market = getMarketByName("BTC");
		if (!market) return null;
		return (
			<I18nProvider i18n={i18n}>
				<TokenSelectorRow
					market={market}
					mobile={false}
					showDerivativesMetrics
					showSpotMarketCap={false}
					isSelected={false}
					isHighlighted={false}
					isFavorite={false}
					top={0}
					height={48}
					onSelect={vi.fn()}
					onToggleFavorite={vi.fn()}
				/>
			</I18nProvider>
		);
	}

	function renderSelectorRow() {
		act(() => root.render(<SelectorRowProbe />));
		const row = container.querySelector("li");
		if (!row) throw new Error("Missing selector row");
		return { price: row.children[2]?.textContent, change: row.children[3]?.textContent, text: row.textContent };
	}

	it("prices the row from the live mid and compares it with the live context's previous day price", () => {
		const row = renderSelectorRow();

		expect(row.price).toBe("100,001");
		expect(row.change).toBe("+10,001 / +11.11%");
		expect(row.text).toContain("$1,200,000");
	});

	it("drops the 24h change while the context carrying the previous day price is stale", () => {
		mocks.responses.pac = subscriptionResponse([["", [BTC_PERP_CTX]]], { isStale: true });

		const row = renderSelectorRow();

		expect(row.price).toBe("100,001");
		expect(row.change).toBe("-");
	});

	it("shows neither price nor change while the fast prices are stale", () => {
		mocks.fastPriceSubscription.isStale = true;

		const row = renderSelectorRow();

		expect(row.price).toBe("-");
		expect(row.change).toBe("-");
	});
});
