/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	address: "0x1111111111111111111111111111111111111111",
	downloadCsv: vi.fn(),
	fills: [] as Array<Record<string, unknown>>,
	fundings: [] as Array<Record<string, unknown>>,
	navigateToMarket: vi.fn(),
	orders: [] as Array<Record<string, unknown>>,
	setActiveTab: vi.fn(),
}));

const OWNER_A = "0x1111111111111111111111111111111111111111";
const OWNER_B = "0x2222222222222222222222222222222222222222";

function createFills() {
	return [
		{
			coin: "BTC",
			closedPnl: "12.5",
			crossed: false,
			dir: "Open Long",
			fee: "0.12",
			feeToken: "USDC",
			hash: "0xaaa",
			liquidation: null,
			oid: 101,
			px: "100000",
			side: "B",
			startPosition: "0",
			sz: "0.01",
			tid: 1,
			time: 1_754_350_400_000,
			twapId: null,
		},
		{
			coin: "ETH",
			closedPnl: "0",
			crossed: true,
			dir: "Close Long",
			fee: "0.08",
			feeToken: "USDC",
			hash: "0xbbb",
			liquidation: null,
			oid: 102,
			px: "3500",
			side: "A",
			startPosition: "0.1",
			sz: "0.1",
			tid: 2,
			time: 1_754_350_500_000,
			twapId: 42,
		},
	];
}

function createOrders() {
	return [
		{
			status: "filled",
			statusTimestamp: 1_754_350_600_000,
			order: {
				coin: "BTC",
				isTrigger: false,
				limitPx: "100000",
				oid: 11,
				orderType: "Limit",
				origSz: "0.02",
				reduceOnly: false,
				side: "B",
				timestamp: 1_754_350_400_000,
				triggerPx: "0",
			},
		},
		{
			status: "canceled",
			statusTimestamp: 1_754_350_700_000,
			order: {
				coin: "ETH",
				isTrigger: true,
				limitPx: "0",
				oid: 12,
				orderType: "Stop Market",
				origSz: "0.2",
				reduceOnly: true,
				side: "A",
				timestamp: 1_754_350_500_000,
				triggerPx: "3400",
			},
		},
	];
}

function createFundings() {
	return [
		{ coin: "BTC", fundingRate: "0.0001", szi: "0.01", time: 1_754_350_400_000, usdc: "1.25" },
		{ coin: "ETH", fundingRate: "-0.0002", szi: "-0.2", time: 1_754_350_500_000, usdc: "-0.75" },
	];
}

vi.mock("boneyard-js/react", () => ({
	Skeleton: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/hooks/trade/use-user-fills", () => ({
	useUserFills: () => ({
		error: null,
		isConnected: true,
		status: "ready",
		fills: mocks.fills,
	}),
}));

vi.mock("@/hooks/trade/use-historical-orders", () => ({
	useHistoricalOrders: () => ({
		error: null,
		isConnected: true,
		status: "ready",
		orders: mocks.orders,
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
		address: mocks.address,
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
			fundings: mocks.fundings,
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
		mocks.address = OWNER_A;
		mocks.fills = createFills();
		mocks.fundings = createFundings();
		mocks.orders = createOrders();
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

	async function selectOption(fieldLabel: string, optionLabel: string) {
		const label = Array.from(container.querySelectorAll("label")).find(
			(candidate) => candidate.textContent === fieldLabel,
		);
		const trigger = label?.parentElement?.querySelector<HTMLButtonElement>('[role="combobox"]');
		expect(trigger).toBeDefined();
		await act(async () => {
			trigger?.click();
			await Promise.resolve();
		});
		const option = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]')).find((candidate) =>
			candidate.textContent?.includes(optionLabel),
		);
		expect(option).toBeDefined();
		await act(async () => {
			option?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
			await Promise.resolve();
			option?.click();
			await Promise.resolve();
		});
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
		expect(collapseButtons.every((button) => button.querySelector("path")?.getAttribute("stroke-width") === "2")).toBe(
			true,
		);

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
		expect(Array.from(container.querySelectorAll("label"), (label) => label.textContent)).toEqual([
			"Type",
			"Direction",
			"Role",
		]);
		expect(container.textContent).toContain("All types");
		expect(container.textContent).toContain("All Directions");
		expect(container.textContent).toContain("All roles");
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
		expect(Array.from(container.querySelectorAll("label"), (label) => label.textContent)).toEqual(["Direction"]);
		expect(container.textContent).toContain("All Directions");
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
		expect(container.textContent).toContain("All Directions");
		expect(container.textContent).toContain("All statuses");
		expect(Array.from(container.querySelectorAll("label"), (label) => label.textContent)).toEqual([
			"Order type",
			"Direction",
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

	it("filters trade history by SDK-backed type, side, and maker/taker role without carrying state to another owner", async () => {
		render(<MobileHistoryTab scrollMode="page" />);

		await selectOption("Type", "TWAP");
		expect(container.querySelectorAll("article")).toHaveLength(1);
		expect(container.querySelector('[aria-label="Switch to ETH market"]')).not.toBeNull();
		await selectOption("Type", "All types");
		expect(container.querySelectorAll("article")).toHaveLength(2);

		await selectOption("Direction", "Sell");
		expect(container.querySelectorAll("article")).toHaveLength(1);
		expect(container.querySelector('[aria-label="Switch to ETH market"]')).not.toBeNull();
		await selectOption("Direction", "All Directions");
		expect(container.querySelectorAll("article")).toHaveLength(2);

		await selectOption("Role", "Taker");
		expect(container.querySelectorAll("article")).toHaveLength(1);
		expect(container.querySelector('[aria-label="Switch to ETH market"]')).not.toBeNull();
		clickButton("Export CSV");
		const exportRows = mocks.downloadCsv.mock.calls.at(-1)?.[1] as string[][] | undefined;
		expect(exportRows).toHaveLength(2);
		expect(exportRows?.flat()).toContain("ETH");
		expect(exportRows?.flat()).not.toContain("BTC");

		clickButton("Collapse all");
		expect(getDisclosureButtons()[0]?.getAttribute("aria-expanded")).toBe("false");
		mocks.address = OWNER_B;
		render(<MobileHistoryTab scrollMode="page" />);

		expect(container.querySelectorAll("article")).toHaveLength(2);
		expect(Array.from(container.querySelectorAll('[role="combobox"]'), (trigger) => trigger.textContent)).toEqual([
			"All types",
			"All Directions",
			"All roles",
		]);
		expect(getDisclosureButtons().map((button) => button.getAttribute("aria-expanded"))).toEqual(["true", "false"]);
	});

	it("filters funding by the Big.js sign of szi without carrying state to another owner", async () => {
		render(<MobileFundingTab scrollMode="page" />);

		await selectOption("Direction", "Short");
		expect(container.querySelectorAll("article")).toHaveLength(1);
		expect(container.querySelector('[aria-label="Switch to ETH market"]')).not.toBeNull();
		clickButton("Export CSV");
		const exportRows = mocks.downloadCsv.mock.calls.at(-1)?.[1] as string[][] | undefined;
		expect(exportRows).toHaveLength(2);
		expect(exportRows?.flat()).toContain("ETH");
		expect(exportRows?.flat()).not.toContain("BTC");

		clickButton("Collapse all");
		expect(getDisclosureButtons()[0]?.getAttribute("aria-expanded")).toBe("false");
		mocks.address = OWNER_B;
		render(<MobileFundingTab scrollMode="page" />);

		expect(container.querySelectorAll("article")).toHaveLength(2);
		expect(container.querySelector('[role="combobox"]')?.textContent).toBe("All Directions");
		expect(getDisclosureButtons().map((button) => button.getAttribute("aria-expanded"))).toEqual(["true", "false"]);
	});

	it("filters order history by SDK order type, side, and normalized status without carrying state to another owner", async () => {
		render(<MobileOrdersHistoryTab scrollMode="page" />);

		await selectOption("Order type", "Stop Market");
		expect(container.querySelectorAll("article")).toHaveLength(1);
		expect(container.querySelector('[aria-label="Switch to ETH market, Close Long order"]')).not.toBeNull();
		await selectOption("Order type", "All types");
		expect(container.querySelectorAll("article")).toHaveLength(2);

		await selectOption("Direction", "Sell");
		expect(container.querySelectorAll("article")).toHaveLength(1);
		expect(container.querySelector('[aria-label="Switch to ETH market, Close Long order"]')).not.toBeNull();
		await selectOption("Direction", "All Directions");
		expect(container.querySelectorAll("article")).toHaveLength(2);

		await selectOption("Order status", "Canceled");
		expect(container.querySelectorAll("article")).toHaveLength(1);
		expect(container.querySelector('[aria-label="Switch to ETH market, Close Long order"]')).not.toBeNull();
		clickButton("Export CSV");
		const exportRows = mocks.downloadCsv.mock.calls.at(-1)?.[1] as string[][] | undefined;
		expect(exportRows).toHaveLength(2);
		expect(exportRows?.flat()).toContain("ETH");
		expect(exportRows?.flat()).not.toContain("BTC");

		clickButton("Collapse all");
		expect(getDisclosureButtons()[0]?.getAttribute("aria-expanded")).toBe("false");
		mocks.address = OWNER_B;
		render(<MobileOrdersHistoryTab scrollMode="page" />);

		expect(container.querySelectorAll("article")).toHaveLength(2);
		expect(Array.from(container.querySelectorAll('[role="combobox"]'), (trigger) => trigger.textContent)).toEqual([
			"All types",
			"All Directions",
			"All statuses",
		]);
		expect(getDisclosureButtons().map((button) => button.getAttribute("aria-expanded"))).toEqual(["true", "false"]);
	});
});
