// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { PerpConciseAnnotationsResponse } from "@nktkas/hyperliquid";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketRow } from "@/components/trade/chart/token-selector-categories";
import { TokenSelectorContent } from "@/components/trade/chart/token-selector-content";
import { useTokenSelector } from "@/components/trade/chart/use-token-selector";
import type { ExchangeScope } from "@/domain/market/scope";

const testState = vi.hoisted(() => ({
	annotations: undefined as PerpConciseAnnotationsResponse | undefined,
	annotationsPending: false,
	annotationsError: false,
	refetchAnnotations: vi.fn(),
	markets: [] as MarketRow[],
	marketsLoading: false,
	toggleFavoriteMarket: vi.fn(),
	onValueChange: vi.fn(),
	measure: vi.fn(),
	scrollToIndex: vi.fn(),
	exchangeScope: "all" as ExchangeScope,
	exchangeDex: undefined as string | undefined,
	open: true,
}));

vi.mock("@sairn/hl-react", () => ({
	useInfo: () => ({
		data: testState.annotations,
		isPending: testState.annotationsPending,
		isError: testState.annotationsError,
		refetch: testState.refetchAnnotations,
	}),
}));

vi.mock("@tanstack/react-virtual", () => ({
	useVirtualizer: () => ({
		getVirtualItems: () => [],
		getTotalSize: () => 0,
		measure: testState.measure,
		scrollToIndex: testState.scrollToIndex,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useMarketsInfo: () => {
		const builderMarkets = testState.markets.filter((market) => market.kind === "builderPerp");
		return {
			markets: testState.markets,
			perpMarkets: testState.markets.filter((market) => market.kind === "perp"),
			spotMarkets: testState.markets.filter((market) => market.kind === "spot"),
			builderPerpMarkets: { all: builderMarkets, xyz: builderMarkets },
			isLoading: testState.marketsLoading,
			error: undefined,
			getMarketInfo: vi.fn(),
		};
	},
}));

vi.mock("@/providers/exchange-scope", () => ({
	useExchangeScope: () => ({ scope: testState.exchangeScope, dex: testState.exchangeDex }),
}));

vi.mock("@/stores/use-market-store", () => ({
	useFavoriteMarkets: () => [],
	useMarketActions: () => ({ toggleFavoriteMarket: testState.toggleFavoriteMarket }),
}));

vi.mock("@/lib/performance/render-profile", () => ({
	useRenderCommitTrack: vi.fn(),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const BTC_MARKET = {
	name: "BTC",
	kind: "perp",
	shortName: "BTC",
	pairName: "BTC-USDC",
	szDecimals: 5,
	maxLeverage: 40,
	markPx: "63000",
	prevDayPx: "62000",
	dayNtlVlm: "1000000",
	openInterest: "100",
	funding: "0.00001",
} as MarketRow;

const AAPL_MARKET = {
	name: "xyz:AAPL",
	kind: "builderPerp",
	shortName: "AAPL",
	pairName: "AAPL-USDC",
	dex: "xyz",
	szDecimals: 3,
	maxLeverage: 10,
	markPx: "200",
	prevDayPx: "195",
	dayNtlVlm: "500000",
	openInterest: "1000",
	funding: "0.00001",
} as MarketRow;

const UNITREE_MARKET = {
	name: "para:UNITREE",
	kind: "builderPerp",
	shortName: "UNITREE",
	pairName: "UNITREE-USDC",
	dex: "para",
	szDecimals: 2,
	maxLeverage: 3,
	markPx: "10",
	prevDayPx: "9",
	dayNtlVlm: "250000",
	openInterest: "5000",
	funding: "0.00001",
} as MarketRow;

const ANNOTATIONS = [["xyz:AAPL", { category: "stocks" }]] as PerpConciseAnnotationsResponse;
const PRELAUNCH_ANNOTATIONS = [
	["xyz:AAPL", { category: "stocks" }],
	["para:UNITREE", { category: "preipo" }],
] as PerpConciseAnnotationsResponse;
const NOOP = () => {};

function SelectorHookProbe() {
	const selector = useTokenSelector({
		value: "",
		onValueChange: testState.onValueChange,
		open: testState.open,
		onOpenChange: NOOP,
	});

	return (
		<div>
			<input data-testid="selector-keyboard" onKeyDown={selector.handleKeyDown} />
			<button type="button" data-testid="crypto-scope" onClick={() => selector.handleScopeSelect("crypto")}>
				Crypto
			</button>
			<button type="button" data-testid="traditional-scope" onClick={() => selector.handleScopeSelect("traditional")}>
				Traditional
			</button>
			<button type="button" data-testid="prelaunch-scope" onClick={() => selector.handleScopeSelect("prelaunch")}>
				Pre-launch
			</button>
			<button type="button" data-testid="spot-scope" onClick={() => selector.handleScopeSelect("spot")}>
				Spot
			</button>
			<button type="button" data-testid="meme-subcategory" onClick={() => selector.handleSubcategorySelect("meme")}>
				Meme
			</button>
			<button type="button" data-testid="stocks-subcategory" onClick={() => selector.handleSubcategorySelect("stocks")}>
				Stocks
			</button>
			<button type="button" data-testid="usdt-subcategory" onClick={() => selector.handleSubcategorySelect("USDT")}>
				USDT
			</button>
			<button type="button" data-testid="retry" onClick={selector.retryClassifications}>
				Retry
			</button>
			<button type="button" data-testid="sort-price" onClick={() => selector.handleSort("price")}>
				Sort by price
			</button>
			<button type="button" data-testid="sort-change" onClick={() => selector.handleSort("24h-change")}>
				Sort by change
			</button>
			<output
				data-loading={String(selector.isLoading)}
				data-error={String(selector.hasClassificationError)}
				data-markets={selector.rows.map((row) => row.original.name).join(",")}
				data-scope={selector.scope}
				data-subcategory={selector.subcategory}
				data-subcategories={selector.subcategories.map(({ value }) => value).join(",")}
			/>
		</div>
	);
}

describe("token selector wiring", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		testState.annotations = undefined;
		testState.annotationsPending = false;
		testState.annotationsError = false;
		testState.markets = [BTC_MARKET, AAPL_MARKET];
		testState.marketsLoading = false;
		testState.refetchAnnotations.mockReset();
		testState.refetchAnnotations.mockResolvedValue({ data: undefined });
		testState.toggleFavoriteMarket.mockReset();
		testState.onValueChange.mockReset();
		testState.measure.mockReset();
		testState.scrollToIndex.mockReset();
		testState.exchangeScope = "all";
		testState.exchangeDex = undefined;
		testState.open = true;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function renderHookProbe(scope: "crypto" | "traditional" | "prelaunch" | null = "crypto") {
		act(() => {
			root.render(<SelectorHookProbe />);
		});
		if (scope) {
			act(() => {
				container.querySelector<HTMLButtonElement>(`[data-testid="${scope}-scope"]`)?.click();
			});
		}

		const output = container.querySelector("output");
		if (!output) throw new Error("Missing token selector probe output");
		return output;
	}

	it("maps a pending annotation query to loading and suppresses classified rows", () => {
		testState.annotationsPending = true;

		const output = renderHookProbe("traditional");

		expect(output.getAttribute("data-loading")).toBe("true");
		expect(output.getAttribute("data-error")).toBe("false");
		expect(output.getAttribute("data-markets")).toBe("");
	});

	it("maps an annotation error to the retryable error state", () => {
		testState.annotationsError = true;

		const output = renderHookProbe("traditional");

		expect(output.getAttribute("data-loading")).toBe("false");
		expect(output.getAttribute("data-error")).toBe("true");
		expect(output.getAttribute("data-markets")).toBe("");

		act(() => {
			container.querySelector<HTMLButtonElement>('[data-testid="retry"]')?.click();
		});
		expect(testState.refetchAnnotations).toHaveBeenCalledTimes(1);
	});

	it("loads and filters Pre-launch from official preipo annotations", () => {
		testState.markets = [BTC_MARKET, AAPL_MARKET, UNITREE_MARKET];
		testState.annotations = PRELAUNCH_ANNOTATIONS;

		const output = renderHookProbe("prelaunch");

		expect(output.getAttribute("data-loading")).toBe("false");
		expect(output.getAttribute("data-error")).toBe("false");
		expect(output.getAttribute("data-markets")).toBe("para:UNITREE");
	});

	it.each([
		{ pending: true, error: false, loading: "true", hasError: "false" },
		{ pending: false, error: true, loading: "false", hasError: "true" },
	])("fails closed while Pre-launch classifications are unavailable", ({ pending, error, loading, hasError }) => {
		testState.markets = [UNITREE_MARKET];
		testState.annotationsPending = pending;
		testState.annotationsError = error;

		const output = renderHookProbe("prelaunch");

		expect(output.getAttribute("data-loading")).toBe(loading);
		expect(output.getAttribute("data-error")).toBe(hasError);
		expect(output.getAttribute("data-markets")).toBe("");
	});

	it("keeps a successful empty response distinct from loading and errors", () => {
		testState.annotations = [];

		const output = renderHookProbe("traditional");

		expect(output.getAttribute("data-loading")).toBe("false");
		expect(output.getAttribute("data-error")).toBe("false");
		expect(output.getAttribute("data-markets")).toBe("");
	});

	it("retains classified rows when cached annotations exist during a background error", () => {
		testState.annotations = ANNOTATIONS;
		testState.annotationsError = true;

		const output = renderHookProbe("traditional");
		act(() => container.querySelector<HTMLButtonElement>('[data-testid="stocks-subcategory"]')?.click());

		expect(output.getAttribute("data-loading")).toBe("false");
		expect(output.getAttribute("data-error")).toBe("false");
		expect(output.getAttribute("data-markets")).toBe("xyz:AAPL");
	});

	it("does not block Crypto while annotations are pending", () => {
		testState.annotationsPending = true;

		const output = renderHookProbe("crypto");

		expect(output.getAttribute("data-loading")).toBe("false");
		expect(output.getAttribute("data-error")).toBe("false");
		expect(output.getAttribute("data-markets")).toBe("BTC");
		expect(output.getAttribute("data-subcategories")).toBe("all,ai,defi,gaming,layer1,layer2,meme");
	});

	it("remembers a separate subcategory for each primary scope", () => {
		testState.annotations = ANNOTATIONS;
		const output = renderHookProbe("crypto");

		act(() => container.querySelector<HTMLButtonElement>('[data-testid="meme-subcategory"]')?.click());
		expect(output.getAttribute("data-subcategory")).toBe("meme");

		act(() => container.querySelector<HTMLButtonElement>('[data-testid="traditional-scope"]')?.click());
		act(() => container.querySelector<HTMLButtonElement>('[data-testid="stocks-subcategory"]')?.click());
		expect(output.getAttribute("data-subcategory")).toBe("stocks");

		act(() => container.querySelector<HTMLButtonElement>('[data-testid="crypto-scope"]')?.click());
		expect(output.getAttribute("data-subcategory")).toBe("meme");

		act(() => container.querySelector<HTMLButtonElement>('[data-testid="traditional-scope"]')?.click());
		expect(output.getAttribute("data-subcategory")).toBe("stocks");
	});

	it("keeps an All-route browsing scope and subcategory across close and reopen", () => {
		const output = renderHookProbe("crypto");

		act(() => container.querySelector<HTMLButtonElement>('[data-testid="meme-subcategory"]')?.click());
		expect(output.getAttribute("data-scope")).toBe("crypto");
		expect(output.getAttribute("data-subcategory")).toBe("meme");

		testState.open = false;
		act(() => root.render(<SelectorHookProbe />));
		testState.open = true;
		act(() => root.render(<SelectorHookProbe />));

		expect(output.getAttribute("data-scope")).toBe("crypto");
		expect(output.getAttribute("data-subcategory")).toBe("meme");
	});

	it("scrolls the virtual list to the first row when primary or child filters change", () => {
		testState.annotations = ANNOTATIONS;
		renderHookProbe("crypto");
		testState.scrollToIndex.mockClear();

		act(() => container.querySelector<HTMLButtonElement>('[data-testid="meme-subcategory"]')?.click());
		expect(testState.scrollToIndex).toHaveBeenLastCalledWith(0, { align: "start" });

		testState.scrollToIndex.mockClear();
		act(() => container.querySelector<HTMLButtonElement>('[data-testid="traditional-scope"]')?.click());
		expect(testState.scrollToIndex).toHaveBeenLastCalledWith(0, { align: "start" });
	});

	it("keeps Arrow navigation and Enter selection available from the search context", () => {
		renderHookProbe(null);
		const keyboardTarget = container.querySelector<HTMLInputElement>('[data-testid="selector-keyboard"]');

		act(() => keyboardTarget?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
		expect(testState.scrollToIndex).toHaveBeenLastCalledWith(1, { align: "auto" });

		act(() => keyboardTarget?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
		expect(testState.onValueChange).toHaveBeenCalledWith("xyz:AAPL", expect.objectContaining({ name: "xyz:AAPL" }));
	});

	it("resets an externally selected HIP-3 scope when its dex filter is cleared", () => {
		testState.exchangeScope = "builders-perp";
		testState.exchangeDex = "xyz";
		const output = renderHookProbe(null);

		expect(output.getAttribute("data-scope")).toBe("hip3");
		expect(output.getAttribute("data-subcategory")).toBe("xyz");

		testState.exchangeDex = undefined;
		act(() => root.render(<SelectorHookProbe />));

		expect(output.getAttribute("data-scope")).toBe("hip3");
		expect(output.getAttribute("data-subcategory")).toBe("all");
	});

	it("preserves the current scope subcategory when the selector closes and reopens", () => {
		testState.exchangeScope = "spot";
		testState.markets = [
			{
				name: "@1",
				kind: "spot",
				shortName: "BTC/USDT",
				pairName: "BTC/USDT",
				tokensInfo: [{ name: "BTC" }, { name: "USDT", displayName: "USDT" }],
			} as MarketRow,
		];
		const output = renderHookProbe(null);

		act(() => container.querySelector<HTMLButtonElement>('[data-testid="usdt-subcategory"]')?.click());
		expect(output.getAttribute("data-subcategory")).toBe("USDT");

		testState.open = false;
		act(() => root.render(<SelectorHookProbe />));
		testState.open = true;
		act(() => root.render(<SelectorHookProbe />));

		expect(output.getAttribute("data-scope")).toBe("spot");
		expect(output.getAttribute("data-subcategory")).toBe("USDT");
	});

	function quotedMarket(name: string, fields: Partial<MarketRow>): MarketRow {
		return {
			name,
			kind: "perp",
			shortName: name,
			pairName: `${name}-USDC`,
			szDecimals: 2,
			maxLeverage: 10,
			dayNtlVlm: "1000",
			markPriceStatus: "success",
			markPriceReceivedAt: Date.now(),
			assetContextLive: true,
			...fields,
		} as MarketRow;
	}

	function sortBy(column: "price" | "change") {
		act(() => container.querySelector<HTMLButtonElement>(`[data-testid="sort-${column}"]`)?.click());
	}

	it("sorts by price on the live mid, falling back to the mark only without a mid", () => {
		testState.markets = [
			quotedMarket("AAA", { markPx: "100", midPx: "90" }),
			quotedMarket("BBB", { markPx: "95", midPx: "99" }),
			quotedMarket("CCC", { markPx: "97", midPx: null }),
			quotedMarket("DDD", { markPx: "200", midPx: "200", markPriceStatus: "stale" }),
		];
		const output = renderHookProbe(null);

		sortBy("price");
		expect(output.getAttribute("data-markets")).toBe("BBB,CCC,AAA,DDD");
		sortBy("price");
		expect(output.getAttribute("data-markets")).toBe("AAA,CCC,BBB,DDD");
	});

	it("sorts by the 24h change of the live mid against the same row's previous day price", () => {
		testState.markets = [
			quotedMarket("AAA", { markPx: "100", midPx: "90", prevDayPx: "95" }),
			quotedMarket("BBB", { markPx: "95", midPx: "99", prevDayPx: "98" }),
			quotedMarket("CCC", { markPx: "50", midPx: "60", prevDayPx: "40", assetContextLive: false }),
		];
		const output = renderHookProbe(null);

		sortBy("change");
		expect(output.getAttribute("data-markets")).toBe("BBB,AAA,CCC");
		sortBy("change");
		expect(output.getAttribute("data-markets")).toBe("AAA,BBB,CCC");
	});

	it("does not block the unclassified All scope while annotations are pending", () => {
		testState.annotationsPending = true;

		const output = renderHookProbe(null);

		expect(output.getAttribute("data-loading")).toBe("false");
		expect(output.getAttribute("data-error")).toBe("false");
		expect(output.getAttribute("data-markets")?.split(",").sort()).toEqual(["BTC", "xyz:AAPL"]);
	});

	it("renders classification failures as an alert with a working retry action", () => {
		const retry = vi.fn();
		const table = {
			getHeaderGroups: () => [{ headers: [] }],
		} as unknown as ReturnType<typeof useTokenSelector>["table"];

		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<TokenSelectorContent
						selectedMarket={undefined}
						scope="traditional"
						subcategory="all"
						subcategories={[]}
						search=""
						setSearch={NOOP}
						isLoading={false}
						hasClassificationError
						onRetryClassifications={retry}
						isFavorite={() => false}
						sorting={[]}
						handleSort={NOOP}
						handleSelect={NOOP}
						handleSubcategorySelect={NOOP}
						handleScopeSelect={NOOP}
						toggleFavorite={NOOP}
						table={table}
						rows={[]}
						virtualItems={[]}
						virtualTotalSize={0}
						containerRef={{ current: null }}
						filteredMarkets={[]}
						highlightedIndex={-1}
						headingId="market-selector-heading"
					/>
				</I18nProvider>,
			);
		});

		const alert = container.querySelector('[role="alert"]');
		expect(alert?.textContent).toContain("Failed to load market categories.");

		act(() => {
			[...container.querySelectorAll("button")].find((button) => button.textContent === "Retry")?.click();
		});
		expect(retry).toHaveBeenCalledTimes(1);
	});

	it("uses an iOS-safe font size for the mobile market search field", () => {
		const onClose = vi.fn();
		const table = {
			getHeaderGroups: () => [{ headers: [] }],
		} as unknown as ReturnType<typeof useTokenSelector>["table"];

		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<TokenSelectorContent
						selectedMarket={undefined}
						scope="all"
						subcategory="all"
						subcategories={[]}
						search=""
						setSearch={NOOP}
						isLoading={false}
						hasClassificationError={false}
						onRetryClassifications={NOOP}
						isFavorite={() => false}
						sorting={[]}
						handleSort={NOOP}
						handleSelect={NOOP}
						handleSubcategorySelect={NOOP}
						handleScopeSelect={NOOP}
						toggleFavorite={NOOP}
						table={table}
						rows={[]}
						virtualItems={[]}
						virtualTotalSize={0}
						containerRef={{ current: null }}
						filteredMarkets={[]}
						highlightedIndex={-1}
						headingId="mobile-market-selector-heading"
						mobile
						onClose={onClose}
					/>
				</I18nProvider>,
			);
		});

		const searchInput = container.querySelector<HTMLInputElement>('input[type="search"]');
		expect(searchInput?.className).toContain("text-base");
		expect(searchInput?.className).toContain("leading-5");
		expect(searchInput?.className).not.toContain("text-sm");

		const closeButton = container.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
		expect(closeButton?.className).toContain("size-11");
		act(() => closeButton?.click());
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("names the market search clear button in the active language", () => {
		const table = {
			getHeaderGroups: () => [{ headers: [] }],
		} as unknown as ReturnType<typeof useTokenSelector>["table"];

		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<TokenSelectorContent
						selectedMarket={undefined}
						scope="all"
						subcategory="all"
						subcategories={[]}
						search="btc"
						setSearch={NOOP}
						isLoading={false}
						hasClassificationError={false}
						onRetryClassifications={NOOP}
						isFavorite={() => false}
						sorting={[]}
						handleSort={NOOP}
						handleSelect={NOOP}
						handleSubcategorySelect={NOOP}
						handleScopeSelect={NOOP}
						toggleFavorite={NOOP}
						table={table}
						rows={[]}
						virtualItems={[]}
						virtualTotalSize={0}
						containerRef={{ current: null }}
						filteredMarkets={[]}
						highlightedIndex={-1}
						headingId="market-search-clear-label"
					/>
				</I18nProvider>,
			);
		});
		const clearButton = container.querySelector<HTMLButtonElement>('button[aria-label="Clear search"]');
		expect(clearButton).not.toBeNull();

		act(() =>
			i18n.loadAndActivate({
				locale: "zh",
				messages: {
					[createHash("sha256").update("Clear search\x1f").digest("base64").slice(0, 6)]: "清除搜索",
				},
			}),
		);

		expect(container.querySelector('button[aria-label="清除搜索"]')).toBe(clearButton);
	});

	it("routes list navigation keys only from search and uses the official scope labels", () => {
		const handleListKeyDown = vi.fn();
		const table = {
			getHeaderGroups: () => [{ headers: [] }],
		} as unknown as ReturnType<typeof useTokenSelector>["table"];

		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<TokenSelectorContent
						selectedMarket={undefined}
						scope="traditional"
						subcategory="all"
						subcategories={[
							{ value: "all", label: "All" },
							{ value: "fx", label: "FX" },
						]}
						search=""
						setSearch={NOOP}
						isLoading={false}
						hasClassificationError
						onRetryClassifications={NOOP}
						isFavorite={() => false}
						sorting={[]}
						handleSort={NOOP}
						handleSelect={NOOP}
						handleSubcategorySelect={NOOP}
						handleScopeSelect={NOOP}
						toggleFavorite={NOOP}
						table={table}
						rows={[]}
						virtualItems={[]}
						virtualTotalSize={0}
						containerRef={{ current: null }}
						filteredMarkets={[]}
						highlightedIndex={-1}
						handleListKeyDown={handleListKeyDown}
						headingId="selector-keyboard-contract"
						mobile
						onClose={NOOP}
					/>
				</I18nProvider>,
			);
		});

		const searchInput = container.querySelector<HTMLInputElement>('input[type="search"]');
		const fxButton = [...container.querySelectorAll<HTMLButtonElement>('button[aria-label^="Filter by"]')].find(
			(button) => button.textContent === "FX",
		);
		const prelaunchButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent === "Pre-launch",
		);
		const closeButton = container.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
		const retryButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent === "Retry",
		);
		const sortButton = container.querySelector<HTMLButtonElement>('button[aria-label^="Sort by"]');
		const primaryScopeLabels = [...container.querySelectorAll<HTMLButtonElement>("button")]
			.map((button) => button.textContent?.trim())
			.filter((label) =>
				[
					"Favorites",
					"All",
					"Perp",
					"Spot",
					"Crypto",
					"Traditional Finance",
					"HIP-3",
					"Popular",
					"Pre-launch",
				].includes(label ?? ""),
			);

		expect(fxButton).toBeDefined();
		expect(prelaunchButton).toBeDefined();
		expect(primaryScopeLabels.slice(0, 9)).toEqual([
			"Favorites",
			"All",
			"Perp",
			"Spot",
			"Crypto",
			"Traditional Finance",
			"HIP-3",
			"Popular",
			"Pre-launch",
		]);
		expect(closeButton).not.toBeNull();
		expect(retryButton).toBeDefined();
		expect(sortButton).not.toBeNull();
		act(() => searchInput?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
		expect(handleListKeyDown).toHaveBeenCalledTimes(1);

		act(() => fxButton?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
		act(() => prelaunchButton?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
		act(() => closeButton?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
		act(() => retryButton?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
		act(() => sortButton?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
		expect(handleListKeyDown).toHaveBeenCalledTimes(1);
	});

	it.each([false, true])("renders and operates Crypto subcategories when mobile is %s", (mobile) => {
		const handleSubcategorySelect = vi.fn();
		const table = {
			getHeaderGroups: () => [{ headers: [] }],
		} as unknown as ReturnType<typeof useTokenSelector>["table"];
		const subcategories = [
			{ value: "all", label: "All" },
			{ value: "ai", label: "AI" },
			{ value: "defi", label: "Defi" },
			{ value: "gaming", label: "Gaming" },
			{ value: "layer1", label: "Layer 1" },
			{ value: "layer2", label: "Layer 2" },
			{ value: "meme", label: "Meme" },
		];

		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<TokenSelectorContent
						selectedMarket={undefined}
						scope="crypto"
						subcategory="ai"
						subcategories={subcategories}
						search=""
						setSearch={NOOP}
						isLoading={false}
						hasClassificationError={false}
						onRetryClassifications={NOOP}
						isFavorite={() => false}
						sorting={[]}
						handleSort={NOOP}
						handleSelect={NOOP}
						handleSubcategorySelect={handleSubcategorySelect}
						handleScopeSelect={NOOP}
						toggleFavorite={NOOP}
						table={table}
						rows={[]}
						virtualItems={[]}
						virtualTotalSize={0}
						containerRef={{ current: null }}
						filteredMarkets={[]}
						highlightedIndex={-1}
						headingId={`${mobile ? "mobile" : "desktop"}-crypto-categories`}
						mobile={mobile}
					/>
				</I18nProvider>,
			);
		});

		const buttons = [...container.querySelectorAll<HTMLButtonElement>('button[aria-label^="Filter by"]')];
		const mobileTableHeader = [...container.querySelectorAll<HTMLElement>("div")].find(
			(element) => element.firstElementChild?.textContent === "Market" && element.className.includes("grid-cols-"),
		);
		expect(buttons.map((button) => button.textContent)).toEqual([
			"All",
			"AI",
			"Defi",
			"Gaming",
			"Layer 1",
			"Layer 2",
			"Meme",
		]);
		expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual([
			"false",
			"true",
			"false",
			"false",
			"false",
			"false",
			"false",
		]);
		if (mobile) {
			expect(mobileTableHeader?.className).toContain("grid-cols-[minmax(0,1fr)_74px_72px]");
			expect(mobileTableHeader?.className).toContain("min-[390px]:grid-cols-[minmax(0,1fr)_102px_84px]");
		}

		act(() => buttons.at(-1)?.click());
		expect(handleSubcategorySelect).toHaveBeenCalledWith("meme");
	});
});
