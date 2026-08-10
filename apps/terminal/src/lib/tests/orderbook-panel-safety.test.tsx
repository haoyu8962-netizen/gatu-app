// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderbookPanel } from "@/components/trade/orderbook/orderbook-panel";

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
	market: { kind: "perp", markPx: "100", name: "HYPE", pairName: "HYPE-USDC", szDecimals: 2 },
	midPx: "100.5" as string | undefined,
	status: "subscribing" as "active" | "error" | "idle" | "subscribing",
}));

vi.mock("@/lib/hyperliquid", () => ({
	getExplorerTxUrl: (hash: string) => `https://example.test/tx/${hash}`,
	useSelectedMarketInfo: () => ({ data: mocks.market }),
	useSubscription: (method: string) => {
		if (method === "l2Book") {
			return { data: mocks.book, error: mocks.error, isStale: mocks.isStale, status: mocks.status };
		}
		return { data: undefined, error: undefined, isStale: false, status: "idle" };
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
	useOrderbookRows: () => [4, { current: null }],
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => "en-US",
	useGlobalSettings: () => ({ showOrderbookInQuote: false }),
	useGlobalSettingsActions: () => ({ setShowOrderbookInQuote: vi.fn() }),
	useIsTestnet: () => false,
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
		mocks.midPx = "100.5";
		mocks.status = "subscribing";
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

	it("uses the unaggregated event spread with the BBO midpoint", () => {
		mocks.book = snapshot("HYPE", [{ n: 1, px: "98.0", sz: "1" }], [{ n: 1, px: "103.0", sz: "1" }], "1.0");
		mocks.status = "active";

		renderPanel();

		expect(container.querySelector('[data-slot="orderbook-spread"]')?.textContent).toContain("1.00 (0.995%)");
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
