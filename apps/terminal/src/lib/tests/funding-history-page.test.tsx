// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { ComponentProps, ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FundingHistoryPage } from "@/components/funding-history/funding-history-page";
import type { UserFunding } from "@/lib/trade/user-funding";

const ADDRESS = "0x1111111111111111111111111111111111111111";

const mocks = vi.hoisted(() => ({
	exportAddress: undefined as `0x${string}` | undefined,
	exportCsv: vi.fn(),
	history: {
		error: null as unknown,
		fundings: [] as UserFunding[],
		isOffline: false,
		isRefreshing: false,
		rangeEndTime: 1_800_000_000_000 as number | null,
		rangeStartTime: (1_800_000_000_000 - 30 * 24 * 60 * 60 * 1000) as number | null,
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
vi.mock("@/hooks/trade/use-funding-history", () => ({ useFundingHistory: () => mocks.history }));
vi.mock("@/hooks/trade/use-history-csv-export", () => ({
	useFundingHistoryCsvExport: ({ address }: { address?: `0x${string}` }) => {
		mocks.exportAddress = address;
		return { exportCsv: mocks.exportCsv, isExporting: false };
	},
}));
vi.mock("@/hooks/trade/use-market-navigation", () => ({ useMarketNavigation: () => vi.fn() }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/hyperliquid", () => ({ useMarkets: () => ({ getMarket: () => undefined }) }));
vi.mock("@/lib/lazy", () => ({ createLazyComponent: () => () => null }));
vi.mock("@/lib/number-format-reactivity", () => ({ useNumberFormatRevision: () => undefined }));
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

function createFunding(index: number): UserFunding {
	const isEth = index >= 26;
	return {
		coin: isEth ? "ETH" : "BTC",
		fundingRate: "0.0001",
		nSamples: null,
		szi: isEth ? "-1" : "1",
		time: 1_800_000_000_000 - index,
		usdc: isEth ? "-0.1" : "0.1",
	};
}

describe("FundingHistoryPage", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		mocks.history.error = null;
		mocks.history.fundings = Array.from({ length: 30 }, (_, index) => createFunding(index));
		mocks.history.isOffline = false;
		mocks.history.isRefreshing = false;
		mocks.history.rangeEndTime = 1_800_000_000_000;
		mocks.history.rangeStartTime = 1_800_000_000_000 - 30 * 24 * 60 * 60 * 1000;
		mocks.history.refresh.mockReset();
		mocks.history.status = "ready";
		mocks.exportAddress = undefined;
		mocks.exportCsv.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderPage() {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<FundingHistoryPage address={ADDRESS} />
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

	it("paginates 25 rows locally and resets to page one when filtering without refreshing", () => {
		renderPage();

		expect(container.querySelectorAll("tbody tr")).toHaveLength(25);
		expect(container.textContent).toContain("1–25 / 30");

		const nextPage = container.querySelector<HTMLButtonElement>('button[aria-label="Next funding payments page"]');
		act(() => nextPage?.click());
		expect(container.querySelectorAll("tbody tr")).toHaveLength(5);
		expect(container.textContent).toContain("26–30 / 30");

		const marketFilter = container.querySelector<HTMLSelectElement>(
			'select[aria-label="Filter funding payments by market"]',
		);
		if (!marketFilter) throw new Error("Missing market filter");
		act(() => {
			marketFilter.value = "ETH";
			marketFilter.dispatchEvent(new Event("change", { bubbles: true }));
		});
		expect(container.querySelectorAll("tbody tr")).toHaveLength(4);
		expect(container.textContent).toContain("1–4 / 4");
		expect(mocks.history.refresh).not.toHaveBeenCalled();
	});

	it("keeps a selected market visible after refreshed data no longer contains it", () => {
		renderPage();
		const marketFilter = container.querySelector<HTMLSelectElement>(
			'select[aria-label="Filter funding payments by market"]',
		);
		if (!marketFilter) throw new Error("Missing market filter");
		act(() => {
			marketFilter.value = "ETH";
			marketFilter.dispatchEvent(new Event("change", { bubbles: true }));
		});
		mocks.history.fundings = [createFunding(0)];
		renderPage();

		expect(marketFilter.value).toBe("ETH");
		expect([...marketFilter.options].some((option) => option.value === "ETH")).toBe(true);
		expect(container.textContent).toContain("No funding payments match the selected filters");
	});

	it.each([
		["disabled", "Invalid account address"],
		["loading", "Loading funding payments"],
		["error", "Funding payments are unavailable"],
	] as const)("keeps the %s state distinct", (status, expectedText) => {
		mocks.history.status = status;
		mocks.history.fundings = [];
		renderPage();

		expect(container.querySelector('[data-testid="funding-history-page"]')?.getAttribute("data-state")).toBe(status);
		expect(container.textContent).toContain(expectedText);
	});

	it("shows a confirmed empty state only after a ready response", () => {
		mocks.history.status = "ready";
		mocks.history.fundings = [];
		renderPage();

		expect(container.textContent).toContain("No funding payments found");
		expect(container.textContent).not.toContain("Funding payments are unavailable");
	});

	it("does not offer a working refresh action for an invalid address", () => {
		mocks.history.status = "disabled";
		mocks.history.fundings = [];
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<FundingHistoryPage address="invalid" />
				</I18nProvider>,
			),
		);

		const refreshButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(button) => button.textContent === "Refresh",
		);
		expect(refreshButton?.disabled).toBe(true);
		expect(mocks.history.refresh).not.toHaveBeenCalled();
		expect(mocks.exportAddress).toBeUndefined();
	});

	it("exports the address shown by the public history page", () => {
		renderPage();

		expect(mocks.exportAddress).toBe(ADDRESS);
		const exportButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(button) => button.textContent === "Export CSV",
		);
		expect(exportButton).toBeDefined();
		act(() => exportButton?.click());
		expect(mocks.exportCsv).toHaveBeenCalledOnce();
	});
});
