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
const DEFAULT_MARKET_STAT_WIDTHS = {
	price: 48,
	oracle: 48,
	change24h: 100,
	volume24h: 100,
	openInterest: 100,
	funding: 104,
	marketCap: 110,
	contract: 112,
} as const;
type MarketStatId = keyof typeof DEFAULT_MARKET_STAT_WIDTHS;

let marketOverviewWidth = 616;
let marketStatWidths: Record<MarketStatId, number> = { ...DEFAULT_MARKET_STAT_WIDTHS };
const resizeObservers: ResizeObserverMock[] = [];

class ResizeObserverMock {
	readonly callback: ResizeObserverCallback;

	constructor(callback: ResizeObserverCallback) {
		this.callback = callback;
		resizeObservers.push(this);
	}

	observe() {}
	unobserve() {}
	disconnect() {}

	emit() {
		this.callback([], this as unknown as ResizeObserver);
	}
}

function createRect(width: number): DOMRect {
	return {
		bottom: 34,
		height: 34,
		left: 0,
		right: width,
		top: 0,
		width,
		x: 0,
		y: 0,
		toJSON: () => ({}),
	};
}

function getVisibleStatIds(container: HTMLElement): MarketStatId[] {
	return Array.from(container.querySelectorAll<HTMLElement>("[data-market-stat]"))
		.filter((node) => node.getAttribute("aria-hidden") !== "true")
		.map((node) => node.dataset.marketStat as MarketStatId);
}

function getRenderedStatIds(container: HTMLElement): MarketStatId[] {
	return Array.from(container.querySelectorAll<HTMLElement>("[data-market-stat]")).map(
		(node) => node.dataset.marketStat as MarketStatId,
	);
}

const mocks = vi.hoisted(() => ({
	midPx: undefined as string | undefined,
	receivedAt: Date.now() as number | undefined,
	perpCtxStatus: "idle" as "idle" | "subscribing" | "active" | "error",
	perpCtxIsStale: false,
	perpCtxEvent: undefined as
		| {
				coin: string;
				ctx: {
					markPx: string;
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
	useOrderbookMidPrice: () => ({ midPx: mocks.midPx, status: "idle" }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	getExplorerTokenUrl: (address: string) => `/explorer/token/${address}`,
	getMarketApiCoin: (market: { name?: string } | undefined) => market?.name ?? "",
	getSpotMarketApiCoin: (market: { kind?: string; name?: string } | undefined) =>
		market?.kind === "spot" ? (market.name ?? "") : "",
	useMarketsInfo: () => ({ getMarketByName: () => mocks.fastMarket }),
	useSelectedMarketInfo: () => ({ data: mocks.selectedMarket }),
	useSubscription: (method: string) => {
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
		marketOverviewWidth = 616;
		marketStatWidths = { ...DEFAULT_MARKET_STAT_WIDTHS };
		resizeObservers.length = 0;
		vi.stubGlobal("ResizeObserver", ResizeObserverMock);
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
			if (this.hasAttribute("data-market-overview")) return createRect(marketOverviewWidth);
			const statId = this.dataset.marketStat as MarketStatId | undefined;
			const intrinsicWidth = statId ? marketStatWidths[statId] : 0;
			const minWidth = Number.parseFloat(this.style.minWidth) || 0;
			return createRect(Math.max(intrinsicWidth, minWidth));
		});
		mocks.midPx = undefined;
		mocks.receivedAt = FRESH_RECEIVED_AT;
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

	function getStat(id: MarketStatId): HTMLElement {
		const stat = container.querySelector<HTMLElement>(`[data-market-stat="${id}"]`);
		if (!stat) throw new Error(`Missing ${id} market stat`);
		return stat;
	}

	it("lets the MarketOverview container claim the toolbar's remaining width", () => {
		expect(MAIN_WORKSPACE_SOURCE).toMatch(
			/className="ml-6 min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain/,
		);
	});

	it.each([
		{
			viewportWidth: 1440,
			containerWidth: 616,
			gapPx: 24,
			visible: ["price", "oracle", "change24h", "volume24h", "funding"],
		},
		{
			viewportWidth: 1200,
			containerWidth: 573,
			gapPx: 16,
			visible: ["price", "oracle", "change24h", "volume24h", "funding"],
		},
		{
			viewportWidth: 1001,
			containerWidth: 431,
			gapPx: 12,
			visible: ["price", "oracle", "change24h", "funding"],
		},
	] as const)(
		"keeps only whole metrics at a $viewportWidth px viewport ($containerWidth px overview)",
		({ containerWidth, gapPx, visible }) => {
			marketOverviewWidth = containerWidth;
			act(() =>
				root.render(
					<I18nProvider i18n={i18n}>
						<MarketOverview />
					</I18nProvider>,
				),
			);

			expect(getVisibleStatIds(container)).toEqual(visible);
			const row = container.querySelector<HTMLElement>("[data-market-overview-row]");
			expect(row?.style.columnGap).toBe(`${gapPx}px`);

			const occupiedWidth = visible.reduce((sum, id) => sum + marketStatWidths[id], 0) + (visible.length - 1) * gapPx;
			expect(occupiedWidth).toBeLessThanOrEqual(containerWidth);

			for (const node of container.querySelectorAll<HTMLElement>("[data-market-stat]")) {
				const isVisible = (visible as readonly MarketStatId[]).includes(node.dataset.marketStat as MarketStatId);
				expect(node.getAttribute("aria-hidden")).toBe(isVisible ? null : "true");
				expect(node.hasAttribute("inert")).toBe(!isVisible);
				expect(node.classList.contains("absolute")).toBe(!isVisible);
				expect(node.classList.contains("invisible")).toBe(!isVisible);
			}
		},
	);

	it("recomputes whole-stat visibility when the actual container resizes", () => {
		renderOverview();
		expect(getVisibleStatIds(container)).toEqual(["price", "oracle", "change24h", "volume24h", "funding"]);

		marketOverviewWidth = 431;
		act(() => resizeObservers.at(-1)?.emit());

		expect(getVisibleStatIds(container)).toEqual(["price", "oracle", "change24h", "funding"]);
	});

	it("reserves high-water widths and requires headroom before revealing a hidden metric", () => {
		marketOverviewWidth = 360;
		renderOverview();
		expect(getVisibleStatIds(container)).toEqual(["price", "oracle", "change24h", "funding"]);

		marketStatWidths.oracle = 60;
		act(() => resizeObservers.at(-1)?.emit());
		expect(getVisibleStatIds(container)).toEqual(["price", "oracle", "change24h", "funding"]);
		expect(getStat("oracle").style.minWidth).toBe("60px");

		marketStatWidths.oracle = 48;
		act(() => resizeObservers.at(-1)?.emit());
		expect(getStat("oracle").style.minWidth).toBe("60px");
		expect(getVisibleStatIds(container)).toEqual(["price", "oracle", "change24h", "funding"]);

		marketStatWidths.oracle = 80;
		act(() => resizeObservers.at(-1)?.emit());
		expect(getVisibleStatIds(container)).toEqual(["price", "change24h", "funding"]);
		expect(getStat("oracle").style.minWidth).toBe("80px");

		marketStatWidths.oracle = 48;
		act(() => resizeObservers.at(-1)?.emit());
		expect(getVisibleStatIds(container)).toEqual(["price", "change24h", "funding"]);
		expect(getStat("oracle").style.minWidth).toBe("80px");

		marketOverviewWidth = 383;
		act(() => resizeObservers.at(-1)?.emit());
		expect(getVisibleStatIds(container)).toEqual(["price", "change24h", "funding"]);

		marketOverviewWidth = 384;
		act(() => resizeObservers.at(-1)?.emit());
		expect(getVisibleStatIds(container)).toEqual(["price", "oracle", "change24h", "funding"]);
	});

	it("resets reserved widths synchronously when switching between perpetual markets", () => {
		marketOverviewWidth = 360;
		marketStatWidths.oracle = 80;
		renderOverview();
		expect(getVisibleStatIds(container)).toEqual(["price", "change24h", "funding"]);
		expect(getStat("oracle").style.minWidth).toBe("80px");

		marketStatWidths.oracle = 48;
		mocks.selectedMarket = {
			...mocks.selectedMarket,
			name: "xyz:SECOND",
			pairName: "SECOND-USDC",
			markPx: "42",
			markPriceReceivedAt: FRESH_RECEIVED_AT,
		};
		renderOverview();

		expect(getVisibleStatIds(container)).toEqual(["price", "oracle", "change24h", "funding"]);
		expect(getStat("oracle").style.minWidth).toBe("48px");
		expect(getStat("price").textContent).toContain("Mark42");
		expect(getStat("price").textContent).not.toContain("71.8");
	});

	it("re-measures reserved widths when the number format changes", () => {
		marketOverviewWidth = 360;
		marketStatWidths.oracle = 80;
		renderOverview();
		expect(getVisibleStatIds(container)).toEqual(["price", "change24h", "funding"]);

		marketStatWidths.oracle = 48;
		act(() => notifyNumberFormatChange());

		expect(getVisibleStatIds(container)).toEqual(["price", "oracle", "change24h", "funding"]);
		expect(getStat("oracle").style.minWidth).toBe("48px");
	});

	it("uses the selected market snapshot while realtime subscriptions warm up", () => {
		renderOverview();

		expect(container.textContent).toContain("Mark71.8");
		expect(container.textContent).toContain("24h Change+1.8 / +2.57%");
		expect(container.textContent).toContain("ORACLE71.7");
		expect(container.textContent).toContain("$22,228,099.94");
		expect(container.textContent).toContain("$120,995,909.64");
		expect(container.textContent).toContain("+0.0006%");
		expect(container.textContent).not.toContain("—");
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
		expect(container.textContent).toContain("24h Change+16 / +25.00%");
		expect(container.textContent).toContain("ORACLE79");
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
		expect(getStat("oracle").textContent).toContain("ORACLE71.7");
		expect(getStat("volume24h").textContent).toContain("$22,228,099.94");
		expect(getStat("openInterest").textContent).toContain("$120,995,909.64");
		expect(container.textContent).not.toContain("Mark999");
		expect(container.textContent).not.toContain("ORACLE998");
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
		expect(getStat("change24h").textContent).toContain("+2.5 / +3.57%");
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
		expect(getStat("openInterest").textContent).toBe("OPEN INT-");
		expect(getStat("oracle").textContent).toContain("71.7");
		expect(getStat("volume24h").textContent).toContain("$22,228,099.94");
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
		expect(getStat("oracle").textContent).toContain("ORACLE41.9");
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
		expect(getStat("oracle").textContent).toContain("ORACLE42.9");
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
		expect(getVisibleStatIds(container)).toEqual(["price", "change24h", "volume24h", "marketCap", "contract"]);
		expect(getStat("price").textContent).toContain("Price1.25");
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

		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<MarketOverview />
				</I18nProvider>,
			),
		);

		expect(container.textContent).toContain("Mark71.8");
		expect(container.textContent).toContain("24h Change+1.8 / +2.57%");
		expect(container.textContent).not.toContain("Mark75");
	});

	it("keeps unavailable funding distinct from a real zero rate", () => {
		delete mocks.selectedMarket.funding;

		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<MarketOverview />
				</I18nProvider>,
			),
		);

		expect(container.textContent).toContain("FUNDING / Resets in—");
		expect(container.textContent).not.toContain("0.0000%");
	});

	it("preserves zero and tiny funding signs in the current rate", () => {
		mocks.selectedMarket.funding = "0";

		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<MarketOverview />
				</I18nProvider>,
			),
		);

		expect(container.textContent).toContain("0.0000%");
		expect(container.textContent).not.toContain("+0.0000%");
		expect(
			Array.from(container.querySelectorAll(".text-trading-panel-subtle")).some((node) =>
				node.textContent?.includes("0.0000%"),
			),
		).toBe(true);

		mocks.selectedMarket.funding = "0.000001";
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<MarketOverview />
				</I18nProvider>,
			),
		);
		expect(container.textContent).toContain("+0.0001%");
		expect(
			Array.from(container.querySelectorAll(".text-trading-panel-success")).some((node) =>
				node.textContent?.includes("+0.0001%"),
			),
		).toBe(true);

		mocks.selectedMarket.funding = "-0.000001";
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<MarketOverview />
				</I18nProvider>,
			),
		);
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

		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<MarketOverview />
				</I18nProvider>,
			),
		);

		const intervalId = setIntervalSpy.mock.results.at(-1)?.value;
		expect(intervalId).toBeDefined();

		delete mocks.selectedMarket.funding;
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<MarketOverview />
				</I18nProvider>,
			),
		);

		expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);
	});

	it("labels spot notionals with the selected market quote token", () => {
		mocks.midPx = "1.3";
		mocks.selectedMarket = createSpotMarket();
		renderOverview();

		expect(container.textContent).toContain("Price1.3");
		expect(container.textContent).toContain("24h Change+0.3 / +30.00%");
		expect(container.textContent).toContain("24H VOL12,345.67 USDH");
		expect(container.textContent).toContain("Market Cap1,250 USDH");
		expect(container.textContent).not.toContain("$12,345.67");
	});

	it("rejects a stale spot context and keeps the current spot snapshot", () => {
		mocks.selectedMarket = createSpotMarket();
		mocks.spotCtxStatus = "active";
		mocks.spotCtxIsStale = true;
		mocks.spotCtxEvent = {
			coin: "@999",
			ctx: {
				markPx: "9",
				prevDayPx: "8",
				dayNtlVlm: "999",
				circulatingSupply: "9999",
			},
		};
		renderOverview();

		expect(getStat("price").textContent).toContain("Price1.25");
		expect(getStat("volume24h").textContent).toContain("12,345.67 USDH");
		expect(getStat("marketCap").textContent).toContain("1,250 USDH");
		expect(container.textContent).not.toContain("Price9");
	});

	it("never carries a previous spot context across a same-instance market switch", () => {
		mocks.selectedMarket = createSpotMarket();
		mocks.spotCtxStatus = "active";
		mocks.spotCtxEvent = {
			coin: "@999",
			ctx: {
				markPx: "1.5",
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
		expect(getStat("price").textContent).toContain("Price2");
		expect(getStat("marketCap").textContent).toContain("4,000 USDH");
		expect(container.textContent).not.toContain("Price1.5");

		mocks.spotCtxEvent = {
			coin: "@1000",
			ctx: {
				markPx: "2.5",
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
