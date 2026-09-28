// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FUNDING_COMPARISON_PERIOD_OPTIONS } from "@/config/funding-comparison";
import {
	buildFundingComparisonRows,
	deriveFundingComparisonPage,
	type FundingComparisonPeriod,
} from "@/domain/market/funding-comparison";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { FundingComparisonView, type FundingComparisonViewProps } from "../funding-comparison-view";

const layout = vi.hoisted(() => ({ mobile: false }));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => layout.mobile }));
vi.mock("@/lib/hyperliquid/markets/use-markets", () => ({
	useMarkets: () => ({ getMarket: () => undefined, getToken: () => undefined }),
}));

const NEXT = 1_790_000_000_000;
const PRICE_RECEIVED_AT = 1_800_000_000_000;

function messageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const ROWS = buildFundingComparisonRows(
	[
		[
			"BTC",
			[
				["HlPerp", { fundingRate: "0.0000125", nextFundingTime: NEXT, fundingIntervalHours: 1 }],
				["BinPerp", { fundingRate: "0.00012985", nextFundingTime: NEXT, fundingIntervalHours: 4 }],
				["BybitPerp", { fundingRate: "-0.00001", nextFundingTime: NEXT, fundingIntervalHours: 1 }],
			],
		],
		[
			"ETH",
			[
				["HlPerp", null],
				["BinPerp", { fundingRate: "0.0001", nextFundingTime: NEXT }],
				["BybitPerp", { fundingRate: "0.0", nextFundingTime: NEXT, fundingIntervalHours: 8 }],
			],
		],
	],
	[
		{
			name: "BTC",
			openInterest: "10",
			markPx: "100000",
			markPriceStatus: "success",
			markPriceReceivedAt: PRICE_RECEIVED_AT,
		},
		{ name: "ETH", markPriceStatus: "loading", markPriceReceivedAt: undefined },
	],
	{ perpContextsLive: true, now: PRICE_RECEIVED_AT },
);

function props(overrides: Partial<FundingComparisonViewProps> = {}): FundingComparisonViewProps {
	const result = deriveFundingComparisonPage({
		rows: ROWS,
		period: "8h",
		sortKey: "openInterest",
		sortDirection: "descending",
		query: "",
		page: 1,
		rowsPerPage: 25,
	});
	return {
		pageState: "normal",
		period: "8h",
		sortKey: "openInterest",
		sortDirection: "descending",
		query: "",
		rowsPerPage: 25,
		...result,
		isRetrying: false,
		onPeriodChange: vi.fn(),
		onQueryChange: vi.fn(),
		onClearQuery: vi.fn(),
		onSort: vi.fn(),
		onRowsPerPageChange: vi.fn(),
		onPreviousPage: vi.fn(),
		onNextPage: vi.fn(),
		onRetry: vi.fn(),
		onSelectMarket: vi.fn(),
		...overrides,
	};
}

function buttonByName(container: HTMLElement, name: string): HTMLButtonElement {
	const match = [...container.querySelectorAll("button")].find(
		(candidate) => candidate.getAttribute("aria-label") === name || candidate.textContent?.trim() === name,
	);
	if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing button: ${name}`);
	return match;
}

describe("FundingComparisonView", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		layout.mobile = false;
		act(() => i18n.loadAndActivate({ locale: "en", messages: {} }));
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		act(() => i18n.loadAndActivate({ locale: "en", messages: {} }));
	});

	function render(viewProps: FundingComparisonViewProps) {
		act(() => root.render(<FundingComparisonView {...viewProps} />));
	}

	it("renders a sortable desktop table with isolated numbers and factual difference directions", () => {
		const viewProps = props();
		render(viewProps);

		const headers = [...container.querySelectorAll("thead th")];
		expect(headers.map((header) => header.textContent?.trim())).toEqual([
			"Market",
			"Hyperliquid OI",
			"Hyperliquid",
			"Binance",
			"Binance-HL Arb",
			"Bybit",
			"Bybit-HL Arb",
		]);
		expect(headers.map((header) => header.getAttribute("aria-sort"))).toEqual([
			"none",
			"descending",
			"none",
			"none",
			"none",
			"none",
			"none",
		]);

		act(() => buttonByName(container, "Binance-HL Arb").click());
		expect(viewProps.onSort).toHaveBeenCalledWith("binanceArb");

		const [btc, eth] = [...container.querySelectorAll<HTMLTableRowElement>("tbody tr")];
		const btcValues = [...btc.querySelectorAll('bdi[dir="ltr"]')].map((node) => node.textContent);
		expect(btcValues).toEqual(["$1,000,000", "+0.0100%", "+0.0260%", "0.0160%", "-0.0080%", "0.0180%"]);
		expect(btc.textContent).toContain("Binance rate higher");
		expect(btc.textContent).toContain("Hyperliquid rate higher");
		expect(btc.querySelector('[data-arb-direction="venueHigher"]')).not.toBeNull();

		const btcRates = [...btc.querySelectorAll("td")].map((cell) => cell.querySelector("bdi")?.className ?? "");
		expect(btcRates[2]).toContain("text-fg-muted");
		expect(btcRates[3]).toContain("text-success");
		expect(btcRates[5]).toContain("text-error");

		const ethValues = [...eth.querySelectorAll('bdi[dir="ltr"]')].map((node) => node.textContent);
		expect(ethValues).toEqual(["--", "--", "--", "--", "0.0000%", "--"]);

		act(() => buttonByName(container, "Switch to BTC market").click());
		expect(viewProps.onSelectMarket).toHaveBeenCalledWith("BTC");
		expect(container.querySelector("caption")?.className).toContain("sr-only");
		expect(container.textContent).toContain("Only Hyperliquid main perp markets are included.");
	});

	it("disables pagination at both bounds", () => {
		render(props({ page: 1, totalPages: 1 }));
		expect(buttonByName(container, "Previous page").disabled).toBe(true);
		expect(buttonByName(container, "Next page").disabled).toBe(true);

		const middle = props({ page: 2, totalPages: 3, start: 26, end: 50, totalRows: 60 });
		render(middle);
		expect(buttonByName(container, "Previous page").disabled).toBe(false);
		expect(buttonByName(container, "Next page").disabled).toBe(false);
		expect(container.textContent).toContain("26–50 / 60");
		act(() => buttonByName(container, "Next page").click());
		expect(middle.onNextPage).toHaveBeenCalledOnce();

		render(props({ page: 3, totalPages: 3 }));
		expect(buttonByName(container, "Next page").disabled).toBe(true);
	});

	it("renders tappable mobile cards with press feedback", () => {
		layout.mobile = true;
		const viewProps = props();
		render(viewProps);

		expect(container.querySelector("table")).toBeNull();
		const cards = [...container.querySelectorAll("article")];
		expect(cards).toHaveLength(2);
		const labels = [...cards[0].querySelectorAll("dt")].map((node) => node.textContent);
		expect(labels).toEqual(["Hyperliquid OI", "Hyperliquid", "Binance", "Binance-HL Arb", "Bybit", "Bybit-HL Arb"]);
		expect(cards[0].querySelector("dd bdi")?.textContent).toBe("$1M");

		const trigger = buttonByName(container, "Switch to ETH market");
		expect(trigger.className).toContain("cursor-pointer");
		expect(trigger.className).toContain("active:bg-fill-weak");
		act(() => trigger.click());
		expect(viewProps.onSelectMarket).toHaveBeenCalledWith("ETH");

		act(() => buttonByName(container, "Change to ascending order").click());
		expect(viewProps.onSort).toHaveBeenCalledWith("openInterest");
	});

	it("keeps loading quiet with a busy skeleton", () => {
		render(props({ pageState: "loading", rows: [], totalRows: 0 }));
		const section = container.querySelector("section");
		expect(section?.getAttribute("aria-busy")).toBe("true");
		expect(container.querySelector('[data-testid="funding-comparison-skeleton"]')?.getAttribute("aria-busy")).toBe(
			"true",
		);
		expect(container.querySelector(".sr-only")?.textContent).toBe("Loading funding rates");
		expect(container.querySelector("table")).toBeNull();
	});

	it("shows only a neutral retry control for a failed snapshot", () => {
		const viewProps = props({ pageState: "error", rows: [], totalRows: 0 });
		render(viewProps);

		const region = container.querySelector<HTMLElement>('[data-testid="funding-comparison-retry"]');
		expect(region?.textContent?.trim()).toBe("Retry");
		expect(region?.querySelector("svg")).toBeNull();
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(container.textContent).not.toMatch(/unavailable|failed|error|could not|No funding comparison data/i);
		expect(container.querySelector("section")?.getAttribute("aria-busy")).toBe("false");

		act(() => buttonByName(container, "Retry").click());
		expect(viewProps.onRetry).toHaveBeenCalledOnce();

		render(props({ pageState: "error", rows: [], totalRows: 0, isRetrying: true }));
		expect(buttonByName(container, "Retry").disabled).toBe(true);
	});

	it("separates a confirmed empty snapshot from an empty search", () => {
		render(props({ pageState: "empty", rows: [], totalRows: 0 }));
		expect(container.textContent).toContain("No funding comparison data");
		expect(container.textContent).not.toContain("No markets match your search");

		render(props({ pageState: "noResults", rows: [], totalRows: 0, query: "doge" }));
		expect(container.textContent).toContain("No markets match your search");
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Search markets"]')?.value).toBe("doge");
	});

	it("keeps the search draft and selected period across a live language switch", () => {
		function Harness() {
			const [query, setQuery] = useState("BTC");
			const [period, setPeriod] = useState<FundingComparisonPeriod>("1d");
			return (
				<FundingComparisonView {...props({ query, period })} onQueryChange={setQuery} onPeriodChange={setPeriod} />
			);
		}
		const dayLabel = FUNDING_COMPARISON_PERIOD_OPTIONS.find((option) => option.value === "1d")?.label;
		if (!dayLabel) throw new Error("Missing day label");

		act(() => root.render(<Harness />));
		const section = container.querySelector("section");
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Search markets"]');
		expect(input?.value).toBe("BTC");
		expect(buttonByName(container, "Funding period").textContent).toContain("Day");

		act(() =>
			i18n.loadAndActivate({
				locale: "zh",
				messages: {
					[messageId("Funding Comparison")]: "资金费率对比",
					[messageId("Search markets")]: "搜索市场",
					[messageId("Funding period")]: "资金费率周期",
					[dayLabel.id]: "每日",
				},
			}),
		);

		expect(container.querySelector("section")).toBe(section);
		expect(container.querySelector("h1")?.textContent).toBe("资金费率对比");
		const translatedInput = container.querySelector<HTMLInputElement>('input[aria-label="搜索市场"]');
		expect(translatedInput).toBe(input);
		expect(translatedInput?.value).toBe("BTC");
		expect(buttonByName(container, "资金费率周期").textContent).toContain("每日");
	});
});
