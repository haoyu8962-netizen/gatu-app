// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarketOverview } from "@/components/trade/market-overview";

const mocks = vi.hoisted(() => ({
	perpCtxEvent: undefined as
		| {
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
	} as Record<string, unknown>,
}));

vi.mock("@gatu/ui", () => ({
	Tooltip: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/hooks/trade/use-orderbook-mid-price", () => ({
	useOrderbookMidPrice: () => ({ midPx: undefined, status: "idle" }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	getExplorerTokenUrl: (address: string) => `/explorer/token/${address}`,
	getMarketApiCoin: (market: { name?: string } | undefined) => market?.name ?? "",
	getSpotMarketApiCoin: () => "",
	useSelectedMarketInfo: () => ({ data: mocks.selectedMarket }),
	useSubscription: (method: string) => ({
		data: method === "activeAssetCtx" ? mocks.perpCtxEvent : undefined,
		status: "idle",
	}),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("MarketOverview", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
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
		};
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("uses the selected market snapshot while realtime subscriptions warm up", () => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<MarketOverview />
				</I18nProvider>,
			),
		);

		expect(container.textContent).toContain("Price71.8");
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

		expect(container.textContent).toContain("Price80");
		expect(container.textContent).toContain("24h Change+16 / +25.00%");
		expect(container.textContent).toContain("ORACLE79");
		expect(container.textContent).toContain("$10,000,000.00");
		expect(container.textContent).toContain("$160.00");
		expect(container.textContent).toContain("+0.0010%");
		expect(container.textContent).not.toContain("Price71.8");
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

	it("labels spot notionals with the selected market quote token", () => {
		mocks.selectedMarket = {
			kind: "spot",
			name: "@999",
			pairName: "TOKEN-USDH",
			markPx: "1.25",
			prevDayPx: "1.0",
			dayNtlVlm: "12345.67",
			circulatingSupply: "1000",
			szDecimals: 2,
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

		expect(container.textContent).toContain("24H VOL12,345.67 USDH");
		expect(container.textContent).toContain("Market Cap1,250 USDH");
		expect(container.textContent).not.toContain("$12,345.67");
	});
});
