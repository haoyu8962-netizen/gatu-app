// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { HistoricalOrdersResponse } from "@nktkas/hyperliquid";
import type { ComponentProps, ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HistoricalOrdersPage } from "@/components/historical-orders/historical-orders-page";
import { buildOrderHistoryEntries } from "@/lib/trade/order-history";
import type { OrdinaryOrderHistoryEntry } from "@/lib/trade/order-history-page";

const ADDRESS = "0x1111111111111111111111111111111111111111";

const mocks = vi.hoisted(() => ({
	exportAddress: undefined as `0x${string}` | undefined,
	exportCsv: vi.fn(),
	history: {
		entries: [] as OrdinaryOrderHistoryEntry[],
		error: null as unknown,
		isOffline: false,
		isRefreshing: false,
		orders: [] as HistoricalOrdersResponse,
		reachedLimit: false,
		refresh: vi.fn(),
		status: "ready" as "disabled" | "error" | "loading" | "offline" | "ready",
	},
}));

vi.mock("@sairn/ui", () => ({
	buttonVariants: () => "",
	Button: ({ children, disabled, onClick }: { children?: ReactNode; disabled?: boolean; onClick?: () => void }) => (
		<button type="button" disabled={disabled} onClick={onClick}>
			{children}
		</button>
	),
	Pagination: ({
		currentPage,
		getPageLabel,
		nextPageLabel,
		nextText,
		onPageChange,
		previousText,
		totalPages,
	}: {
		currentPage: number;
		getPageLabel?: (page: number) => string;
		nextPageLabel: string;
		nextText?: ReactNode;
		onPageChange?: (page: number) => void;
		previousText?: ReactNode;
		totalPages: number;
	}) => (
		<nav data-testid="pagination" data-page-label={getPageLabel?.(currentPage)}>
			<span data-testid="pagination-previous">{previousText}</span>
			<button
				type="button"
				aria-label={nextPageLabel}
				disabled={currentPage >= totalPages}
				onClick={() => onPageChange?.(currentPage + 1)}
			>
				{nextText}
			</button>
		</nav>
	),
	Select: ({
		label,
		onValueChange,
		options,
		triggerAriaLabel,
		value,
	}: {
		label?: string;
		onValueChange?: (value: string | null) => void;
		options: Array<{ label: string; value: string }>;
		triggerAriaLabel?: string;
		value?: string | null;
	}) => (
		<label>
			{label}
			<select
				aria-label={triggerAriaLabel}
				value={value ?? ""}
				onChange={(event) => onValueChange?.(event.target.value)}
			>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</label>
	),
	Table: ({ scrollableRegionLabel, ...props }: ComponentProps<"table"> & { scrollableRegionLabel?: string }) => (
		<table aria-label={scrollableRegionLabel} {...props} />
	),
	TableBody: (props: ComponentProps<"tbody">) => <tbody {...props} />,
	TableCell: (props: ComponentProps<"td">) => <td {...props} />,
	TableHead: (props: ComponentProps<"th">) => <th {...props} />,
	TableHeader: (props: ComponentProps<"thead">) => <thead {...props} />,
	TableRow: (props: ComponentProps<"tr">) => <tr {...props} />,
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children?: ReactNode }) => <a href="/trade">{children}</a>,
}));

vi.mock("@/components/trade/components/asset-badge", () => ({
	AssetBadge: ({ coin, onClick }: { coin: string; onClick?: () => void }) => (
		<button type="button" onClick={onClick}>
			{coin}
		</button>
	),
}));
vi.mock("@/components/trade/components/historical-order-price", () => ({
	HistoricalOrderPrice: ({ order }: { order: HistoricalOrdersResponse[number]["order"] }) => (
		<span>{order.limitPx}</span>
	),
}));
vi.mock("@/components/trade/header/top-nav", () => ({ TopNav: () => null }));
vi.mock("@/components/trade/mobile/mobile-header", () => ({ MobileHeader: () => null }));
vi.mock("@/components/trade/testnet-banner", () => ({ TestnetBanner: () => null }));
vi.mock("@/hooks/trade/use-history-csv-export", () => ({
	useHistoricalOrdersCsvExport: ({ address }: { address?: `0x${string}` }) => {
		mocks.exportAddress = address;
		return { exportCsv: mocks.exportCsv, isExporting: false };
	},
}));
vi.mock("@/hooks/trade/use-market-navigation", () => ({ useMarketNavigation: () => vi.fn() }));
vi.mock("@/hooks/trade/use-order-display-labels", () => ({
	useOrderDisplayLabels: () => ({
		getHistoricalOrderStatusLabel: (status: string) => status,
		getOrderSideLabel: (side: string) => (side === "B" ? "Buy" : "Sell"),
		getOrderTypeLabel: (type: string) => type,
	}),
}));
vi.mock("@/hooks/trade/use-order-history", () => ({ useOrderHistory: () => mocks.history }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/hyperliquid", () => ({ useMarkets: () => ({ getMarket: () => undefined }) }));
vi.mock("@/lib/lazy", () => ({ createLazyComponent: () => () => null }));
vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	useIsTestnet: () => false,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const ZH_PAGINATION_MESSAGES = Object.fromEntries(
	[
		["Previous", "上一页"],
		["Next", "下一页"],
		["Page {page}", "第 {page} 页"],
	].map(([message, translation]) => [
		createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6),
		translation,
	]),
);

function paginationLabels(container: HTMLElement) {
	const pagination = container.querySelector('[data-testid="pagination"]');
	return [
		pagination?.querySelector('[data-testid="pagination-previous"]')?.textContent,
		pagination?.querySelector("button")?.textContent,
		pagination?.getAttribute("data-page-label"),
	];
}

function createOrder(index: number): HistoricalOrdersResponse[number] {
	const isEth = index >= 26;
	return {
		order: {
			children: [],
			cloid: null,
			coin: isEth ? "ETH" : "BTC",
			isPositionTpsl: false,
			isTrigger: false,
			limitPx: isEth ? "3500" : "63000",
			oid: index,
			orderType: isEth ? "Market" : "Limit",
			origSz: "0.01",
			reduceOnly: false,
			side: isEth ? "A" : "B",
			sz: "0",
			tif: "Gtc",
			timestamp: 1_800_000_000_000 + index,
			triggerCondition: "N/A",
			triggerPx: "0",
		},
		status: isEth ? "canceled" : "filled",
		statusTimestamp: 1_800_000_001_000 + index,
	};
}

function createEntries(count: number): OrdinaryOrderHistoryEntry[] {
	return buildOrderHistoryEntries(
		Array.from({ length: count }, (_, index) => createOrder(index)),
		[],
	).filter((entry): entry is OrdinaryOrderHistoryEntry => entry.kind === "order");
}

describe("HistoricalOrdersPage", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		mocks.history.entries = createEntries(30);
		mocks.history.error = null;
		mocks.history.isOffline = false;
		mocks.history.isRefreshing = false;
		mocks.history.orders = Array.from({ length: 30 }, (_, index) => createOrder(index));
		mocks.history.reachedLimit = false;
		mocks.history.refresh.mockReset();
		mocks.history.status = "ready";
		mocks.exportAddress = undefined;
		mocks.exportCsv.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderPage(address = ADDRESS) {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<HistoricalOrdersPage address={address} />
				</I18nProvider>,
			),
		);
	}

	it("labels the pagination controls in the active language", () => {
		renderPage();
		expect(paginationLabels(container)).toEqual(["Previous", "Next", "Page 1"]);

		act(() => i18n.loadAndActivate({ locale: "zh", messages: ZH_PAGINATION_MESSAGES }));

		expect(paginationLabels(container)).toEqual(["上一页", "下一页", "第 1 页"]);
	});

	it("paginates at 25 rows and resets to page one when a local filter changes", () => {
		renderPage();

		expect(container.querySelectorAll("tbody tr")).toHaveLength(25);
		expect(container.textContent).toContain("1–25 / 30");

		const nextPage = container.querySelector<HTMLButtonElement>('button[aria-label="Next order history page"]');
		act(() => nextPage?.click());
		expect(container.querySelectorAll("tbody tr")).toHaveLength(5);
		expect(container.textContent).toContain("26–30 / 30");

		const marketFilter = container.querySelector<HTMLSelectElement>(
			'select[aria-label="Filter order history by market"]',
		);
		act(() => {
			if (!marketFilter) throw new Error("Missing market filter");
			marketFilter.value = "ETH";
			marketFilter.dispatchEvent(new Event("change", { bubbles: true }));
		});
		expect(container.querySelectorAll("tbody tr")).toHaveLength(4);
		expect(container.textContent).toContain("1–4 / 4");
		expect(mocks.history.refresh).not.toHaveBeenCalled();
	});

	it("keeps selected dynamic filters visible after refreshed data no longer contains them", () => {
		renderPage();
		const marketFilter = container.querySelector<HTMLSelectElement>(
			'select[aria-label="Filter order history by market"]',
		);
		const typeFilter = container.querySelector<HTMLSelectElement>('select[aria-label="Filter order history by type"]');
		if (!marketFilter || !typeFilter) throw new Error("Missing order filters");
		act(() => {
			marketFilter.value = "ETH";
			marketFilter.dispatchEvent(new Event("change", { bubbles: true }));
			typeFilter.value = "Market";
			typeFilter.dispatchEvent(new Event("change", { bubbles: true }));
		});
		mocks.history.entries = createEntries(1);
		mocks.history.orders = [createOrder(0)];
		renderPage();

		expect(marketFilter.value).toBe("ETH");
		expect(typeFilter.value).toBe("Market");
		expect([...marketFilter.options].some((option) => option.value === "ETH")).toBe(true);
		expect([...typeFilter.options].some((option) => option.value === "Market")).toBe(true);
		expect(container.textContent).toContain("No orders match the selected filters");
	});

	it.each([
		["disabled", "Invalid account address"],
		["loading", "Loading order history"],
		["error", "Order history is unavailable"],
	] as const)("keeps the %s state distinct", (status, expectedText) => {
		mocks.history.status = status;
		mocks.history.entries = [];
		renderPage(status === "disabled" ? "invalid" : ADDRESS);

		expect(container.querySelector('[data-testid="historical-orders-page"]')?.getAttribute("data-state")).toBe(status);
		expect(container.textContent).toContain(expectedText);
	});

	it("keeps degraded and API-limit warnings visible for an empty cached result", () => {
		mocks.history.entries = [];
		mocks.history.error = new Error("refresh failed");
		mocks.history.orders = [];
		mocks.history.reachedLimit = true;
		renderPage();

		expect(container.textContent).toContain("Refresh failed. Previously loaded order history remains visible.");
		expect(container.textContent).toContain("reached the 2000-order API limit");
		expect(container.textContent).toContain("No order history found");
	});

	it("discloses the API boundary and keeps TWAP history separate", () => {
		mocks.history.reachedLimit = true;
		renderPage();

		expect(container.textContent).toContain("reached the 2000-order API limit");
		expect(container.textContent).toContain("TWAP history is separate and is not included");
	});

	it("exports the public address and disables refresh for an invalid route address", () => {
		renderPage();
		expect(mocks.exportAddress).toBe(ADDRESS);
		const exportButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(button) => button.textContent === "Export CSV",
		);
		act(() => exportButton?.click());
		expect(mocks.exportCsv).toHaveBeenCalledOnce();

		mocks.history.status = "disabled";
		mocks.history.entries = [];
		renderPage("invalid");
		const refreshButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(button) => button.textContent === "Refresh",
		);
		expect(refreshButton?.disabled).toBe(true);
		expect(mocks.exportAddress).toBeUndefined();
	});
});
