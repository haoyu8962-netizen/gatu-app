// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderbookPanel } from "@/components/trade/orderbook/orderbook-panel";
import { getOrderbookActionsStore } from "@/stores/use-orderbook-actions-store";

const mocks = vi.hoisted(() => ({
	book: undefined as
		| {
				coin: string;
				levels: [Array<{ n: number; px: string; sz: string }>, Array<{ n: number; px: string; sz: string }>];
				spread?: string;
				time: number;
		  }
		| undefined,
	error: undefined as Error | undefined,
	isStale: false,
	lastL2Subscription: undefined as { enabled: boolean; params: Record<string, unknown> } | undefined,
	market: { kind: "perp", markPx: "100", name: "HYPE", pairName: "HYPE-USDC", szDecimals: 2 },
	midPx: "100.5" as string | undefined,
	sizeMode: "base" as "base" | "quote",
	status: "subscribing" as "active" | "error" | "idle" | "subscribing",
	trades: undefined as
		| Array<{
				coin: string;
				hash: string;
				px: string;
				side: "A" | "B";
				sz: string;
				tid: number;
				time: number;
				users: [string, string];
		  }>
		| undefined,
}));

vi.mock("@/lib/hyperliquid", () => ({
	getExplorerTxUrl: (hash: string) => `https://example.test/tx/${hash}`,
	useSelectedMarketInfo: () => ({ data: mocks.market }),
	useSubscription: (method: string, params: Record<string, unknown>, options?: { enabled?: boolean }) => {
		if (method === "l2Book") {
			mocks.lastL2Subscription = { enabled: options?.enabled === true, params };
			return { data: mocks.book, error: mocks.error, isStale: mocks.isStale, status: mocks.status };
		}
		return { data: mocks.trades, error: undefined, isStale: false, status: "active" };
	},
}));

vi.mock("@/hooks/trade/use-orderbook-mid-price", () => ({
	useOrderbookMidPrice: () => ({
		bestAsk: undefined,
		bestBid: undefined,
		isStale: false,
		midPx: mocks.midPx,
		status: "active",
	}),
}));

vi.mock("@/lib/performance/render-profile", () => ({
	useRenderCommitTrack: () => {},
}));

vi.mock("@/components/trade/orderbook/use-orderbook-rows", () => ({
	useOrderbookRows: () => [{ rowCount: 4, fullRowCount: 3 }, { current: null }],
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => "en-US",
	useIsTestnet: () => false,
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	useSizeMode: () => mocks.sizeMode,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function snapshot(
	coin: string,
	bids: Array<{ n: number; px: string; sz: string }>,
	asks: Array<{ n: number; px: string; sz: string }>,
	spread?: string,
) {
	return { coin, levels: [bids, asks] as [typeof bids, typeof asks], spread, time: Date.now() };
}

describe("OrderbookPanel safety", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.book = undefined;
		mocks.error = undefined;
		mocks.isStale = false;
		mocks.lastL2Subscription = undefined;
		mocks.market = { kind: "perp", markPx: "100", name: "HYPE", pairName: "HYPE-USDC", szDecimals: 2 };
		mocks.midPx = "100.5";
		mocks.sizeMode = "base";
		mocks.status = "subscribing";
		mocks.trades = undefined;
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it.each([
		{ label: "errored", status: "error" as const, isStale: false },
		{ label: "stale", status: "active" as const, isStale: true },
	])("does not expose $label snapshot prices as order actions", ({ status, isStale }) => {
		mocks.book = snapshot("HYPE", [{ n: 1, px: "99.95", sz: "1" }], [{ n: 1, px: "100.05", sz: "1" }]);
		mocks.status = status;
		mocks.isStale = isStale;

		renderPanel();

		expect(container.querySelector('button[aria-label*="limit price"]')).toBeNull();
		expect(container.textContent).toContain("Failed to load order book.");
	});

	it("does not render a snapshot from a different market", () => {
		mocks.book = snapshot("ETH", [{ n: 1, px: "1920.5", sz: "1" }], [{ n: 1, px: "1921.0", sz: "1" }]);
		mocks.status = "active";

		renderPanel();

		expect(container.textContent).not.toContain("1,920.5");
		expect(container.querySelector('button[aria-label*="limit price"]')).toBeNull();
		expect(container.textContent).toContain("Waiting for order book...");
	});

	it("distinguishes an active empty side and normalizes depth independently", () => {
		mocks.book = snapshot(
			"HYPE",
			[
				{ n: 1, px: "100.00", sz: "10" },
				{ n: 1, px: "99.95", sz: "90" },
			],
			[],
		);
		mocks.status = "active";

		renderPanel();

		expect(container.textContent).toContain("No orders");
		expect(container.textContent).not.toContain("Waiting for order book...");
		const bidDepth = container.querySelectorAll<HTMLElement>(".depth-bar-bid");
		expect(bidDepth[bidDepth.length - 1]?.style.width).toBe("100%");
	});

	it("disables clipped edge prices while keeping complete rows selectable", () => {
		getOrderbookActionsStore().actions.clearSelectedPrice();
		mocks.status = "active";
		mocks.book = snapshot(
			"HYPE",
			Array.from({ length: 4 }, (_, rank) => ({ n: 1, px: String(99 - rank), sz: "1" })),
			Array.from({ length: 4 }, (_, rank) => ({ n: 1, px: String(101 + rank), sz: "1" })),
		);
		renderPanel();
		const asks = [...container.querySelectorAll<HTMLButtonElement>('[data-slot="orderbook-asks"] button')];
		const bids = [...container.querySelectorAll<HTMLButtonElement>('[data-slot="orderbook-bids"] button')];
		expect(asks.map((row) => row.disabled)).toEqual([true, false, false, false]);
		expect(bids.map((row) => row.disabled)).toEqual([false, false, false, true]);
		act(() => {
			asks[0]?.click();
			bids[3]?.click();
		});
		expect(getOrderbookActionsStore().selectedPrice).toBeNull();
		act(() => asks[3]?.click());
		expect(getOrderbookActionsStore().selectedPrice).toEqual({ marketName: "HYPE", price: "101" });
	});

	it("uses the unaggregated event spread with the BBO midpoint", () => {
		mocks.book = snapshot("HYPE", [{ n: 1, px: "98.0", sz: "1" }], [{ n: 1, px: "103.0", sz: "1" }], "1.0");
		mocks.status = "active";

		renderPanel();

		expect(container.querySelector('[data-slot="orderbook-spread"]')?.textContent).toContain("1.00 (0.995%)");
	});

	it("derives static headings, cumulative totals, and depth from the shared order size mode", () => {
		mocks.book = snapshot(
			"HYPE",
			[
				{ n: 1, px: "100", sz: "1" },
				{ n: 1, px: "50", sz: "1" },
			],
			[{ n: 1, px: "101", sz: "1" }],
		);
		mocks.status = "active";
		mocks.trades = [
			{
				coin: "HYPE",
				hash: "0xtrade",
				px: "100",
				side: "B",
				sz: "1.5",
				tid: 1,
				time: Date.UTC(2026, 6, 22, 12, 0, 0),
				users: ["0xbuyer", "0xseller"],
			},
		];

		renderPanel();

		const baseHeadings = container.querySelectorAll(".orderbook-asset-heading");
		expect(Array.from(baseHeadings, (heading) => heading.textContent)).toEqual(["(HYPE)", "(HYPE)"]);
		expect(Array.from(baseHeadings, (heading) => heading.closest("button"))).toEqual([null, null]);
		expect(container.querySelector(".trades-asset-heading")?.textContent).toBe("(HYPE)");
		expect(
			container.querySelector<HTMLAnchorElement>('a[href="https://example.test/tx/0xtrade"]')?.children[1]?.textContent,
		).toBe("1.50");
		const baseBidDepth = container.querySelectorAll<HTMLElement>(".depth-bar-bid");
		expect(baseBidDepth[0]?.style.width).toBe("50%");
		expect(baseBidDepth[1]?.style.width).toBe("100%");

		mocks.sizeMode = "quote";
		renderPanel();

		const quoteHeadings = container.querySelectorAll(".orderbook-asset-heading");
		expect(Array.from(quoteHeadings, (heading) => heading.textContent)).toEqual(["(USDC)", "(USDC)"]);
		expect(container.querySelector(".trades-asset-heading")?.textContent).toBe("(USDC)");
		expect(
			container.querySelector<HTMLAnchorElement>('a[href="https://example.test/tx/0xtrade"]')?.children[1]?.textContent,
		).toBe("150.00");
		const quoteBidDepth = container.querySelectorAll<HTMLElement>(".depth-bar-bid");
		expect(Number.parseFloat(quoteBidDepth[0]?.style.width ?? "0")).toBeCloseTo(66.67, 2);
		expect(quoteBidDepth[1]?.style.width).toBe("100%");
		expect(container.querySelector('button[aria-label*="Total 150"]')).not.toBeNull();
		expect(mocks.lastL2Subscription).toEqual({ enabled: true, params: { coin: "HYPE" } });
	});

	it("keeps the desktop subscription active across tabs and fails closed while the market identity changes", () => {
		mocks.book = snapshot("HYPE", [{ n: 1, px: "99.95", sz: "1" }], [{ n: 1, px: "100.05", sz: "1" }]);
		mocks.status = "active";
		renderPanel();

		expect(mocks.lastL2Subscription).toEqual({ enabled: true, params: { coin: "HYPE" } });
		const tradesTab = container.querySelector<HTMLButtonElement>('button[aria-label="Recent Trades"]');
		if (!tradesTab) throw new Error("Missing recent trades tab");
		const bookTab = container.querySelector<HTMLButtonElement>('button[aria-label="Order Book"]');
		if (!bookTab) throw new Error("Missing order book tab");
		act(() => tradesTab.click());
		expect(mocks.lastL2Subscription).toEqual({ enabled: true, params: { coin: "HYPE" } });

		mocks.market = { kind: "perp", markPx: "64000", name: "BTC", pairName: "BTC-USDC", szDecimals: 5 };
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<OrderbookPanel />
				</I18nProvider>,
			);
		});
		expect(mocks.lastL2Subscription).toEqual({ enabled: true, params: { coin: "BTC" } });

		act(() => bookTab.click());
		expect(container.textContent).not.toContain("99.95");
		expect(container.querySelector('button[aria-label*="limit price"]')).toBeNull();
	});

	function renderPanel() {
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<OrderbookPanel />
				</I18nProvider>,
			);
		});
	}
});
