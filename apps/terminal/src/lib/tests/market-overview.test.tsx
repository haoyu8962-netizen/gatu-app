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

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const MAIN_WORKSPACE_SOURCE = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/layout/main-workspace.tsx"),
	"utf8",
);
const MARKET_STAT_WIDTHS = {
	price: 48,
	oracle: 48,
	change24h: 100,
	volume24h: 100,
	openInterest: 100,
	funding: 104,
	marketCap: 110,
	contract: 112,
} as const;
type MarketStatId = keyof typeof MARKET_STAT_WIDTHS;

let marketOverviewWidth = 616;
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

const mocks = vi.hoisted(() => ({
	midPx: undefined as string | undefined,
	receivedAt: Date.now(),
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
	getSpotMarketApiCoin: (market: { name?: string } | undefined) => market?.name ?? "",
	useSelectedMarketInfo: () => ({ data: mocks.selectedMarket }),
	useSubscription: (method: string) => {
		const data = method === "activeAssetCtx" ? mocks.perpCtxEvent : undefined;
		return {
			data,
			status: data ? "active" : "idle",
			isStale: false,
			lastMessageAt: data ? mocks.receivedAt : undefined,
		};
	},
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("MarketOverview", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		marketOverviewWidth = 616;
		resizeObservers.length = 0;
		vi.stubGlobal("ResizeObserver", ResizeObserverMock);
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
			if (this.hasAttribute("data-market-overview")) return createRect(marketOverviewWidth);
			const statId = this.dataset.marketStat as MarketStatId | undefined;
			return createRect(statId ? MARKET_STAT_WIDTHS[statId] : 0);
		});
		mocks.midPx = undefined;
		mocks.receivedAt = Date.now();
		mocks.perpCtxEvent = undefined;
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
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

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

			const occupiedWidth = visible.reduce((sum, id) => sum + MARKET_STAT_WIDTHS[id], 0) + (visible.length - 1) * gapPx;
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
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<MarketOverview />
				</I18nProvider>,
			),
		);
		expect(getVisibleStatIds(container)).toEqual(["price", "oracle", "change24h", "volume24h", "funding"]);

		marketOverviewWidth = 431;
		act(() => resizeObservers.at(-1)?.emit());

		expect(getVisibleStatIds(container)).toEqual(["price", "oracle", "change24h", "funding"]);
	});

	it("uses the selected market snapshot while realtime subscriptions warm up", () => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<MarketOverview />
				</I18nProvider>,
			),
		);

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

		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<MarketOverview />
				</I18nProvider>,
			),
		);

		expect(container.textContent).toContain("Mark80");
		expect(container.textContent).toContain("24h Change+16 / +25.00%");
		expect(container.textContent).toContain("ORACLE79");
		expect(container.textContent).toContain("$10,000,000.00");
		expect(container.textContent).toContain("$160.00");
		expect(container.textContent).toContain("+0.0010%");
		expect(container.textContent).not.toContain("Mark71.8");
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
		mocks.selectedMarket = {
			kind: "spot",
			name: "@999",
			pairName: "TOKEN-USDH",
			markPx: "1.25",
			prevDayPx: "1.0",
			dayNtlVlm: "12345.67",
			circulatingSupply: "1000",
			szDecimals: 2,
			markPriceStatus: "success",
			markPriceReceivedAt: mocks.receivedAt,
			tokensInfo: [
				{ name: "TOKEN", displayName: "TOKEN" },
				{ name: "USDH", displayName: "USDH" },
			],
		};

		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<MarketOverview />
				</I18nProvider>,
			),
		);

		expect(container.textContent).toContain("Price1.3");
		expect(container.textContent).toContain("24h Change+0.3 / +30.00%");
		expect(container.textContent).toContain("24H VOL12,345.67 USDH");
		expect(container.textContent).toContain("Market Cap1,250 USDH");
		expect(container.textContent).not.toContain("$12,345.67");
	});
});
