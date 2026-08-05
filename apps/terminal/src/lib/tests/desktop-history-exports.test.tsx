/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FundingTab } from "@/components/trade/positions/funding-tab";
import { HistoryTab } from "@/components/trade/positions/history-tab";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	downloadCsv: vi.fn(),
	fills: [
		{
			coin: "BTC",
			closedPnl: "12.5",
			dir: "Close Long",
			fee: "0.12",
			feeToken: "USDC",
			hash: "0xaaa",
			liquidation: null,
			px: "100000",
			side: "A",
			sz: "0.01",
			tid: 1,
			time: 1_754_350_400_000,
		},
	] as Array<Record<string, unknown>>,
	fundings: [
		{ coin: "BTC", fundingRate: "0.0001", nSamples: null, szi: "0.01", time: 1_754_350_400_000, usdc: "1.25" },
	] as Array<Record<string, unknown>>,
}));

vi.mock("@/components/trade/components/asset-badge", () => ({
	AssetBadge: ({ coin }: { coin: string }) => <span>{coin}</span>,
}));

vi.mock("@/components/ui/scroll-area", () => ({
	ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	ScrollBar: () => null,
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({
	useMarketNavigation: () => vi.fn(),
}));

vi.mock("@/hooks/trade/use-user-fills", () => ({
	useUserFills: () => ({
		error: null,
		fills: mocks.fills,
		isConnected: true,
		status: "ready",
	}),
}));

vi.mock("@/hooks/trade/use-user-funding", () => ({
	useUserFunding: () => ({
		error: null,
		fundings: mocks.fundings,
		isConnected: true,
		status: "ready",
	}),
}));

vi.mock("@/hooks/trade/use-history-csv-export", () => ({
	useFundingHistoryCsvExport: ({
		buildRows,
		filename,
	}: {
		buildRows: (items: unknown[]) => string[][];
		filename: string;
	}) => ({
		exportCsv: async () =>
			mocks.downloadCsv(
				filename,
				buildRows([
					{ coin: "BTC", fundingRate: "0.0001", nSamples: null, szi: "0.01", time: 1_754_350_400_000, usdc: "1.25" },
				]),
			),
		isExporting: false,
	}),
	useUserFillsCsvExport: ({
		buildRows,
		filename,
	}: {
		buildRows: (items: unknown[]) => string[][];
		filename: string;
	}) => ({
		exportCsv: async () =>
			mocks.downloadCsv(
				filename,
				buildRows([
					{
						coin: "BTC",
						closedPnl: "12.5",
						dir: "Close Long",
						fee: "0.12",
						feeToken: "USDC",
						hash: "0xaaa",
						liquidation: null,
						px: "100000",
						side: "A",
						sz: "0.01",
						tid: 1,
						time: 1_754_350_400_000,
					},
				]),
			),
		isExporting: false,
	}),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: "0x1111111111111111111111111111111111111111",
		isConnected: true,
	}),
}));

vi.mock("@/lib/csv", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/csv")>()),
	downloadCsv: mocks.downloadCsv,
}));

vi.mock("@/lib/hyperliquid", () => ({
	getExplorerTxUrl: (hash: string) => `https://explorer.test/${hash}`,
	useMarkets: () => ({
		getMarket: (coin: string) => ({ kind: "perp", shortName: coin, szDecimals: 4 }),
		getSzDecimals: () => 4,
	}),
	useSubscription: () => ({
		data: {
			fundings: [{ coin: "BTC", fundingRate: "0.0001", szi: "0.01", time: 1_754_350_400_000, usdc: "1.25" }],
		},
		error: null,
		status: "active",
	}),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => "en-US",
	useIsTestnet: () => false,
}));

describe("desktop history exports", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.fills = [
			{
				coin: "BTC",
				closedPnl: "12.5",
				dir: "Close Long",
				fee: "0.12",
				feeToken: "USDC",
				hash: "0xaaa",
				liquidation: null,
				px: "100000",
				side: "A",
				sz: "0.01",
				tid: 1,
				time: 1_754_350_400_000,
			},
		];
		mocks.fundings = [
			{ coin: "BTC", fundingRate: "0.0001", nSamples: null, szi: "0.01", time: 1_754_350_400_000, usdc: "1.25" },
		];
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		mocks.downloadCsv.mockReset();
	});

	function clickExport() {
		const button = Array.from(container.querySelectorAll("button")).find(
			(candidate) => candidate.textContent === "Export CSV",
		);
		expect(button).toBeDefined();
		act(() => button?.click());
	}

	it("exports the currently loaded fill rows with localized headers", () => {
		act(() => root.render(<HistoryTab />));

		const footer = container.querySelector('[data-testid="trade-history-footer"]');
		expect(footer).not.toBeNull();
		expect(Array.from(container.querySelectorAll("th"), (cell) => cell.textContent)).toEqual([
			"Asset",
			"Direction",
			"Price",
			"Size",
			"Fee",
			"PNL",
			"Time",
		]);
		expect(container.querySelector("table")?.className).toContain("min-w-[1280px]");
		expect(Array.from(container.querySelectorAll("col"), (column) => column.className)).toEqual([
			"w-[138px]",
			"w-[126px]",
			"",
			"w-[126px]",
			"w-[146px]",
			"w-[146px]",
			"w-[178px]",
		]);
		const directionBadge = Array.from(container.querySelectorAll("span")).find(
			(node) => node.textContent === "Close Long",
		);
		expect(directionBadge?.className).toContain("rounded-[4px]");
		expect(directionBadge?.className).toContain("bg-market-close-hover");
		expect(container.querySelector("tbody td")?.className).toContain("h-[43px]");
		expect(footer?.className).toContain("h-[38px]");
		expect(footer?.querySelector("svg")).toBeNull();
		clickExport();
		expect(mocks.downloadCsv).toHaveBeenCalledWith(
			"trade_history.csv",
			expect.arrayContaining([expect.arrayContaining(["Time", "Asset", "Direction", "Transaction"])]),
		);
	});

	it("keeps full trade export available when the recent display window is empty", () => {
		mocks.fills = [];
		act(() => root.render(<HistoryTab />));

		const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(candidate) => candidate.textContent === "Export CSV",
		);
		expect(container.textContent).toContain("No fills found.");
		expect(button?.disabled).toBe(false);
		act(() => button?.click());
		expect(mocks.downloadCsv).toHaveBeenCalledOnce();
	});

	it("labels the visible funding range and exports the complete requested history", () => {
		act(() => root.render(<FundingTab />));

		expect(container.textContent).toContain("Funding shown");
		const toolbar = container.querySelector('[data-testid="funding-history-toolbar"]');
		expect(toolbar).not.toBeNull();
		expect(container.querySelector('[data-testid="funding-history-footer"]')).toBeNull();
		expect(container.querySelector("tbody td")?.className).toContain("h-10");
		expect(container.querySelector("table")?.className).toContain("min-w-[1280px]");
		expect(Array.from(container.querySelectorAll("col"), (column) => column.className)).toEqual([
			"w-[138px]",
			"",
			"w-[146px]",
			"w-[166px]",
			"w-[178px]",
		]);
		clickExport();
		expect(mocks.downloadCsv).toHaveBeenCalledWith(
			"funding_history.csv",
			expect.arrayContaining([expect.arrayContaining(["Time", "Asset", "Position", "Rate", "Payment"])]),
		);
	});

	it("keeps full funding export available when the recent display window is empty", () => {
		mocks.fundings = [];
		act(() => root.render(<FundingTab />));

		const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(candidate) => candidate.textContent === "Export CSV",
		);
		expect(container.textContent).toContain("No funding payments found.");
		expect(button?.disabled).toBe(false);
		act(() => button?.click());
		expect(mocks.downloadCsv).toHaveBeenCalledOnce();
	});
});
