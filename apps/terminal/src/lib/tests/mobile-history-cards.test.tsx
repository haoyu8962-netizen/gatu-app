/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	address: "0x1111111111111111111111111111111111111111",
	downloadCsv: vi.fn(),
	fills: [] as Array<Record<string, unknown>>,
	fillsError: undefined as unknown,
	fillsOffline: false,
	fillsStale: false,
	fundings: [] as Array<Record<string, unknown>>,
	fundingError: undefined as unknown,
	fundingOffline: false,
	fundingStale: false,
	fundingStatus: "ready" as "error" | "idle" | "loading" | "offline" | "ready",
	navigateToMarket: vi.fn(),
	orders: [] as Array<Record<string, unknown>>,
	ordersError: undefined as unknown,
	ordersOffline: false,
	ordersStale: false,
	setActiveTab: vi.fn(),
	snapshotFills: vi.fn(async () => []),
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
			hash: `0x${"0".repeat(64)}`,
			liquidation: null,
			oid: 102,
			px: "3500",
			side: "A",
			startPosition: "0.1",
			sz: "0.1",
			tid: 2,
			time: 1_754_350_500_000,
			twapId: null,
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

function createFundings() {
	return [
		{ coin: "BTC", fundingRate: "0.0001", szi: "0.01", time: 1_754_350_400_000, usdc: "1.25" },
		{ coin: "ETH", fundingRate: "-0.0002", szi: "-0.2", time: 1_754_350_500_000, usdc: "-0.75" },
	];
}

vi.mock("boneyard-js/react", () => ({
	Skeleton: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, params, to, ...props }: { children?: ReactNode; params?: { address?: string }; to: string }) => (
		<a href={to.replace("$address", params?.address ?? "")} {...props}>
			{children}
		</a>
	),
}));

vi.mock("@/hooks/trade/use-user-fills", () => ({
	useUserFills: () => ({
		error: mocks.fillsError,
		isConnected: true,
		isOffline: mocks.fillsOffline,
		isStale: mocks.fillsStale,
		status: "ready",
		fills: mocks.fills,
	}),
}));

vi.mock("@/hooks/trade/use-historical-orders", () => ({
	useHistoricalOrders: () => ({
		entries: getOrderHistoryEntries(),
		error: mocks.ordersError,
		isConnected: true,
		isOffline: mocks.ordersOffline,
		isStale: mocks.ordersStale,
		status: "ready",
		orders: mocks.orders,
	}),
}));

vi.mock("@/hooks/trade/use-user-funding", () => ({
	useUserFunding: () => ({
		error: mocks.fundingError,
		fundings: [...mocks.fundings].sort((left, right) => Number(right.time) - Number(left.time)),
		isConnected: true,
		isOffline: mocks.fundingOffline,
		isStale: mocks.fundingStale,
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
		exportCsv: async () => mocks.downloadCsv(filename, buildRows(mocks.fundings)),
		isExporting: false,
	}),
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
	useUserFillsCsvExport: ({
		buildRows,
		filename,
	}: {
		buildRows: (items: unknown[]) => string[][];
		filename: string;
	}) => ({
		exportCsv: async () => mocks.downloadCsv(filename, buildRows(mocks.fills)),
		isExporting: false,
	}),
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({
	useMarketNavigation: () => mocks.navigateToMarket,
}));

vi.mock("@/hooks/trade/use-order-display-labels", () => ({
	useOrderDisplayLabels: () => ({
		getHistoricalOrderStatusLabel: (status: string) => (status === "filled" ? "Filled" : "Canceled"),
		getHistoricalOrderStatusPresentation: (order: { status: string }) => ({
			label: order.status === "filled" ? "Filled" : "Canceled",
			reason: order.status === "marginCanceled" ? "Canceled due to insufficient margin" : null,
		}),
		getOrderSideLabel: (side: "A" | "B", reduceOnly: boolean) =>
			reduceOnly ? (side === "B" ? "Close Short" : "Close Long") : side === "B" ? "Buy" : "Sell",
		getOrderTypeLabel: (type: string) => type,
		getTwapHistoryStatusLabel: (status: string) => (status === "activated" ? "Running" : "Filled"),
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
	useHyperliquid: () => ({ env: "Mainnet", info: { userFills: mocks.snapshotFills } }),
	useMarkets: () => ({
		getMarket: (coin: string) => ({ kind: "perp", shortName: coin, szDecimals: coin === "BTC" ? 4 : 3 }),
		getSzDecimals: (coin: string) => (coin === "BTC" ? 4 : 3),
		getTokenDisplayName: (name: string) => (name === "UBTC" ? "BTC" : name),
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
import { MOBILE_PROGRESSIVE_LIST_BATCH_SIZE } from "@/components/trade/mobile/mobile-progressive-list";
import { formatDateTime } from "@/lib/format";

describe("mobile history disclosure cards", () => {
	let client: QueryClient;
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		mocks.address = OWNER_A;
		mocks.fills = createFills();
		mocks.fillsError = undefined;
		mocks.fillsOffline = false;
		mocks.fillsStale = false;
		mocks.fundings = createFundings();
		mocks.fundingError = undefined;
		mocks.fundingOffline = false;
		mocks.fundingStale = false;
		mocks.fundingStatus = "ready";
		mocks.orders = createOrders();
		mocks.ordersError = undefined;
		mocks.ordersOffline = false;
		mocks.ordersStale = false;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		client.clear();
		vi.clearAllMocks();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	function render(component: ReactElement) {
		act(() => {
			root.render(
				<QueryClientProvider client={client}>
					<I18nProvider i18n={i18n}>{component}</I18nProvider>
				</QueryClientProvider>,
			);
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
		function expectBulkAvailability(canExpand: boolean, canCollapse: boolean) {
			const expandAll = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
				(button) => button.textContent === "Expand all",
			);
			const collapseAll = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
				(button) => button.textContent === "Collapse all",
			);
			expect(expandAll?.disabled).toBe(!canExpand);
			expect(collapseAll?.disabled).toBe(!canCollapse);
		}

		let disclosureButtons = getDisclosureButtons();
		expect(disclosureButtons.map((button) => button.getAttribute("aria-expanded"))).toEqual(["false", "false"]);
		expect(disclosureButtons.every((button) => button.parentElement?.className.includes("h-[54px]"))).toBe(true);
		expectBulkAvailability(true, false);

		act(() => disclosureButtons[1]?.click());
		disclosureButtons = getDisclosureButtons();
		expect(disclosureButtons.map((button) => button.getAttribute("aria-expanded"))).toEqual(["false", "true"]);
		expectBulkAvailability(true, true);

		act(() => disclosureButtons[0]?.click());
		expect(getDisclosureButtons().map((button) => button.getAttribute("aria-expanded"))).toEqual(["true", "true"]);
		expectBulkAvailability(false, true);

		act(() => getDisclosureButtons()[0]?.click());
		expect(getDisclosureButtons().map((button) => button.getAttribute("aria-expanded"))).toEqual(["false", "true"]);
		expectBulkAvailability(true, true);

		clickButton("Collapse all");
		expect(getDisclosureButtons().map((button) => button.getAttribute("aria-expanded"))).toEqual(["false", "false"]);
		expectBulkAvailability(true, false);

		clickButton("Expand all");
		expect(getDisclosureButtons().map((button) => button.getAttribute("aria-expanded"))).toEqual(["true", "true"]);
		expectBulkAvailability(false, true);
		const cardDisclosureControls = Array.from(
			container.querySelectorAll<HTMLButtonElement>("article button[aria-controls]"),
		);
		expect(cardDisclosureControls).toHaveLength(2);
		expect(cardDisclosureControls.every((button) => button.hasAttribute("aria-expanded"))).toBe(true);

		const bulkActionClasses: string[] = [];
		for (const label of ["Expand all", "Collapse all"]) {
			const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
				(candidate) => candidate.textContent === label,
			);
			expect(button?.className).toContain("h-[27px]");
			expect(button?.className).toContain("min-h-0");
			expect(button?.className).toContain("after:h-11");
			expect(button?.className).toContain("font-normal");
			expect(button?.className).toContain("text-market-close-fg");
			expect(button?.getAttribute("aria-pressed")).toBeNull();
			if (button) bulkActionClasses.push(button.className);
		}
		expect(new Set(bulkActionClasses).size).toBe(1);
	}

	function expectM4VisualContract(
		filterRowTestId: string,
		footerTestId: string,
		selectCount: number,
		viewAllPath?: string,
	) {
		const filterRow = container.querySelector<HTMLElement>(`[data-testid="${filterRowTestId}"]`);
		expect(filterRow?.className).toContain("h-9");
		expect(filterRow?.className).toContain("px-3.5");
		expect(filterRow?.className).toContain("overflow-x-auto");

		const filterTriggers = Array.from(filterRow?.querySelectorAll<HTMLElement>('[role="combobox"]') ?? []);
		expect(filterTriggers).toHaveLength(selectCount);
		for (const trigger of filterTriggers) {
			expect(trigger.className).toContain("h-[27px]");
			expect(trigger.className).toContain("min-h-0");
			expect(trigger.className).toContain("!rounded-[7px]");
			expect(trigger.className).toContain("after:h-11");
		}

		const filterGroup = Array.from(filterRow?.querySelectorAll<HTMLElement>("div") ?? []).find((element) =>
			element.className.includes("gap-1.5"),
		);
		expect(filterGroup).toBeDefined();
		const actionGroup = Array.from(filterRow?.querySelectorAll<HTMLElement>("div") ?? []).find(
			(element) => element.textContent === "Expand allCollapse all",
		);
		expect(actionGroup?.className).toContain("gap-3");
		expect(actionGroup?.className).toContain("ps-3");
		expect(actionGroup?.className).not.toContain("pl-3");

		const articles = Array.from(container.querySelectorAll<HTMLElement>("article"));
		expect(articles).toHaveLength(2);
		for (const article of articles) {
			expect(article.className).toContain("rounded-[14px]");
			expect(article.className).toContain("border-market-close-stroke-card");
		}

		for (const disclosure of getDisclosureButtons()) {
			const header = disclosure.parentElement;
			expect(header?.className).toContain("h-[54px]");
			expect(header?.className).toContain("grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_16px]");
			expect(header?.className).toContain("gap-2.5");
			expect(header?.className).toContain("px-3.5");
		}

		const firstDisclosure = getDisclosureButtons()[0];
		const wasExpanded = firstDisclosure?.getAttribute("aria-expanded") === "true";
		if (!wasExpanded) act(() => firstDisclosure?.click());
		const expandedDetailsId = getDisclosureButtons()[0]?.getAttribute("aria-controls");
		const details = expandedDetailsId ? document.getElementById(expandedDetailsId) : null;
		expect(details && container.contains(details)).toBe(true);
		const detailsGrid = details?.querySelector<HTMLElement>("div.grid");
		expect(detailsGrid?.className).toContain("grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)]");
		expect(detailsGrid?.className).toContain("gap-x-2.5");
		expect(detailsGrid?.className).toContain("gap-y-3");
		if (!wasExpanded) act(() => getDisclosureButtons()[0]?.click());

		const footer = container.querySelector<HTMLElement>(`[data-testid="${footerTestId}"]`);
		expect(footer?.className).toContain("h-[38px]");
		expect(footer?.className).toContain("px-3.5");
		const exportButton = Array.from(footer?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(
			(button) => button.textContent === "Export CSV",
		);
		expect(exportButton?.className).toContain("h-[38px]");
		expect(exportButton?.className).toContain("min-h-0");
		expect(exportButton?.className).toContain("after:h-11");
		const viewAllLink = footer?.querySelector<HTMLAnchorElement>("a");
		if (viewAllPath) {
			expect(viewAllLink?.textContent).toBe("View all");
			expect(viewAllLink?.href).toContain(viewAllPath);
			expect(viewAllLink?.className).toContain("h-[38px]");
		} else {
			expect(viewAllLink).toBeNull();
		}
	}

	it("keeps trade history values, explorer links, and independent disclosure state", () => {
		render(<MobileHistoryTab scrollMode="page" />);
		expectM4VisualContract(
			"mobile-trade-history-filter-row",
			"mobile-trade-history-footer",
			3,
			`/tradeHistory/${OWNER_A}`,
		);
		const historyList = container.querySelector<HTMLElement>('[data-testid="mobile-trade-history-list"]');
		expect(historyList?.className).not.toContain("max-h-");
		expect(historyList?.className).not.toContain("overflow-y-auto");
		expect(historyList?.className).not.toContain("overscroll-y-contain");
		expect(getDisclosureButtons()[0]?.getAttribute("aria-expanded")).toBe("false");
		expectDisclosureControls();

		expect(container.querySelectorAll("article")).toHaveLength(2);
		expect(Array.from(container.querySelectorAll("label"), (label) => label.textContent)).toEqual([
			"Type",
			"Direction",
			"Role",
		]);
		expect(container.textContent).toContain("Type");
		expect(container.textContent).toContain("Direction");
		expect(container.textContent).toContain("Role");
		expect(container.textContent).toContain("Realized PNL");
		expect(container.textContent).toContain("Fee");
		const explorer = container.querySelector<HTMLAnchorElement>('a[href="https://explorer.test/0xaaa"]');
		expect(explorer?.target).toBe("_blank");
		expect(explorer?.className).toContain("min-h-11");
		expect(container.querySelector(`a[href="https://explorer.test/0x${"0".repeat(64)}"]`)).toBeNull();
		const marketButton = container.querySelector<HTMLButtonElement>('button[aria-label="Switch to BTC market"]');
		expect(marketButton?.className).toContain("min-h-11");
		act(() => marketButton?.click());
		expect(mocks.navigateToMarket).toHaveBeenCalledWith("BTC", undefined, { displayedContent: "trade" });
		expect(mocks.setActiveTab).toHaveBeenCalledWith("trade");
		clickButton("Export CSV");
		expect(mocks.downloadCsv).toHaveBeenCalledWith(
			"trade_history.csv",
			expect.arrayContaining([expect.arrayContaining(["Time", "Asset", "Direction", "Transaction"])]),
		);
	});

	it("shows each fill's closed PNL net of its fee, opening fills included", () => {
		render(<MobileHistoryTab scrollMode="page" />);
		clickButton("Expand all");

		expect(container.textContent).toContain("+$12.38");
		expect(container.textContent).toContain("-$0.08");
	});

	it("shows a fill's fee token by its display name", () => {
		const [fill] = createFills();
		mocks.fills = [{ ...fill, feeToken: "UBTC", fee: "0.00001" }];
		render(<MobileHistoryTab scrollMode="page" />);
		clickButton("Expand all");

		expect(container.textContent).toContain("0.00001 BTC");
		expect(container.textContent).not.toContain("UBTC");
	});

	it("separates the owner's liquidation from a fill against another account's liquidation", () => {
		const [ownFill, counterpartyFill] = createFills();
		mocks.fills = [
			{ ...ownFill, liquidation: { liquidatedUser: OWNER_A, markPx: "99000", method: "market" } },
			{ ...counterpartyFill, liquidation: { liquidatedUser: OWNER_B, markPx: "3400", method: "market" } },
		];
		render(<MobileHistoryTab scrollMode="page" />);
		clickButton("Expand all");

		const text = container.textContent ?? "";
		expect(text).toContain("Market Order Liquidation: Open Long");
		expect(text).toContain("Close Long (Price Improved)");
		expect(text).not.toContain("Liquidated");
	});

	it("filters and exports only the owner's own and protocol liquidations as liquidations", async () => {
		const [ownFill, counterpartyFill] = createFills();
		mocks.fills = [
			{ ...ownFill, liquidation: { liquidatedUser: OWNER_A, markPx: "99000", method: "market" } },
			{ ...counterpartyFill, liquidation: { liquidatedUser: OWNER_B, markPx: "3400", method: "market" } },
			{ ...counterpartyFill, coin: "SOL", dir: "Auto-Deleveraging", hash: "0xadl", tid: 3 },
		];
		render(<MobileHistoryTab scrollMode="page" />);

		await selectOption("Type", "Liquidated");
		expect(container.querySelectorAll("article")).toHaveLength(2);
		expect(container.querySelector('[aria-label="Switch to BTC market"]')).not.toBeNull();
		expect(container.querySelector('[aria-label="Switch to SOL market"]')).not.toBeNull();
		expect(container.querySelector('[aria-label="Switch to ETH market"]')).toBeNull();
		clickButton("Export CSV");
		const liquidationRows = mocks.downloadCsv.mock.calls.at(-1)?.[1] as string[][] | undefined;
		expect(liquidationRows?.slice(1).map((row) => row[1])).toEqual(expect.arrayContaining(["BTC", "SOL"]));
		expect(liquidationRows?.flat()).not.toContain("ETH");

		await selectOption("Type", "Trade");
		expect(container.querySelectorAll("article")).toHaveLength(1);
		expect(container.querySelector('[aria-label="Switch to ETH market"]')).not.toBeNull();
	});

	it("keeps contained trade history internally scrollable", () => {
		render(<MobileHistoryTab scrollMode="contained" />);

		const historyList = container.querySelector<HTMLElement>('[data-testid="mobile-trade-history-list"]');
		expect(historyList?.className).toContain("flex-1");
		expect(historyList?.className).toContain("overflow-y-auto");
		expect(historyList?.className).toContain("overscroll-y-contain");
	});

	it("caps progressive trade history at 30 while CSV keeps the complete export snapshot", () => {
		let intersectionCallback: IntersectionObserverCallback | null = null;
		class MockIntersectionObserver {
			readonly disconnect = vi.fn();
			readonly observe = vi.fn();

			constructor(callback: IntersectionObserverCallback) {
				intersectionCallback = callback;
			}
		}
		vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
		const fill = createFills()[0];
		mocks.fills = Array.from({ length: 60 }, (_, index) => ({
			...fill,
			hash: `0x${index.toString(16)}`,
			oid: 1_000 + index,
			tid: index,
			time: Number(fill.time) + index,
		}));

		render(<MobileHistoryTab scrollMode="page" />);
		expect(container.querySelectorAll("article")).toHaveLength(MOBILE_PROGRESSIVE_LIST_BATCH_SIZE);
		expect(container.textContent).toContain("30 trades");

		clickButton("Export CSV");
		expect(mocks.downloadCsv).toHaveBeenCalledWith("trade_history.csv", expect.any(Array));
		const exportedRows = mocks.downloadCsv.mock.calls.at(-1)?.[1] as string[][] | undefined;
		expect(exportedRows).toHaveLength(61);

		act(() => {
			intersectionCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
		});
		expect(container.querySelectorAll("article")).toHaveLength(30);
		clickButton("Expand all");
		expect(getDisclosureButtons().every((button) => button.getAttribute("aria-expanded") === "true")).toBe(true);

		act(() => {
			intersectionCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
		});
		expect(container.querySelectorAll("article")).toHaveLength(30);
		expect(getDisclosureButtons().every((button) => button.getAttribute("aria-expanded") === "true")).toBe(true);
	});

	it("keeps full trade export available when the recent mobile snapshot is empty", () => {
		mocks.fills = [];
		render(<MobileHistoryTab scrollMode="page" />);

		const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(candidate) => candidate.textContent === "Export CSV",
		);
		expect(container.textContent).toContain("No fills found.");
		expect(button?.disabled).toBe(false);
		act(() => button?.click());
		expect(mocks.downloadCsv).toHaveBeenCalledOnce();
	});

	it("keeps funding position, payment, rate, and direction semantics", () => {
		render(<MobileFundingTab scrollMode="page" />);
		expectM4VisualContract(
			"mobile-funding-history-filter-row",
			"mobile-funding-history-footer",
			1,
			`/fundingHistory/${OWNER_A}`,
		);
		expectDisclosureControls();

		expect(container.querySelectorAll("article")).toHaveLength(2);
		expect(Array.from(container.querySelectorAll("label"), (label) => label.textContent)).toEqual(["Direction"]);
		expect(container.textContent).toContain("Direction");
		expect(container.textContent).toContain("Position");
		expect(container.textContent).toContain("Payment");
		expect(container.textContent).toContain("Rate");
		expect(container.textContent).toContain("Short");
		expect(container.textContent).toContain("Funding shown");
		clickButton("Export CSV");
		expect(mocks.downloadCsv).toHaveBeenCalledWith(
			"funding_history.csv",
			expect.arrayContaining([
				["Time", "Asset", "Side", "Size", "Rate", "Payment", "Payment Token"],
				[
					formatDateTime(1_754_350_500_000, { dateStyle: "short", timeStyle: "short" }),
					"ETH",
					"Short",
					"0.2",
					"-0.0002",
					"-0.75",
					"USDC",
				],
			]),
		);
	});

	it("keeps full funding export available when the recent mobile window is empty", () => {
		mocks.fundings = [];
		render(<MobileFundingTab scrollMode="page" />);

		const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(candidate) => candidate.textContent === "Export CSV",
		);
		expect(container.textContent).toContain("No funding payments found.");
		expect(button?.disabled).toBe(false);
		act(() => button?.click());
		expect(mocks.downloadCsv).toHaveBeenCalledOnce();
	});

	it("keeps mobile funding cards visible when live updates pause", () => {
		mocks.fundingError = new Error("WebSocket unavailable");
		render(<MobileFundingTab scrollMode="page" />);

		expect(container.querySelectorAll("article")).toHaveLength(2);
		expect(container.textContent).not.toContain("Funding updates paused.");
	});

	it("keeps funding records quiet while awaiting a fresh reconnect snapshot", () => {
		mocks.fundingStale = true;
		render(<MobileFundingTab scrollMode="page" />);

		expect(container.querySelectorAll("article")).toHaveLength(2);
		expect(container.textContent).not.toContain("Funding updates paused.");
	});

	it("keeps funding records through offline transitions without a passive notice", () => {
		mocks.fundingOffline = true;
		render(<MobileFundingTab scrollMode="page" />);

		expect(container.querySelectorAll("article")).toHaveLength(2);
		expect(container.textContent).not.toContain("You are offline.");

		mocks.fundings = [];
		mocks.fundingStatus = "offline";
		render(<MobileFundingTab scrollMode="page" />);
		expect(container.textContent).not.toContain("Funding payments will load when the connection returns.");
		expect(container.querySelector('[data-slot="data-pending"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="funding-loading-skeleton"]')).toBeNull();
	});

	it("keeps initial funding loading blank and exposes aria-busy", () => {
		mocks.fundings = [];
		mocks.fundingStatus = "loading";
		render(<MobileFundingTab scrollMode="page" />);
		expect(container.querySelector('[data-slot="data-pending"]')?.getAttribute("aria-busy")).toBe("true");
		expect(container.querySelector("output")).toBeNull();
		expect(container.textContent).not.toContain("No funding payments found.");
		expect(container.textContent).not.toContain("Loading funding payments.");
	});

	it("keeps historical order labels and expands cards independently", () => {
		render(<MobileOrdersHistoryTab scrollMode="page" />);
		expectM4VisualContract(
			"mobile-order-history-filter-row",
			"mobile-order-history-footer",
			3,
			`/historicalOrders/${OWNER_A}`,
		);
		expectDisclosureControls();

		expect(container.querySelectorAll("article")).toHaveLength(2);
		expect(container.textContent).toContain("Limit");
		expect(container.textContent).toContain("Buy");
		expect(container.textContent).toContain("Filled");
		expect(container.textContent).toContain("Updated");
		expect(container.textContent).toContain("Type");
		expect(container.textContent).toContain("Direction");
		expect(container.textContent).toContain("Status");
		expect(Array.from(container.querySelectorAll("label"), (label) => label.textContent)).toEqual([
			"Order type",
			"Direction",
			"Order status",
		]);
		expect(container.textContent).toContain("Close Long");
		expect(container.textContent).not.toContain("Short order");
		clickButton("Export CSV");
		expect(mocks.downloadCsv).toHaveBeenCalledWith(
			"order_history.csv",
			expect.arrayContaining([expect.arrayContaining(["Time", "Asset", "Direction", "Type", "Status"])]),
		);
		const exportRows = mocks.downloadCsv.mock.calls.at(-1)?.[1] as string[][] | undefined;
		const header = exportRows?.[0] ?? [];
		const priceColumns = ["Price", "Trigger Price", "Size"].map((name) => header.indexOf(name));
		expect(exportRows?.slice(1).map((row) => priceColumns.map((index) => row[index]))).toEqual(
			expect.arrayContaining([
				["100000", "-", "0.02"],
				["0", "3400", "0.2"],
			]),
		);
	});

	it("writes a canceled order's reason under its status", () => {
		mocks.orders = createOrders().map((entry, index) => (index === 1 ? { ...entry, status: "marginCanceled" } : entry));
		render(<MobileOrdersHistoryTab scrollMode="page" />);
		expect(container.textContent).not.toContain("Canceled due to insufficient margin");
		clickButton("Expand all");

		expect(container.textContent).toContain("Canceled due to insufficient margin");
		expect(container.textContent?.match(/Canceled due to insufficient margin/g)).toHaveLength(1);
	});

	it("keeps full order export available when the recent mobile snapshot is empty", () => {
		mocks.orders = [];
		render(<MobileOrdersHistoryTab scrollMode="page" />);

		const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(candidate) => candidate.textContent === "Export CSV",
		);
		expect(container.textContent).toContain("No order history found.");
		expect(button?.disabled).toBe(false);
		act(() => button?.click());
		expect(mocks.downloadCsv).toHaveBeenCalledOnce();
	});

	it("does not mistake degraded empty caches for successful empty history", () => {
		mocks.fills = [];
		mocks.fillsStale = true;
		render(<MobileHistoryTab scrollMode="page" />);

		expect(container.textContent).not.toContain("Trade history updates paused.");
		expect(container.textContent).not.toContain("No fills found.");

		mocks.orders = [];
		mocks.ordersOffline = true;
		render(<MobileOrdersHistoryTab scrollMode="page" />);

		expect(container.textContent).not.toContain("You are offline.");
		expect(container.textContent).not.toContain("No order history found.");
	});

	it("filters non-TWAP trade history by type, side, and maker/taker role without carrying state to another owner", async () => {
		render(<MobileHistoryTab scrollMode="page" />);
		act(() => getDisclosureButtons()[0]?.click());
		mocks.fills = mocks.fills.map((fill, index) => (index === 0 ? { ...fill, hash: "0xupdated" } : fill));
		render(<MobileHistoryTab scrollMode="page" />);
		expect(getDisclosureButtons()[0]?.getAttribute("aria-expanded")).toBe("true");

		await selectOption("Type", "Trade");
		expect(container.querySelectorAll("article")).toHaveLength(2);
		expect(container.textContent).not.toContain("TWAP");
		await selectOption("Type", "Type");
		expect(container.querySelectorAll("article")).toHaveLength(2);

		await selectOption("Direction", "Sell");
		expect(container.querySelectorAll("article")).toHaveLength(1);
		expect(container.querySelector('[aria-label="Switch to ETH market"]')).not.toBeNull();
		await selectOption("Direction", "Direction");
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
		await selectOption("Role", "Role");
		expect(getDisclosureButtons().map((button) => button.getAttribute("aria-expanded"))).toEqual(["true", "false"]);
		clickButton("Expand all");
		mocks.address = OWNER_B;
		render(<MobileHistoryTab scrollMode="page" />);

		expect(container.querySelectorAll("article")).toHaveLength(2);
		expect(Array.from(container.querySelectorAll('[role="combobox"]'), (trigger) => trigger.textContent)).toEqual([
			"Type",
			"Direction",
			"Role",
		]);
		expect(getDisclosureButtons().map((button) => button.getAttribute("aria-expanded"))).toEqual(["false", "false"]);
	});

	it("filters funding by the Big.js sign of szi without carrying state to another owner", async () => {
		render(<MobileFundingTab scrollMode="page" />);
		act(() => getDisclosureButtons()[1]?.click());
		mocks.fundings = mocks.fundings.map((funding) =>
			funding.coin === "BTC" ? { ...funding, fundingRate: "0.00011", szi: "0.02", usdc: "1.5" } : funding,
		);
		render(<MobileFundingTab scrollMode="page" />);
		expect(getDisclosureButtons()[1]?.getAttribute("aria-expanded")).toBe("true");

		await selectOption("Direction", "Short");
		expect(container.querySelectorAll("article")).toHaveLength(1);
		expect(container.querySelector('[aria-label="Switch to ETH market"]')).not.toBeNull();
		clickButton("Export CSV");
		const exportRows = mocks.downloadCsv.mock.calls.at(-1)?.[1] as string[][] | undefined;
		expect(exportRows).toHaveLength(3);
		expect(exportRows?.flat()).toContain("ETH");
		expect(exportRows?.flat()).toContain("BTC");

		clickButton("Collapse all");
		await selectOption("Direction", "Direction");
		expect(getDisclosureButtons().map((button) => button.getAttribute("aria-expanded"))).toEqual(["false", "true"]);
		clickButton("Expand all");
		mocks.address = OWNER_B;
		render(<MobileFundingTab scrollMode="page" />);

		expect(container.querySelectorAll("article")).toHaveLength(2);
		expect(container.querySelector('[role="combobox"]')?.textContent).toBe("Direction");
		expect(getDisclosureButtons().map((button) => button.getAttribute("aria-expanded"))).toEqual(["false", "false"]);
	});

	it("filters order history by SDK order type, side, and normalized status without carrying state to another owner", async () => {
		render(<MobileOrdersHistoryTab scrollMode="page" />);
		act(() => getDisclosureButtons()[0]?.click());
		mocks.orders = mocks.orders.map((entry, index) =>
			index === 0 ? { ...entry, statusTimestamp: Number(entry.statusTimestamp) + 1_000 } : entry,
		);
		render(<MobileOrdersHistoryTab scrollMode="page" />);
		expect(getDisclosureButtons()[0]?.getAttribute("aria-expanded")).toBe("true");

		await selectOption("Order type", "Stop Market");
		expect(container.querySelectorAll("article")).toHaveLength(1);
		expect(container.querySelector('[aria-label="Switch to ETH market, Close Long order"]')).not.toBeNull();
		await selectOption("Order type", "Type");
		expect(container.querySelectorAll("article")).toHaveLength(2);

		await selectOption("Direction", "Sell");
		expect(container.querySelectorAll("article")).toHaveLength(1);
		expect(container.querySelector('[aria-label="Switch to ETH market, Close Long order"]')).not.toBeNull();
		await selectOption("Direction", "Direction");
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
		await selectOption("Order status", "Status");
		expect(getDisclosureButtons().map((button) => button.getAttribute("aria-expanded"))).toEqual(["true", "false"]);
		clickButton("Expand all");
		mocks.address = OWNER_B;
		render(<MobileOrdersHistoryTab scrollMode="page" />);

		expect(container.querySelectorAll("article")).toHaveLength(2);
		expect(Array.from(container.querySelectorAll('[role="combobox"]'), (trigger) => trigger.textContent)).toEqual([
			"Type",
			"Direction",
			"Status",
		]);
		expect(getDisclosureButtons().map((button) => button.getAttribute("aria-expanded"))).toEqual(["false", "false"]);
	});
});
