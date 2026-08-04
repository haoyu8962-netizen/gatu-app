/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrdersHistoryTab } from "@/components/trade/positions/orders-history-tab";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	downloadCsv: vi.fn(),
}));

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

vi.mock("@/lib/csv", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/csv")>()),
	downloadCsv: mocks.downloadCsv,
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
		mocks.downloadCsv.mockReset();
	});

	it("does not infer a position side from the exchange buy/sell side", () => {
		act(() => root.render(<OrdersHistoryTab />));

		expect(container.querySelector('[aria-label="Switch to BTC market, Buy order"]')).not.toBeNull();
		expect(container.querySelector('[aria-label="Switch to ETH market, Close Long order"]')).not.toBeNull();
		expect(container.textContent).not.toContain("Long order");
		expect(container.querySelector('[aria-label*="short order"]')).toBeNull();
		expect(container.textContent).toContain("All types");
		expect(container.textContent).toContain("All statuses");
		expect(Array.from(container.querySelectorAll("label"), (label) => label.textContent)).toEqual([
			"Order type",
			"Order status",
		]);

		const exportButton = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent === "Export CSV",
		);
		expect(exportButton).toBeDefined();
		act(() => exportButton?.click());
		expect(mocks.downloadCsv).toHaveBeenCalledWith(
			"order_history.csv",
			expect.arrayContaining([expect.arrayContaining(["Time", "Asset", "Direction", "Type", "Status"])]),
		);
	});

	it("filters the currently loaded rows by order type", async () => {
		act(() => root.render(<OrdersHistoryTab />));

		const typeTrigger = container.querySelectorAll<HTMLButtonElement>('[role="combobox"]')[0];
		expect(typeTrigger?.textContent).toContain("All types");
		await act(async () => {
			typeTrigger?.click();
			await Promise.resolve();
		});
		const stopMarketOption = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]')).find((option) =>
			option.textContent?.includes("Stop Market"),
		);
		expect(stopMarketOption).toBeDefined();
		await act(async () => {
			stopMarketOption?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
			await Promise.resolve();
			stopMarketOption?.click();
			await Promise.resolve();
		});

		expect(container.querySelector('[aria-label="Switch to BTC market, Buy order"]')).toBeNull();
		expect(container.querySelector('[aria-label="Switch to ETH market, Close Long order"]')).not.toBeNull();
		expect(container.textContent).toContain("1 order");
	});

	it("filters the currently loaded rows by normalized order status", async () => {
		act(() => root.render(<OrdersHistoryTab />));

		const statusTrigger = container.querySelectorAll<HTMLButtonElement>('[role="combobox"]')[1];
		expect(statusTrigger?.textContent).toContain("All statuses");
		await act(async () => {
			statusTrigger?.click();
			await Promise.resolve();
		});
		const canceledOption = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]')).find((option) =>
			option.textContent?.includes("Canceled"),
		);
		expect(canceledOption).toBeDefined();
		await act(async () => {
			canceledOption?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
			await Promise.resolve();
			canceledOption?.click();
			await Promise.resolve();
		});

		expect(container.querySelector('[aria-label="Switch to BTC market, Buy order"]')).toBeNull();
		expect(container.querySelector('[aria-label="Switch to ETH market, Close Long order"]')).not.toBeNull();
		expect(container.textContent).toContain("1 order");
	});
});
