// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { UserFillsResponse } from "@nktkas/hyperliquid";
import type { ComponentProps, ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeHistoryPage } from "@/components/trade-history/trade-history-page";

const ADDRESS = "0x1111111111111111111111111111111111111111";

type UserFill = UserFillsResponse[number];

const mocks = vi.hoisted(() => ({
	exportAddress: undefined as `0x${string}` | undefined,
	exportCsv: vi.fn(),
	history: {
		error: null as unknown,
		fills: [] as UserFillsResponse,
		isOffline: false,
		isRefreshing: false,
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

vi.mock("@/components/trade/header/top-nav", () => ({ TopNav: () => null }));
vi.mock("@/components/trade/mobile/mobile-header", () => ({ MobileHeader: () => null }));
vi.mock("@/components/trade/testnet-banner", () => ({ TestnetBanner: () => null }));
vi.mock("@/hooks/trade/use-history-csv-export", () => ({
	useUserFillsCsvExport: ({ address }: { address?: `0x${string}` }) => {
		mocks.exportAddress = address;
		return { exportCsv: mocks.exportCsv, isExporting: false };
	},
}));
vi.mock("@/hooks/trade/use-market-navigation", () => ({ useMarketNavigation: () => vi.fn() }));
vi.mock("@/hooks/trade/use-trade-history", () => ({ useTradeHistory: () => mocks.history }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/hyperliquid", () => ({
	getExplorerTxUrl: () => "https://example.com/tx",
	useMarkets: () => ({
		getMarket: (coin: string) => ({ kind: coin === "PURR/USDC" ? "spot" : "perp" }),
		getSzDecimals: () => 2,
	}),
}));
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

function createFill(index: number): UserFill {
	const isSpot = index >= 26;
	return {
		closedPnl: "0",
		coin: isSpot ? "PURR/USDC" : "BTC",
		crossed: isSpot,
		dir: isSpot ? "Sell" : "Open Long",
		fee: "0.01",
		feeToken: "USDC",
		hash: `0x${index.toString(16).padStart(64, "0")}`,
		oid: index,
		px: "100",
		side: isSpot ? "A" : "B",
		startPosition: "0",
		sz: "1",
		tid: index,
		time: 1_800_000_000_000 - index,
		twapId: null,
	};
}

describe("TradeHistoryPage", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		mocks.history.error = null;
		mocks.history.fills = Array.from({ length: 30 }, (_, index) => createFill(index));
		mocks.history.isOffline = false;
		mocks.history.isRefreshing = false;
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
					<TradeHistoryPage address={address} />
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

	it("paginates 25 fills locally and resets to page one when filtering", () => {
		renderPage();

		expect(container.querySelectorAll("tbody tr")).toHaveLength(25);
		expect(container.textContent).toContain("1–25 / 30");

		const nextPage = container.querySelector<HTMLButtonElement>('button[aria-label="Next trade history page"]');
		act(() => nextPage?.click());
		expect(container.querySelectorAll("tbody tr")).toHaveLength(5);

		const marketFilter = container.querySelector<HTMLSelectElement>(
			'select[aria-label="Filter trade history by market"]',
		);
		if (!marketFilter) throw new Error("Missing market filter");
		act(() => {
			marketFilter.value = "PURR/USDC";
			marketFilter.dispatchEvent(new Event("change", { bubbles: true }));
		});
		expect(container.querySelectorAll("tbody tr")).toHaveLength(4);
		expect(container.textContent).toContain("1–4 / 4");
		expect(mocks.history.refresh).not.toHaveBeenCalled();
	});

	it("keeps a selected market visible after refreshed data no longer contains it", () => {
		renderPage();
		const marketFilter = container.querySelector<HTMLSelectElement>(
			'select[aria-label="Filter trade history by market"]',
		);
		if (!marketFilter) throw new Error("Missing market filter");
		act(() => {
			marketFilter.value = "PURR/USDC";
			marketFilter.dispatchEvent(new Event("change", { bubbles: true }));
		});
		mocks.history.fills = [createFill(0)];
		renderPage();

		expect(marketFilter.value).toBe("PURR/USDC");
		expect([...marketFilter.options].some((option) => option.value === "PURR/USDC")).toBe(true);
		expect(container.textContent).toContain("No fills match the selected filters");
	});

	it("renders buy-side liquidations with danger styling", () => {
		mocks.history.fills = [createFill(0)];
		mocks.history.fills[0] = {
			...mocks.history.fills[0],
			liquidation: { markPx: "90", method: "market" },
		};
		renderPage();

		const labels = [...container.querySelectorAll("span, td")].filter(
			(element) => element.textContent === "Liquidated",
		);
		expect(labels).toHaveLength(2);
		for (const label of labels) {
			expect(label.className).toContain("text-error");
			expect(label.className).not.toContain("text-success");
		}
	});

	it.each([
		["disabled", "Invalid account address"],
		["loading", "Loading trade history"],
		["offline", "You are offline"],
		["error", "Trade history is unavailable"],
	] as const)("keeps the %s state distinct", (status, expectedText) => {
		mocks.history.status = status;
		mocks.history.fills = [];
		renderPage();

		expect(container.querySelector('[data-testid="trade-history-page"]')?.getAttribute("data-state")).toBe(status);
		expect(container.textContent).toContain(expectedText);
	});

	it("keeps cached fills visible when a refresh fails", () => {
		mocks.history.error = new Error("refresh failed");
		renderPage();

		expect(container.querySelectorAll("tbody tr")).toHaveLength(25);
		expect(container.textContent).toContain("Refresh failed. Previously loaded trade history remains visible.");
	});

	it("shows an empty result only after the snapshot is ready", () => {
		mocks.history.fills = [];
		renderPage();

		expect(container.textContent).toContain("No fills found");
		expect(container.textContent).not.toContain("Trade history is unavailable");
	});

	it("keeps degraded and snapshot-limit warnings visible for an empty cached result", () => {
		mocks.history.error = new Error("refresh failed");
		mocks.history.fills = [];
		mocks.history.reachedLimit = true;
		renderPage();

		expect(container.textContent).toContain("Refresh failed. Previously loaded trade history remains visible.");
		expect(container.textContent).toContain("reached the 2000-fill snapshot limit");
		expect(container.textContent).toContain("No fills found");
	});

	it("warns when the public snapshot reaches 2000 fills", () => {
		mocks.history.reachedLimit = true;
		renderPage();

		expect(container.textContent).toContain("reached the 2000-fill snapshot limit");
	});

	it("exports the public address and disables actions for an invalid address", () => {
		renderPage();
		expect(mocks.exportAddress).toBe(ADDRESS);
		const exportButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(button) => button.textContent === "Export CSV",
		);
		act(() => exportButton?.click());
		expect(mocks.exportCsv).toHaveBeenCalledOnce();

		mocks.history.status = "disabled";
		mocks.history.fills = [];
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<TradeHistoryPage address="invalid" />
				</I18nProvider>,
			),
		);
		expect(mocks.exportAddress).toBeUndefined();
		const refreshButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(button) => button.textContent === "Refresh",
		);
		expect(refreshButton?.disabled).toBe(true);
	});
});
