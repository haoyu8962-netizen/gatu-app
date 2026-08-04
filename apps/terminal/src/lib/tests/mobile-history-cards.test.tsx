/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	downloadCsv: vi.fn(),
	navigateToMarket: vi.fn(),
	setActiveTab: vi.fn(),
}));

vi.mock("boneyard-js/react", () => ({
	Skeleton: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/hooks/trade/use-user-fills", () => ({
	useUserFills: () => ({
		error: null,
		isConnected: true,
		status: "ready",
		fills: [
			{
				coin: "BTC",
				closedPnl: "12.5",
				dir: "Open Long",
				fee: "0.12",
				feeToken: "USDC",
				hash: "0xaaa",
				liquidation: null,
				px: "100000",
				sz: "0.01",
				tid: 1,
				time: 1_754_350_400_000,
			},
			{
				coin: "ETH",
				closedPnl: "0",
				dir: "Close Long",
				fee: "0.08",
				feeToken: "USDC",
				hash: "0xbbb",
				liquidation: null,
				px: "3500",
				sz: "0.1",
				tid: 2,
				time: 1_754_350_500_000,
			},
		],
	}),
}));

vi.mock("@/hooks/trade/use-historical-orders", () => ({
	useHistoricalOrders: () => ({
		error: null,
		isConnected: true,
		status: "ready",
		orders: [
			{
				status: "filled",
				statusTimestamp: 1_754_350_600_000,
				order: {
					coin: "BTC",
					oid: 11,
					orderType: "Limit",
					origSz: "0.02",
					reduceOnly: false,
					side: "B",
					timestamp: 1_754_350_400_000,
				},
			},
			{
				status: "canceled",
				statusTimestamp: 1_754_350_700_000,
				order: {
					coin: "ETH",
					oid: 12,
					orderType: "Stop Market",
					origSz: "0.2",
					reduceOnly: true,
					side: "A",
					timestamp: 1_754_350_500_000,
				},
			},
		],
	}),
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({
	useMarketNavigation: () => mocks.navigateToMarket,
}));

vi.mock("@/hooks/trade/use-order-display-labels", () => ({
	useOrderDisplayLabels: () => ({
		getHistoricalOrderStatusLabel: (status: string) => (status === "filled" ? "Filled" : "Canceled"),
		getOrderSideLabel: (side: "A" | "B", reduceOnly: boolean) =>
			reduceOnly ? (side === "B" ? "Close Short" : "Close Long") : side === "B" ? "Buy" : "Sell",
		getOrderTypeLabel: (type: string) => type,
	}),
}));

vi.mock("@/lib/csv", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/csv")>()),
	downloadCsv: mocks.downloadCsv,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: "0x1111111111111111111111111111111111111111",
		isConnected: true,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	getExplorerTxUrl: (hash: string) => `https://explorer.test/${hash}`,
	useMarkets: () => ({
		getMarket: (coin: string) => ({ kind: "perp", shortName: coin, szDecimals: coin === "BTC" ? 4 : 3 }),
		getSzDecimals: (coin: string) => (coin === "BTC" ? 4 : 3),
	}),
	useSubscription: () => ({
		data: {
			fundings: [
				{ coin: "BTC", fundingRate: "0.0001", szi: "0.01", time: 1_754_350_400_000, usdc: "1.25" },
				{ coin: "ETH", fundingRate: "-0.0002", szi: "-0.2", time: 1_754_350_500_000, usdc: "-0.75" },
			],
		},
		status: "active",
		error: null,
	}),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => "en-US",
	useIsTestnet: () => false,
}));

vi.mock("@/components/trade/components/historical-order-price", () => ({
	HistoricalOrderPrice: () => <>$100,000</>,
}));

vi.mock("@/components/trade/mobile/use-mobile-terminal-tab", () => ({
	useMobileTerminalTab: () => ({ setActiveTab: mocks.setActiveTab }),
}));

import { MobileFundingTab } from "@/components/trade/mobile/mobile-funding-tab";
import { MobileHistoryTab } from "@/components/trade/mobile/mobile-history-tab";
import { MobileOrdersHistoryTab } from "@/components/trade/mobile/mobile-orders-history-tab";

describe("mobile history disclosure cards", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function render(component: ReactElement) {
		act(() => {
			root.render(<I18nProvider i18n={i18n}>{component}</I18nProvider>);
		});
	}

	function getDisclosureButtons() {
		return Array.from(container.querySelectorAll<HTMLButtonElement>("article button[aria-expanded]"));
	}

	function clickButton(label: string) {
		const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(candidate) => candidate.textContent === label,
		);
		expect(button).toBeDefined();
		act(() => button?.click());
	}

	function expectDisclosureControls() {
		let disclosureButtons = getDisclosureButtons();
		expect(disclosureButtons.map((button) => button.getAttribute("aria-expanded"))).toEqual(["true", "false"]);
		expect(disclosureButtons.every((button) => button.parentElement?.className.includes("min-h-[54px]"))).toBe(true);

		act(() => disclosureButtons[1]?.click());
		disclosureButtons = getDisclosureButtons();
		expect(disclosureButtons.map((button) => button.getAttribute("aria-expanded"))).toEqual(["true", "true"]);

		act(() => disclosureButtons[0]?.click());
		expect(getDisclosureButtons().map((button) => button.getAttribute("aria-expanded"))).toEqual(["false", "true"]);

		clickButton("Collapse all");
		expect(getDisclosureButtons().map((button) => button.getAttribute("aria-expanded"))).toEqual(["false", "false"]);

		clickButton("Expand all");
		expect(getDisclosureButtons().map((button) => button.getAttribute("aria-expanded"))).toEqual(["true", "true"]);
		const collapseButtons = Array.from(
			container.querySelectorAll<HTMLButtonElement>("article button[aria-controls]:not([aria-expanded])"),
		);
		expect(collapseButtons).toHaveLength(2);
		expect(collapseButtons.every((button) => button.className.includes("size-11"))).toBe(true);

		for (const label of ["Expand all", "Collapse all"]) {
			const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
				(candidate) => candidate.textContent === label,
			);
			expect(button?.className).toContain("min-h-11");
		}
	}

	it("keeps trade history values, explorer links, and independent disclosure state", () => {
		render(<MobileHistoryTab scrollMode="page" />);

		expect(container.querySelectorAll("article")).toHaveLength(2);
		expect(container.textContent).toContain("Realized PNL");
		expect(container.textContent).toContain("Fee");
		const explorer = container.querySelector<HTMLAnchorElement>('a[href="https://explorer.test/0xaaa"]');
		expect(explorer?.target).toBe("_blank");
		expect(explorer?.className).toContain("min-h-11");
		const marketButton = container.querySelector<HTMLButtonElement>('button[aria-label="Switch to BTC market"]');
		expect(marketButton?.className).toContain("min-h-11");
		act(() => marketButton?.click());
		expect(mocks.navigateToMarket).toHaveBeenCalledWith("BTC", undefined, { displayedContent: "trade" });
		expect(mocks.setActiveTab).toHaveBeenCalledWith("trade");
		expect(getDisclosureButtons()[0]?.getAttribute("aria-expanded")).toBe("true");
		expectDisclosureControls();
		clickButton("Export CSV");
		expect(mocks.downloadCsv).toHaveBeenCalledWith(
			"trade_history.csv",
			expect.arrayContaining([expect.arrayContaining(["Time", "Asset", "Direction", "Transaction"])]),
		);
	});

	it("keeps funding position, payment, rate, and direction semantics", () => {
		render(<MobileFundingTab scrollMode="page" />);

		expect(container.querySelectorAll("article")).toHaveLength(2);
		expect(container.textContent).toContain("Position");
		expect(container.textContent).toContain("Payment");
		expect(container.textContent).toContain("Rate");
		expect(container.textContent).toContain("Short");
		expect(container.textContent).toContain("Cumulative funding");
		expectDisclosureControls();
		clickButton("Export CSV");
		expect(mocks.downloadCsv).toHaveBeenCalledWith(
			"funding_history.csv",
			expect.arrayContaining([expect.arrayContaining(["Time", "Asset", "Position", "Rate", "Payment"])]),
		);
	});

	it("keeps historical order labels and expands cards independently", () => {
		render(<MobileOrdersHistoryTab scrollMode="page" />);

		expect(container.querySelectorAll("article")).toHaveLength(2);
		expect(container.textContent).toContain("Limit");
		expect(container.textContent).toContain("Buy");
		expect(container.textContent).toContain("Filled");
		expect(container.textContent).toContain("Updated");
		expect(container.textContent).toContain("All types");
		expect(container.textContent).toContain("All statuses");
		expect(Array.from(container.querySelectorAll("label"), (label) => label.textContent)).toEqual([
			"Order type",
			"Order status",
		]);
		expectDisclosureControls();
		expect(container.textContent).toContain("Close Long");
		expect(container.textContent).not.toContain("Short order");
		clickButton("Export CSV");
		expect(mocks.downloadCsv).toHaveBeenCalledWith(
			"order_history.csv",
			expect.arrayContaining([expect.arrayContaining(["Time", "Asset", "Direction", "Type", "Status"])]),
		);
	});
});
