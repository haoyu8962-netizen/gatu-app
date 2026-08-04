/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrdersHistoryTab } from "@/components/trade/positions/orders-history-tab";
import { createI18nRoot } from "./harness/react";

vi.mock("@/components/trade/components/asset-badge", () => ({
	AssetBadge: (props: { coin: string; "aria-label": string }) => (
		<button type="button" aria-label={props["aria-label"]}>
			{props.coin}
		</button>
	),
}));

vi.mock("@/components/trade/components/historical-order-price", () => ({
	HistoricalOrderPrice: () => <>$100</>,
}));

vi.mock("@/components/ui/scroll-area", () => ({
	ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	ScrollBar: () => null,
}));

vi.mock("@/hooks/trade/use-historical-orders", () => ({
	useHistoricalOrders: () => ({
		error: null,
		isConnected: true,
		status: "ready",
		orders: [
			{
				status: "filled",
				statusTimestamp: 2,
				order: {
					coin: "BTC",
					oid: 1,
					orderType: "Limit",
					origSz: "1",
					reduceOnly: false,
					side: "B",
					timestamp: 1,
				},
			},
			{
				status: "canceled",
				statusTimestamp: 4,
				order: {
					coin: "ETH",
					oid: 2,
					orderType: "Stop Market",
					origSz: "2",
					reduceOnly: true,
					side: "A",
					timestamp: 3,
				},
			},
		],
	}),
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({
	useMarketNavigation: () => vi.fn(),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useMarkets: () => ({
		getMarket: () => ({ szDecimals: 3 }),
	}),
}));

describe("desktop order history direction semantics", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("does not infer a position side from the exchange buy/sell side", () => {
		act(() => root.render(<OrdersHistoryTab />));

		expect(container.querySelector('[aria-label="Switch to BTC market, Buy order"]')).not.toBeNull();
		expect(container.querySelector('[aria-label="Switch to ETH market, Close Long order"]')).not.toBeNull();
		expect(container.textContent).not.toContain("Long order");
		expect(container.querySelector('[aria-label*="short order"]')).toBeNull();
	});
});
