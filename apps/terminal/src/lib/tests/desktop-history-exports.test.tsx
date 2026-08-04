/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FundingTab } from "@/components/trade/positions/funding-tab";
import { HistoryTab } from "@/components/trade/positions/history-tab";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	downloadCsv: vi.fn(),
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
		],
		isConnected: true,
		status: "ready",
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

		expect(container.querySelector('[data-testid="trade-history-footer"]')).not.toBeNull();
		clickExport();
		expect(mocks.downloadCsv).toHaveBeenCalledWith(
			"trade_history.csv",
			expect.arrayContaining([expect.arrayContaining(["Time", "Asset", "Direction", "Transaction"])]),
		);
	});

	it("labels cumulative funding and exports the loaded funding rows", () => {
		act(() => root.render(<FundingTab />));

		expect(container.textContent).toContain("Cumulative funding");
		expect(container.querySelector('[data-testid="funding-history-footer"]')).not.toBeNull();
		clickExport();
		expect(mocks.downloadCsv).toHaveBeenCalledWith(
			"funding_history.csv",
			expect.arrayContaining([expect.arrayContaining(["Time", "Asset", "Position", "Rate", "Payment"])]),
		);
	});
});
