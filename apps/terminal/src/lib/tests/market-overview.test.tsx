// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarketOverview } from "@/components/trade/market-overview";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const MAIN_WORKSPACE_SOURCE = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/layout/main-workspace.tsx"),
	"utf8",
);
const NOW = 1_000_000;
const FRESH_RECEIVED_AT = NOW - 100;
type MarketStatId =
	| "price"
	| "oracle"
	| "change24h"
	| "volume24h"
	| "openInterest"
	| "funding"
	| "marketCap"
	| "contract";

function getRenderedStatIds(container: HTMLElement): MarketStatId[] {
	return Array.from(container.querySelectorAll<HTMLElement>("[data-market-stat]")).map(
		(node) => node.dataset.marketStat as MarketStatId,
	);
}

const mocks = vi.hoisted(() => ({
	allMidsEvent: undefined as { mids: Record<string, string> } | undefined,
	allMidsIsStale: false,
	allMidsStatus: "idle" as "idle" | "subscribing" | "active" | "error",
	env: "Mainnet",
	midPx: undefined as string | undefined,
	midSnapshot: undefined as object | undefined,
	receivedAt: Date.now() as number | undefined,
	reconnectListener: undefined as (() => void) | undefined,
	perpCtxStatus: "idle" as "idle" | "subscribing" | "active" | "error",
	perpCtxIsStale: false,
	perpCtxEvent: undefined as
		| {
				coin: string;
				ctx: {
					markPx: string;
					midPx?: string | null;
					prevDayPx: string;
					oraclePx: string;
					dayNtlVlm: string;
					openInterest: string;
					funding: string;
				};
		  }
		| undefined,
	spotCtxStatus: "idle" as "idle" | "subscribing" | "active" | "error",
	spotCtxIsStale: false,
	spotCtxEvent: undefined as
		| {
				coin: string;
				ctx: {
					markPx: string;
					midPx?: string | null;
					prevDayPx: string;
					dayNtlVlm: string;
					circulatingSupply?: string;
				};
		  }
		| undefined,
	fastMarket: undefined as Record<string, unknown> | undefined,
	selectedMarket: {
		kind: "builderPerp",
		name: "xyz:BRENTOIL",
		pairName: "BRENTOIL-USDC",
		markPx: "71.8",
		prevDayPx: "70",
		oraclePx: "71.7",
		dayNtlVlm: "22228099.94",
		openInterest: "1685179.8",
		funding: "0.000006",
		markPriceStatus: "success",
		markPriceReceivedAt: Date.now(),
	} as Record<string, unknown>,
}));

function createSpotMarket(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		kind: "spot",
		name: "@999",
		pairName: "TOKEN-USDH",
		markPx: "1.25",
		prevDayPx: "1.0",
		dayNtlVlm: "12345.67",
		circulatingSupply: "1000",
		szDecimals: 2,
		markPriceStatus: "success",
		markPriceReceivedAt: FRESH_RECEIVED_AT,
		tokensInfo: [
			{ name: "TOKEN", displayName: "TOKEN", tokenId: "0x1111111111111111111111111111111111111111" },
			{ name: "USDH", displayName: "USDH" },
		],
		...overrides,
	};
}

vi.mock("@gatu/ui", () => ({
	Tooltip: ({ children, content }: { children: ReactNode; content: ReactNode }) => (
		<>
			{children}
			{content}
		</>
	),
}));

vi.mock("@/hooks/trade/use-orderbook-mid-price", () => ({
	useOrderbookMidPrice: () => ({ midPx: mocks.midPx, snapshot: mocks.midSnapshot, status: "idle" }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	getExplorerTokenUrl: (address: string) => `/explorer/token/${address}`,
	getMarketApiCoin: (market: { name?: string } | undefined) => market?.name ?? "",
	getSpotMarketApiCoin: (market: { kind?: string; name?: string } | undefined) =>
		market?.kind === "spot" ? (market.name ?? "") : "",
	subscribeWsReconnect: (listener: () => void) => {
		mocks.reconnectListener = listener;
		return () => {
			if (mocks.reconnectListener === listener) mocks.reconnectListener = undefined;
		};
	},
	useHyperliquid: () => ({ env: mocks.env }),
	useMarketsInfo: () => ({ getMarketByName: () => mocks.fastMarket }),
	useSelectedMarketInfo: () => ({ data: mocks.selectedMarket }),
	useSubscription: (method: string) => {
		if (method === "allMids") {
			return {
				data: mocks.allMidsEvent,
				status: mocks.allMidsStatus,
				isStale: mocks.allMidsIsStale,
				lastMessageAt: mocks.allMidsEvent ? mocks.receivedAt : undefined,
			};
		}
		const isPerp = method === "activeAssetCtx";
		const data = isPerp ? mocks.perpCtxEvent : method === "activeSpotAssetCtx" ? mocks.spotCtxEvent : undefined;
		return {
			data,
			status: isPerp ? mocks.perpCtxStatus : mocks.spotCtxStatus,
			isStale: isPerp ? mocks.perpCtxIsStale : mocks.spotCtxIsStale,
			lastMessageAt: data ? mocks.receivedAt : undefined,
		};
	},
}));

vi.mock("sonner", () => ({
	toast: { error: vi.fn(), success: vi.fn() },
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("MarketOverview", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.spyOn(Date, "now").mockReturnValue(NOW);
		mocks.allMidsEvent = undefined;
		mocks.allMidsIsStale = false;
		mocks.allMidsStatus = "idle";
		mocks.env = "Mainnet";
		mocks.midPx = undefined;
		mocks.midSnapshot = undefined;
		mocks.receivedAt = FRESH_RECEIVED_AT;
		mocks.reconnectListener = undefined;
		mocks.perpCtxStatus = "idle";
		mocks.perpCtxIsStale = false;
		mocks.perpCtxEvent = undefined;
		mocks.spotCtxStatus = "idle";
		mocks.spotCtxIsStale = false;
		mocks.spotCtxEvent = undefined;
		mocks.fastMarket = undefined;
		mocks.selectedMarket = {
			kind: "builderPerp",
			name: "xyz:BRENTOIL",
			pairName: "BRENTOIL-USDC",
			markPx: "71.8",
			prevDayPx: "70",
			oraclePx: "71.7",
			dayNtlVlm: "22228099.94",
			openInterest: "1685179.8",
			funding: "0.000006",
			markPriceStatus: "success",
			markPriceReceivedAt: mocks.receivedAt,
		};
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		Reflect.deleteProperty(navigator, "clipboard");
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	function renderOverview() {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<MarketOverview />
				</I18nProvider>,
			),
		);
	}

	function renderKeyedOverview() {
		const marketKey = String(mocks.selectedMarket.name ?? "default");
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<MarketOverview key={marketKey} />
				</I18nProvider>,
			),
		);
	}

	function getStat(id: MarketStatId): HTMLElement {
		const stat = container.querySelector<HTMLElement>(`[data-market-stat="${id}"]`);
		if (!stat) throw new Error(`Missing ${id} market stat`);
		return stat;
	}

	function setFreshPerpContext(
		overrides: Partial<{
			markPx: string;
			prevDayPx: string;
			oraclePx: string;
			dayNtlVlm: string;
			openInterest: string;
			funding: string;
		}> = {},
	) {
		mocks.perpCtxStatus = "active";
		mocks.perpCtxEvent = {
			coin: String(mocks.selectedMarket.name),
			ctx: {
				markPx: "71.8",
				prevDayPx: "70",
				oraclePx: "71.7",
				dayNtlVlm: "22228099.94",
				openInterest: "1685179.8",
				funding: "0.000006",
				...overrides,
			},
		};
	}

	it("gives the overview sole ownership of scrolling and resets it by market identity", () => {
		expect(MAIN_WORKSPACE_SOURCE).toContain("<MarketHeaderView");
		expect(MAIN_WORKSPACE_SOURCE).toContain("<MarketOverview key={marketKey} />");

		renderKeyedOverview();
		const firstScroller = container.querySelector<HTMLElement>("[data-market-overview]");
		expect(firstScroller).not.toBeNull();
		if (!firstScroller) return;
		firstScroller.scrollLeft = 240;

		mocks.selectedMarket = {
			...mocks.selectedMarket,
			name: "xyz:SECOND",
			pairName: "SECOND-USDC",
			markPx: "42",
			markPriceReceivedAt: FRESH_RECEIVED_AT,
		};
		renderKeyedOverview();

		const secondScroller = container.querySelector<HTMLElement>("[data-market-overview]");
		expect(secondScroller).not.toBe(firstScroller);
		expect(secondScroller?.scrollLeft).toBe(0);
	});

	it("keeps every perpetual metric mounted in stable, keyboard-scrollable slots", () => {
		renderOverview();

		const overview = container.querySelector<HTMLElement>("[data-market-overview]");
		const row = container.querySelector<HTMLElement>("[data-market-overview-row]");
		expect(overview?.tagName).toBe("SECTION");
		expect(overview?.getAttribute("aria-label")).toBeTruthy();
		expect(overview?.tabIndex).toBe(0);
		expect(overview?.className).toContain("overflow-x-auto");
		expect(overview?.className).toContain("overscroll-x-contain");
		expect(row?.className).not.toContain("w-max");
		expect(row?.className).not.toContain("min-w-full");
		expect(row?.className).toContain("gap-8");
		expect(getRenderedStatIds(container)).toEqual([
			"price",
			"oracle",
			"change24h",
			"volume24h",
			"openInterest",
			"funding",
		]);

		for (const node of container.querySelectorAll<HTMLElement>("[data-market-stat]")) {
			expect(node.className).toBe("shrink-0");
			expect(node.hasAttribute("aria-hidden")).toBe(false);
			expect(node.hasAttribute("inert")).toBe(false);
			expect(node.classList.contains("absolute")).toBe(false);
			expect(node.classList.contains("invisible")).toBe(false);
		}
	});

	it("preserves metric nodes and geometry contracts across live ticks and number format changes", () => {
		mocks.perpCtxStatus = "active";
		mocks.perpCtxEvent = {
			coin: "xyz:BRENTOIL",
			ctx: {
				markPx: "80",
				prevDayPx: "64",
				oraclePx: "79",
				dayNtlVlm: "10000000",
				openInterest: "2",
				funding: "0.00001",
			},
		};
		renderOverview();
		const initialNodes = new Map(
			Array.from(container.querySelectorAll<HTMLElement>("[data-market-stat]")).map((node) => [
				node.dataset.marketStat as MarketStatId,
				node,
			]),
		);

		mocks.perpCtxEvent.ctx = {
			markPx: "0.0000012345",
			prevDayPx: "0.0000000001",
			oraclePx: "999999999999.99",
			dayNtlVlm: "999999999999.99",
			openInterest: "999999999999.99",
			funding: "-0.00001234",
		};
		renderOverview();
		act(() => notifyNumberFormatChange());

		for (const [id, node] of initialNodes) {
			expect(getStat(id)).toBe(node);
			expect(getStat(id).className).toBe(node.className);
		}
	});

	it("uses only the fresh exact price while the full market context warms up", () => {
		renderOverview();

		expect(getStat("price").textContent).toContain("Mark71.8");
		expect(getStat("change24h").textContent).toBe("24h Change—");
		expect(getStat("oracle").textContent).toBe("Oracle-");
		expect(getStat("volume24h").textContent).toBe("24h Volume-");
		expect(getStat("openInterest").textContent).toBe("Open Interest-");
		expect(getStat("funding").textContent).toBe("Funding / Resets in—");
		expect(container.textContent).not.toContain("71.7");
		expect(container.textContent).not.toContain("22,228,099.94");
		expect(container.textContent).not.toContain("0.0000%");
	});

	it("uses realtime context after the subscription becomes available", () => {
		renderOverview();
		expect(getStat("price").textContent).toContain("Mark71.8");

		mocks.perpCtxEvent = {
			coin: "xyz:BRENTOIL",
			ctx: {
				markPx: "80",
				prevDayPx: "64",
				oraclePx: "79",
				dayNtlVlm: "10000000",
				openInterest: "2",
				funding: "0.00001",
			},
		};
		mocks.perpCtxStatus = "active";
		renderOverview();

		expect(container.textContent).toContain("Mark80");
		expect(container.textContent).toContain("24h Change+16.000 / +25.00%");
		expect(container.textContent).toContain("Oracle79");
		expect(container.textContent).toContain("$10,000,000.00");
		expect(container.textContent).toContain("$160.00");
		expect(container.textContent).toContain("+0.0010%");
		expect(container.textContent).not.toContain("Mark71.8");
	});

	it.each([
		{ reason: "the retained subscription is in error", status: "error", isStale: false, coin: "xyz:BRENTOIL" },
		{ reason: "the retained subscription is stale", status: "active", isStale: true, coin: "xyz:BRENTOIL" },
		{ reason: "the subscription is still warming up", status: "subscribing", isStale: false, coin: "xyz:BRENTOIL" },
		{ reason: "the retained event belongs to another market", status: "active", isStale: false, coin: "xyz:OLD" },
	] as const)("rejects realtime context when $reason", ({ status, isStale, coin }) => {
		mocks.perpCtxEvent = {
			coin,
			ctx: {
				markPx: "999",
				prevDayPx: "500",
				oraclePx: "998",
				dayNtlVlm: "123",
				openInterest: "7",
				funding: "0.001",
			},
		};
		mocks.perpCtxStatus = status;
		mocks.perpCtxIsStale = isStale;
		renderOverview();

		expect(getStat("price").textContent).toContain("Mark71.8");
		expect(getStat("oracle").textContent).toBe("Oracle-");
		expect(getStat("volume24h").textContent).toBe("24h Volume-");
		expect(getStat("openInterest").textContent).toBe("Open Interest-");
		expect(container.textContent).not.toContain("Mark999");
		expect(container.textContent).not.toContain("Oracle998");
	});

	it.each([
		{ reason: "its receipt is missing", receivedAt: undefined },
		{ reason: "its receipt is older than the live-data limit", receivedAt: NOW - 10_001 },
	] as const)("rejects otherwise-active realtime context when $reason", ({ receivedAt }) => {
		mocks.perpCtxEvent = {
			coin: "xyz:BRENTOIL",
			ctx: {
				markPx: "999",
				prevDayPx: "500",
				oraclePx: "998",
				dayNtlVlm: "123",
				openInterest: "7",
				funding: "0.001",
			},
		};
		mocks.perpCtxStatus = "active";
		mocks.receivedAt = receivedAt;
		renderOverview();

		expect(getStat("price").textContent).toContain("Mark71.8");
		expect(container.textContent).not.toContain("Mark999");
	});

	it("uses an exact fresh fast snapshot while the selected mark warms up", () => {
		mocks.selectedMarket = {
			...mocks.selectedMarket,
			markPx: "71.8",
			markPriceStatus: "loading",
			markPriceReceivedAt: undefined,
		};
		mocks.fastMarket = {
			...mocks.selectedMarket,
			name: "xyz:BRENTOIL",
			markPx: "72.5",
			markPriceStatus: "success",
			markPriceReceivedAt: FRESH_RECEIVED_AT,
		};
		renderOverview();

		expect(getStat("price").textContent).toContain("Mark72.5");
		expect(getStat("change24h").textContent).toBe("24h Change—");
	});

	it.each([
		{ reason: "stale", name: "xyz:BRENTOIL", status: "stale", receivedAt: FRESH_RECEIVED_AT },
		{ reason: "expired", name: "xyz:BRENTOIL", status: "success", receivedAt: NOW - 10_001 },
		{ reason: "for another market", name: "xyz:OLD", status: "success", receivedAt: FRESH_RECEIVED_AT },
	] as const)("fails closed when the fast snapshot is $reason", ({ name, status, receivedAt }) => {
		mocks.selectedMarket = {
			...mocks.selectedMarket,
			markPriceStatus: "loading",
			markPriceReceivedAt: undefined,
		};
		mocks.fastMarket = {
			...mocks.selectedMarket,
			name,
			markPx: "72.5",
			markPriceStatus: status,
			markPriceReceivedAt: receivedAt,
		};
		renderOverview();

		expect(getStat("price").textContent).toBe("Mark-");
		expect(getStat("change24h").textContent).toBe("24h Change—");
		expect(getStat("openInterest").textContent).toBe("Open Interest-");
		expect(getStat("oracle").textContent).toBe("Oracle-");
		expect(getStat("volume24h").textContent).toBe("24h Volume-");
	});

	it("never carries a previous perpetual context across a same-instance market switch", () => {
		mocks.perpCtxStatus = "active";
		mocks.perpCtxEvent = {
			coin: "xyz:BRENTOIL",
			ctx: {
				markPx: "80",
				prevDayPx: "64",
				oraclePx: "79",
				dayNtlVlm: "10000000",
				openInterest: "2",
				funding: "0.00001",
			},
		};
		renderOverview();
		expect(getStat("price").textContent).toContain("Mark80");

		mocks.selectedMarket = {
			...mocks.selectedMarket,
			name: "xyz:SECOND",
			pairName: "SECOND-USDC",
			markPx: "42",
			prevDayPx: "40",
			oraclePx: "41.9",
			markPriceReceivedAt: FRESH_RECEIVED_AT,
		};
		renderOverview();
		expect(getStat("price").textContent).toContain("Mark42");
		expect(getStat("oracle").textContent).toBe("Oracle-");
		expect(container.textContent).not.toContain("Mark80");

		mocks.perpCtxEvent = {
			coin: "xyz:SECOND",
			ctx: {
				markPx: "43",
				prevDayPx: "40",
				oraclePx: "42.9",
				dayNtlVlm: "20000000",
				openInterest: "3",
				funding: "0.00002",
			},
		};
		renderOverview();
		expect(getStat("price").textContent).toContain("Mark43");
		expect(getStat("oracle").textContent).toContain("Oracle42.9");
	});

	it("replaces the full metric set when switching perp to spot and back in the same instance", () => {
		mocks.perpCtxStatus = "active";
		mocks.perpCtxEvent = {
			coin: "xyz:BRENTOIL",
			ctx: {
				markPx: "80",
				prevDayPx: "64",
				oraclePx: "79",
				dayNtlVlm: "10000000",
				openInterest: "2",
				funding: "0.00001",
			},
		};
		renderOverview();
		expect(getRenderedStatIds(container)).toEqual([
			"price",
			"oracle",
			"change24h",
			"volume24h",
			"openInterest",
			"funding",
		]);
		expect(getStat("price").textContent).toContain("Mark80");

		mocks.selectedMarket = createSpotMarket();
		renderOverview();
		expect(getRenderedStatIds(container)).toEqual(["price", "change24h", "volume24h", "marketCap", "contract"]);
		for (const node of container.querySelectorAll<HTMLElement>("[data-market-stat]")) {
			expect(node.hasAttribute("aria-hidden")).toBe(false);
			expect(node.hasAttribute("inert")).toBe(false);
		}
		expect(getStat("price").textContent).toBe("Price-");
		expect(container.textContent).not.toContain("Mark80");

		mocks.spotCtxStatus = "active";
		mocks.spotCtxEvent = {
			coin: "@999",
			ctx: {
				markPx: "9",
				prevDayPx: "8",
				dayNtlVlm: "999",
				circulatingSupply: "9999",
			},
		};
		mocks.selectedMarket = {
			kind: "builderPerp",
			name: "xyz:SECOND",
			pairName: "SECOND-USDC",
			markPx: "42",
			prevDayPx: "40",
			oraclePx: "41.9",
			dayNtlVlm: "20000000",
			openInterest: "3",
			funding: "0.00002",
			markPriceStatus: "success",
			markPriceReceivedAt: FRESH_RECEIVED_AT,
		};
		renderOverview();
		expect(getRenderedStatIds(container)).toEqual([
			"price",
			"oracle",
			"change24h",
			"volume24h",
			"openInterest",
			"funding",
		]);
		expect(getStat("price").textContent).toContain("Mark42");
		expect(container.textContent).not.toContain("Price9");
	});

	it("uses the perpetual mark for price and change when the orderbook mid differs", () => {
		mocks.midPx = "75";
		setFreshPerpContext();
		renderOverview();

		expect(container.textContent).toContain("Mark71.8");
		expect(container.textContent).toContain("24h Change+1.800 / +2.57%");
		expect(container.textContent).not.toContain("Mark75");
	});

	it("keeps the server spot headline at native precision and flashes only real changes", () => {
		mocks.selectedMarket = createSpotMarket({ name: "@107", pairName: "HYPE-USDC", szDecimals: 2 });
		mocks.spotCtxStatus = "active";
		mocks.spotCtxEvent = {
			coin: "@107",
			ctx: { markPx: "71", midPx: "72.1375", prevDayPx: "70", dayNtlVlm: "1000", circulatingSupply: "1000" },
		};
		renderOverview();
		let price = container.querySelector<HTMLElement>('[data-slot="market-overview-price-value"]');
		expect(price?.textContent).toBe("72.138");
		expect(price?.dataset.priceSource).toBe("assetCtxMid");
		mocks.spotCtxEvent = { ...mocks.spotCtxEvent, ctx: { ...mocks.spotCtxEvent.ctx, midPx: "72.138" } };
		renderOverview();
		price = container.querySelector<HTMLElement>('[data-slot="market-overview-price-value"]');
		expect(price?.dataset.direction).toBe("up");
		mocks.spotCtxEvent = { ...mocks.spotCtxEvent, ctx: { ...mocks.spotCtxEvent.ctx, midPx: "72.137" } };
		renderOverview();
		price = container.querySelector<HTMLElement>('[data-slot="market-overview-price-value"]');
		expect(price?.dataset.direction).toBe("down");
		mocks.spotCtxEvent = { ...mocks.spotCtxEvent, ctx: { ...mocks.spotCtxEvent.ctx, midPx: null } };
		renderOverview();
		price = container.querySelector<HTMLElement>('[data-slot="market-overview-price-value"]');
		expect(price?.textContent).toBe("71.000");
		expect(price?.dataset.priceSource).toBe("assetCtxMark");
		expect(price?.dataset.direction).toBeUndefined();
	});

	it("keeps unavailable funding distinct from a real zero rate", () => {
		renderOverview();

		expect(container.textContent).toContain("Funding / Resets in—");
		expect(container.textContent).not.toContain("0.0000%");
	});

	it("preserves zero and tiny funding signs in the current rate", () => {
		setFreshPerpContext({ funding: "0" });
		renderOverview();

		expect(container.textContent).toContain("0.0000%");
		expect(container.textContent).not.toContain("+0.0000%");
		expect(
			Array.from(container.querySelectorAll(".text-trading-panel-subtle")).some((node) =>
				node.textContent?.includes("0.0000%"),
			),
		).toBe(true);

		if (mocks.perpCtxEvent) mocks.perpCtxEvent.ctx.funding = "0.000001";
		renderOverview();
		expect(container.textContent).toContain("+0.0001%");
		expect(
			Array.from(container.querySelectorAll(".text-trading-panel-success")).some((node) =>
				node.textContent?.includes("+0.0001%"),
			),
		).toBe(true);

		if (mocks.perpCtxEvent) mocks.perpCtxEvent.ctx.funding = "-0.000001";
		renderOverview();
		expect(container.textContent).toContain("-0.0001%");
		expect(
			Array.from(container.querySelectorAll(".text-trading-panel-error")).some((node) =>
				node.textContent?.includes("-0.0001%"),
			),
		).toBe(true);
	});

	it("cleans up the funding countdown when funding becomes unavailable", () => {
		const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
		const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
		setFreshPerpContext();
		renderOverview();

		const intervalId = setIntervalSpy.mock.results.at(-1)?.value;
		expect(intervalId).toBeDefined();

		mocks.perpCtxStatus = "idle";
		renderOverview();

		expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);
	});

	it("labels spot notionals with the selected market quote token", () => {
		mocks.midPx = "1.3";
		mocks.midSnapshot = { revision: 0 };
		mocks.selectedMarket = createSpotMarket();
		mocks.spotCtxStatus = "active";
		mocks.spotCtxEvent = {
			coin: "@999",
			ctx: {
				markPx: "1.25",
				midPx: "1.2",
				prevDayPx: "1.0",
				dayNtlVlm: "12345.67",
				circulatingSupply: "1000",
			},
		};
		renderOverview();

		expect(container.textContent).toContain("Price1.2");
		expect(container.textContent).toContain("24h Change+0.2000 / +20.00%");
		expect(container.textContent).toContain("24h Volume12,345.67 USDH");
		expect(container.textContent).toContain("Market Cap1,250 USDH");
		expect(container.textContent).not.toContain("$12,345.67");
	});

	it("rejects a stale spot context instead of presenting mark price as the market price", () => {
		mocks.selectedMarket = createSpotMarket();
		mocks.spotCtxStatus = "active";
		mocks.spotCtxIsStale = true;
		mocks.spotCtxEvent = {
			coin: "@999",
			ctx: {
				markPx: "9",
				midPx: "9.5",
				prevDayPx: "8",
				dayNtlVlm: "999",
				circulatingSupply: "9999",
			},
		};
		renderOverview();

		expect(getStat("price").textContent).toBe("Price-");
		expect(getStat("volume24h").textContent).toBe("24h Volume—");
		expect(getStat("marketCap").textContent).toBe("Market Cap—");
		expect(container.textContent).not.toContain("Price9");
	});

	it("uses a fresh exact spot mid and keeps the different mark limited to valuation", () => {
		mocks.selectedMarket = createSpotMarket();
		mocks.spotCtxStatus = "active";
		mocks.spotCtxEvent = {
			coin: "@999",
			ctx: {
				markPx: "9",
				midPx: "1.5",
				prevDayPx: "1",
				dayNtlVlm: "999",
				circulatingSupply: "1000",
			},
		};
		renderOverview();

		expect(getStat("price").textContent).toContain("Price1.5000");
		expect(getStat("marketCap").textContent).toContain("9,000 USDH");
		expect(getStat("price").textContent).not.toContain("9");
	});

	it("falls back to the fresh spot context mark when its midpoint is null", () => {
		mocks.selectedMarket = createSpotMarket();
		mocks.spotCtxStatus = "active";
		mocks.spotCtxEvent = {
			coin: "@999",
			ctx: {
				markPx: "9",
				midPx: null,
				prevDayPx: "1",
				dayNtlVlm: "999",
				circulatingSupply: "1000",
			},
		};
		renderOverview();

		expect(getStat("price").textContent).toBe("Price9.0000");
		expect(getStat("marketCap").textContent).toContain("9,000 USDH");
	});

	it("never carries a previous spot context across a same-instance market switch", () => {
		mocks.selectedMarket = createSpotMarket();
		mocks.spotCtxStatus = "active";
		mocks.spotCtxEvent = {
			coin: "@999",
			ctx: {
				markPx: "1.5",
				midPx: "1.5",
				prevDayPx: "1",
				dayNtlVlm: "15000",
				circulatingSupply: "1000",
			},
		};
		renderOverview();
		expect(getStat("price").textContent).toContain("Price1.5");
		expect(getStat("marketCap").textContent).toContain("1,500 USDH");

		mocks.selectedMarket = createSpotMarket({
			name: "@1000",
			pairName: "SECOND-USDH",
			markPx: "2",
			prevDayPx: "1.5",
			circulatingSupply: "2000",
			tokensInfo: [
				{ name: "SECOND", displayName: "SECOND", tokenId: "0x2222222222222222222222222222222222222222" },
				{ name: "USDH", displayName: "USDH" },
			],
		});
		renderOverview();
		expect(getStat("price").textContent).toBe("Price-");
		expect(getStat("marketCap").textContent).toBe("Market Cap—");
		expect(container.textContent).not.toContain("Price1.5");

		mocks.spotCtxEvent = {
			coin: "@1000",
			ctx: {
				markPx: "2.5",
				midPx: "2.5",
				prevDayPx: "2",
				dayNtlVlm: "25000",
				circulatingSupply: "2000",
			},
		};
		renderOverview();
		expect(getStat("price").textContent).toContain("Price2.5");
		expect(getStat("marketCap").textContent).toContain("5,000 USDH");
	});

	it("keeps copied contract state scoped to its address across an async market switch", async () => {
		const firstAddress = "0x1111111111111111111111111111111111111111";
		const secondAddress = "0x2222222222222222222222222222222222222222";
		let resolveCopy: (() => void) | undefined;
		const pendingCopy = new Promise<void>((resolve) => {
			resolveCopy = resolve;
		});
		const writeText = vi.fn().mockReturnValue(pendingCopy);
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText },
		});
		mocks.selectedMarket = createSpotMarket();
		renderOverview();

		const firstCopyButton = container.querySelector<HTMLButtonElement>('[aria-label="Copy token address"]');
		expect(firstCopyButton).not.toBeNull();
		act(() => firstCopyButton?.click());
		expect(writeText).toHaveBeenCalledWith(firstAddress);
		expect(container.querySelector('[aria-label="Copied"]')).toBeNull();

		mocks.selectedMarket = createSpotMarket({
			name: "@1000",
			pairName: "SECOND-USDH",
			tokensInfo: [
				{ name: "SECOND", displayName: "SECOND", tokenId: secondAddress },
				{ name: "USDH", displayName: "USDH" },
			],
		});
		renderOverview();

		expect(container.querySelector('[aria-label="Copied"]')).toBeNull();
		expect(container.querySelector('[aria-label="Copy token address"]')).not.toBeNull();
		expect(container.querySelector<HTMLAnchorElement>('[aria-label="Open token in explorer"]')?.href).toContain(
			`/explorer/token/${secondAddress}`,
		);

		await act(async () => {
			resolveCopy?.();
			await pendingCopy;
		});
		expect(container.querySelector('[aria-label="Copied"]')).toBeNull();
		const secondCopyButton = container.querySelector<HTMLButtonElement>('[aria-label="Copy token address"]');
		expect(secondCopyButton).not.toBeNull();
		await act(async () => {
			secondCopyButton?.click();
			await Promise.resolve();
		});
		expect(writeText).toHaveBeenLastCalledWith(secondAddress);
		expect(container.querySelector('[aria-label="Copied"]')).not.toBeNull();
		expect(writeText).toHaveBeenCalledTimes(2);
	});
});
