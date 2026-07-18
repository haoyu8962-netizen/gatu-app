// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarketOverview } from "@/components/trade/market-overview";

const mocks = vi.hoisted(() => ({
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
	},
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
	useSubscription: () => ({ data: undefined, status: "idle" }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("MarketOverview", () => {
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

	it("uses the selected market snapshot while realtime subscriptions warm up", () => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<MarketOverview />
				</I18nProvider>,
			),
		);

		expect(container.textContent).toContain("$71.80");
		expect(container.textContent).toContain("$71.70");
		expect(container.textContent).toContain("$22,228,099.94");
		expect(container.textContent).toContain("$120,995,909.64");
		expect(container.textContent).toContain("+2.57%");
		expect(container.textContent).toContain("+0.0006%");
		expect(container.textContent).not.toContain("—");
		expect(container.textContent).not.toContain("0.0000%");
	});
});
