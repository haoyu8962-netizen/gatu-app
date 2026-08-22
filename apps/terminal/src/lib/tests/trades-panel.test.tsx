// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderbookPanel } from "@/components/trade/orderbook/orderbook-panel";
import { TradesPanel } from "@/components/trade/orderbook/trades-panel";

const mocks = vi.hoisted(() => ({
	sizeMode: "base" as "base" | "quote",
	subscriptionMethods: [] as string[],
	result: {
		data: undefined as
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
		error: null as Error | null,
		status: "subscribing" as "active" | "error" | "idle" | "subscribing",
	},
}));

vi.mock("@/lib/hyperliquid", () => ({
	getExplorerTxUrl: (hash: string) => `https://example.test/tx/${hash}`,
	useSelectedMarketInfo: () => ({
		data: { kind: "perp", markPx: "64.5", name: "HYPE", pairName: "HYPE-USDC", szDecimals: 2 },
	}),
	useSubscription: (method: string) => {
		mocks.subscriptionMethods.push(method);
		return mocks.result;
	},
}));

vi.mock("@/lib/performance/render-profile", () => ({
	useRenderCommitTrack: () => {},
}));

vi.mock("@/components/trade/orderbook/use-orderbook-rows", () => ({
	useOrderbookRows: () => [4, { current: null }],
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => "en-US",
	useIsTestnet: () => false,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("TradesPanel", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.sizeMode = "base";
		mocks.subscriptionMethods.length = 0;
		mocks.result.data = undefined;
		mocks.result.error = null;
		mocks.result.status = "subscribing";
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("keeps a quiet stable panel while the initial snapshot is pending", () => {
		renderPanel();

		expect(container.textContent).toContain("Price");
		expect(container.textContent).not.toContain("Waiting for trades");
		expect(container.querySelector('[data-slot="trades-pending"]')).not.toBeNull();
	});

	it("waits for the initial snapshot after the subscription becomes active", () => {
		mocks.result.status = "active";

		renderPanel();

		expect(container.textContent).not.toContain("No recent trades.");
		expect(container.querySelector('[data-slot="trades-pending"]')).not.toBeNull();
	});

	it("prewarms one trades subscription while the order book tab is active", () => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<OrderbookPanel />
				</I18nProvider>,
			),
		);

		expect(mocks.subscriptionMethods.filter((method) => method === "l2Book")).toHaveLength(1);
		expect(mocks.subscriptionMethods.filter((method) => method === "trades")).toHaveLength(1);
	});

	it("distinguishes an active empty snapshot from a pending subscription", () => {
		mocks.result.data = [];
		mocks.result.status = "active";

		renderPanel();

		expect(container.textContent).toContain("No recent trades.");
		expect(container.querySelector('[data-slot="trades-pending"]')).toBeNull();
	});

	it("renders the first snapshot without an intermediate loading message", () => {
		mocks.result.data = [
			{
				coin: "HYPE",
				hash: "0xabc",
				px: "64.50",
				side: "B",
				sz: "1.25",
				tid: 42,
				time: Date.UTC(2026, 6, 22, 12, 0, 0),
				users: ["0xbuyer", "0xseller"],
			},
		];
		mocks.result.status = "active";

		renderPanel();

		expect(container.textContent).toContain("64.50");
		expect(container.textContent).toContain("1.25");
		expect(container.querySelector('a[href="https://example.test/tx/0xabc"]')).not.toBeNull();
		expect(container.textContent).not.toContain("Waiting for trades");
	});

	it("derives its static asset heading and values from the shared order size mode", () => {
		mocks.result.data = [
			{
				coin: "HYPE",
				hash: "0xabc",
				px: "64.50",
				side: "B",
				sz: "1.25",
				tid: 42,
				time: Date.UTC(2026, 6, 22, 12, 0, 0),
				users: ["0xbuyer", "0xseller"],
			},
		];
		mocks.result.status = "active";

		renderPanel();

		const heading = container.querySelector(".trades-asset-heading");
		const trade = container.querySelector<HTMLAnchorElement>('a[href="https://example.test/tx/0xabc"]');
		expect(heading?.textContent).toBe("(HYPE)");
		expect(heading?.closest("button")).toBeNull();
		expect(trade?.children[1]?.textContent).toBe("1.25");

		mocks.sizeMode = "quote";
		renderPanel();

		expect(container.querySelector(".trades-asset-heading")?.textContent).toBe("(USDC)");
		expect(
			container.querySelector<HTMLAnchorElement>('a[href="https://example.test/tx/0xabc"]')?.children[1]?.textContent,
		).toBe("80.63");
	});

	it("preserves the subscription error state", () => {
		mocks.result.error = new Error("Subscription unavailable");
		mocks.result.status = "error";

		renderPanel();

		expect(container.textContent).toContain("Subscription unavailable");
	});

	function renderPanel() {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<TradesPanel showInQuote={mocks.sizeMode === "quote"} />
				</I18nProvider>,
			),
		);
	}
});
