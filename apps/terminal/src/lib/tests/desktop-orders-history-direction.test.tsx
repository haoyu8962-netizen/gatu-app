/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrdersHistoryTab } from "@/components/trade/positions/orders-history-tab";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	address: "0x1111111111111111111111111111111111111111" as `0x${string}`,
	downloadCsv: vi.fn(),
	orders: [] as Array<Record<string, unknown>>,
}));

function createOrders() {
	return [
		{
			status: "filled",
			statusTimestamp: 2,
			order: {
				coin: "BTC",
				limitPx: "0.18342",
				oid: 1,
				orderType: "Limit",
				origSz: "1.2345",
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
	];
}

function getOrderHistoryEntries() {
	return mocks.orders.map((entry) => {
		const order = entry.order as Record<string, unknown>;
		return {
			coin: order.coin,
			createdAt: order.timestamp,
			key: `order:${String(order.oid)}`,
			kind: "order",
			order: entry,
			reduceOnly: order.reduceOnly,
			side: order.side,
			size: order.origSz,
			type: order.orderType,
			updatedAt: entry.statusTimestamp,
		};
	});
}

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

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, params, to, ...props }: { children?: ReactNode; params?: { address?: string }; to: string }) => (
		<a href={to.replace("$address", params?.address ?? "")} {...props}>
			{children}
		</a>
	),
}));

vi.mock("@/components/ui/scroll-area", () => ({
	ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	ScrollBar: () => null,
}));

vi.mock("@/hooks/trade/use-historical-orders", () => ({
	useHistoricalOrders: () => ({
		entries: getOrderHistoryEntries(),
		error: null,
		isConnected: true,
		isOffline: false,
		isStale: false,
		status: "ready",
		orders: mocks.orders,
	}),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: mocks.address,
		isConnected: true,
	}),
}));

vi.mock("@/hooks/trade/use-history-csv-export", () => ({
	useHistoricalOrdersCsvExport: ({
		buildRows,
		filename,
	}: {
		buildRows: (items: unknown[]) => string[][];
		filename: string;
	}) => ({
		exportCsv: async () => mocks.downloadCsv(filename, buildRows(getOrderHistoryEntries())),
		isExporting: false,
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
	useHyperliquid: () => ({ env: "Mainnet" }),
	useMarkets: () => ({
		getMarket: () => ({ szDecimals: 3 }),
	}),
}));

describe("desktop order history direction semantics", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.address = "0x1111111111111111111111111111111111111111";
		mocks.orders = createOrders();
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

		const toolbar = container.querySelector('[data-testid="order-history-filters"]');
		expect(toolbar?.className).toContain("gap-2");
		expect(toolbar?.className).not.toContain("h-12");
		expect(container.querySelector("table")?.className).toContain("min-w-[62rem]");
		expect(Array.from(container.querySelectorAll("col"), (column) => column.className)).toEqual([
			"w-[144px]",
			"w-[116px]",
			"",
			"w-[136px]",
			"w-[120px]",
			"w-[112px]",
			"w-[160px]",
		]);
		expect(Array.from(container.querySelectorAll("th"), (cell) => cell.textContent)).toEqual([
			"Time",
			"Asset",
			"Type",
			"Price",
			"Size",
			"Status",
			"Updated",
		]);
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
		const filledBadge = Array.from(container.querySelectorAll("span")).find((node) => node.textContent === "Filled");
		const canceledBadge = Array.from(container.querySelectorAll("span")).find(
			(node) => node.textContent === "Canceled",
		);
		expect(filledBadge?.className).toContain("bg-success-soft");
		expect(canceledBadge?.className).toContain("bg-market-close-hover");
		expect(container.querySelector("tbody td")?.className).toContain("h-[58px]");
		const footer = container.querySelector('[data-testid="order-history-footer"]');
		expect(
			footer?.querySelector('a[href="/historicalOrders/0x1111111111111111111111111111111111111111"]'),
		).not.toBeNull();

		const exportButton = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent === "Export CSV",
		);
		expect(exportButton).toBeDefined();
		expect(exportButton?.querySelector("svg")).toBeNull();
		act(() => exportButton?.click());
		expect(mocks.downloadCsv).toHaveBeenCalledWith(
			"order_history.csv",
			expect.arrayContaining([expect.arrayContaining(["Time", "Asset", "Direction", "Type", "Status"])]),
		);
		const exportRows = mocks.downloadCsv.mock.calls.at(-1)?.[1] as string[][] | undefined;
		const header = exportRows?.[0] ?? [];
		const btcRow = exportRows?.find((row) => row.includes("BTC")) ?? [];
		expect(btcRow[header.indexOf("Price")]).toBe("0.18342");
		expect(btcRow[header.indexOf("Size")]).toBe("1.2345");
	});

	it("shows the official status names with each cancellation or rejection reason", () => {
		mocks.orders = [
			{
				status: "marginCanceled",
				statusTimestamp: 6,
				order: {
					coin: "BTC",
					oid: 3,
					orderType: "Limit",
					origSz: "1",
					sz: "1",
					reduceOnly: false,
					side: "B",
					timestamp: 5,
				},
			},
			{
				status: "filled",
				statusTimestamp: 8,
				order: {
					coin: "ETH",
					oid: 4,
					orderType: "Limit",
					origSz: "2",
					sz: "0.5",
					reduceOnly: false,
					side: "A",
					timestamp: 7,
				},
			},
			{
				status: "iocCancelRejected",
				statusTimestamp: 10,
				order: {
					coin: "SOL",
					oid: 5,
					orderType: "Limit",
					origSz: "3",
					sz: "3",
					reduceOnly: false,
					side: "B",
					timestamp: 9,
				},
			},
		];
		act(() => root.render(<OrdersHistoryTab />));

		const statuses = [...container.querySelectorAll("tbody tr")].map(
			(row) => row.querySelectorAll("td")[5]?.textContent?.trim() ?? "",
		);
		expect(statuses).toEqual(
			expect.arrayContaining([
				"Margin Canceled, Canceled due to insufficient margin",
				"Partially filled",
				"Rejected, Rejected because the IOC order could not match",
			]),
		);
		expect(statuses).toHaveLength(3);
	});

	it("keeps full order export available when the recent snapshot is empty", () => {
		mocks.orders = [];
		act(() => root.render(<OrdersHistoryTab />));

		const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(candidate) => candidate.textContent === "Export CSV",
		);
		expect(container.textContent).toContain("No order history found.");
		expect(button?.disabled).toBe(false);
		act(() => button?.click());
		expect(mocks.downloadCsv).toHaveBeenCalledOnce();
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

		mocks.orders = createOrders().slice(0, 1);
		act(() => root.render(<OrdersHistoryTab />));
		expect(container.querySelectorAll<HTMLButtonElement>('[role="combobox"]')[0]?.textContent).toContain("Stop Market");
		expect(container.querySelector('[aria-label="Switch to BTC market, Buy order"]')).toBeNull();

		mocks.address = "0x2222222222222222222222222222222222222222";
		act(() => root.render(<OrdersHistoryTab />));
		expect(container.querySelectorAll<HTMLButtonElement>('[role="combobox"]')[0]?.textContent).toContain("All types");
		expect(container.querySelector('[aria-label="Switch to BTC market, Buy order"]')).not.toBeNull();
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
