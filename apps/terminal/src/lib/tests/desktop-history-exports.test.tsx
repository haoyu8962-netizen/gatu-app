/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
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
	fundingError: undefined as unknown,
	fundingOffline: false,
	fundingStatus: "ready" as "error" | "idle" | "loading" | "offline" | "ready",
}));

vi.mock("@/components/trade/components/asset-badge", () => ({
	AssetBadge: ({ coin }: { coin: string }) => <span>{coin}</span>,
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

vi.mock("@/components/ui/skeleton", () => ({
	Skeleton: ({ children }: { children: ReactNode }) => children,
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
		error: mocks.fundingError,
		fundings: mocks.fundings,
		isConnected: true,
		isOffline: mocks.fundingOffline,
		status: mocks.fundingStatus,
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
		mocks.fundingError = undefined;
		mocks.fundingOffline = false;
		mocks.fundingStatus = "ready";
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		mocks.downloadCsv.mockReset();
		vi.useRealTimers();
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
			"Type",
			"Price",
			"Size",
			"Fee",
			"PNL",
			"Time",
		]);
		expect(container.querySelector("table")?.className).toContain("min-w-[53rem]");
		expect(Array.from(container.querySelectorAll("col"), (column) => column.className)).toEqual([
			"w-[132px]",
			"w-[116px]",
			"w-[72px]",
			"w-[100px]",
			"w-[100px]",
			"w-[100px]",
			"w-[100px]",
			"w-[128px]",
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

	it("labels ordinary fills as trades", () => {
		act(() => root.render(<HistoryTab />));

		expect(container.textContent).toContain("Trade");
		expect(container.textContent).not.toContain("TWAP");
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
		const footer = container.querySelector('[data-testid="funding-history-footer"]');
		expect(footer).not.toBeNull();
		expect(
			footer?.querySelector('a[href="/fundingHistory/0x1111111111111111111111111111111111111111"]'),
		).not.toBeNull();
		expect(container.querySelector("tbody td")?.className).toContain("h-10");
		expect(container.querySelector("table")?.className).toContain("min-w-[52rem]");
		expect(Array.from(container.querySelectorAll("col"), (column) => column.className)).toEqual([
			"w-[136px]",
			"w-[176px]",
			"w-[144px]",
			"w-[160px]",
			"w-[216px]",
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

	it("keeps funding rows visible when live updates pause", () => {
		mocks.fundingError = new Error("WebSocket unavailable");
		act(() => root.render(<FundingTab />));

		expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
		expect(container.textContent).toContain("Funding updates paused.");
	});

	it("shows offline explicitly and preserves already loaded funding rows", () => {
		mocks.fundingOffline = true;
		act(() => root.render(<FundingTab />));

		expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
		expect(container.textContent).toContain("You are offline.");

		mocks.fundings = [];
		mocks.fundingStatus = "offline";
		act(() => root.render(<FundingTab />));
		expect(container.textContent).toContain("Funding payments will load when the connection returns.");
		expect(container.querySelector('[data-testid="funding-loading-skeleton"]')).toBeNull();
	});

	it("delays the visible funding skeleton while announcing loading accessibly", () => {
		vi.useFakeTimers();
		mocks.fundings = [];
		mocks.fundingStatus = "loading";
		act(() => root.render(<FundingTab />));

		const status = container.querySelector("output");
		expect(status?.className).toContain("sr-only");
		expect(status?.textContent).toContain("Loading funding payments.");
		expect(container.querySelector('[data-testid="funding-loading-skeleton"]')).toBeNull();

		act(() => vi.advanceTimersByTime(249));
		expect(container.querySelector('[data-testid="funding-loading-skeleton"]')).toBeNull();

		act(() => vi.advanceTimersByTime(1));
		expect(container.querySelector('[data-testid="funding-loading-skeleton"]')).not.toBeNull();
	});
});
