// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileMarketBar } from "@/components/trade/mobile/mobile-market-bar";

const mocks = vi.hoisted(() => ({
	selectedMarket: {
		kind: "spot",
		name: "@999",
		pairName: "TOKEN-USDH",
		markPx: "1.25",
		prevDayPx: "1.0",
		dayNtlVlm: "12345.67",
		circulatingSupply: "1000",
		szDecimals: 2,
		tokensInfo: [
			{
				name: "TOKEN",
				displayName: "TOKEN",
				tokenId: "0x11111111111111111111111111111111",
			},
			{
				name: "USDH",
				displayName: "USDH",
				tokenId: "0x22222222222222222222222222222222",
			},
		],
	},
}));

vi.mock("@/components/trade/chart/token-selector", () => ({
	TokenSelector: () => <span>Token selector</span>,
}));

vi.mock("@/components/trade/components/market-asset-info", () => ({
	MarketAssetInfo: () => <span>Asset</span>,
}));

vi.mock("@/components/trade/components/spot-market-social-links", () => ({
	SpotMarketSocialIconLinks: () => null,
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({
	useMarketNavigation: () => vi.fn(),
}));

vi.mock("@/hooks/trade/use-orderbook-mid-price", () => ({
	useOrderbookMidPrice: () => ({ midPx: undefined }),
}));

vi.mock("@/hooks/ui/use-copy-to-clipboard", () => ({
	useCopyToClipboard: () => ({ copied: false, copy: vi.fn() }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	getExplorerTokenUrl: (address: string) => `/explorer/token/${address}`,
	getMarketApiCoin: (market: { name?: string } | undefined) => market?.name ?? "",
	getSpotMarketApiCoin: (market: { name?: string } | undefined) => market?.name ?? "",
	useSelectedMarketInfo: () => ({ data: mocks.selectedMarket }),
	useSubscription: () => ({ data: undefined, status: "idle" }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("MobileMarketBar", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("labels expanded spot notionals with the selected quote token", () => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<MobileMarketBar />
				</I18nProvider>,
			),
		);

		const expandButton = container.querySelector<HTMLButtonElement>('button[aria-label="Expand market details"]');
		expect(expandButton).not.toBeNull();
		act(() => expandButton?.click());

		expect(container.textContent).toContain("24H VOL12,345.67 USDH");
		expect(container.textContent).toContain("Market Cap1,250 USDH");
		expect(container.textContent).not.toContain("$12,345.67");
	});
});
