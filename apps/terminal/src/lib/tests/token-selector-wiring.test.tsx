// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { PerpConciseAnnotationsResponse } from "@nktkas/hyperliquid";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketRow } from "@/components/trade/chart/token-selector-categories";
import { TokenSelectorContent } from "@/components/trade/chart/token-selector-content";
import { useTokenSelector } from "@/components/trade/chart/use-token-selector";

const testState = vi.hoisted(() => ({
	annotations: undefined as PerpConciseAnnotationsResponse | undefined,
	annotationsPending: false,
	annotationsError: false,
	refetchAnnotations: vi.fn(),
	markets: [] as MarketRow[],
	marketsLoading: false,
	toggleFavoriteMarket: vi.fn(),
	measure: vi.fn(),
	scrollToIndex: vi.fn(),
}));

vi.mock("@gatu/hl-react", () => ({
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
	useExchangeScope: () => ({ scope: "all", dex: undefined }),
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

const ANNOTATIONS = [["xyz:AAPL", { category: "stocks" }]] as PerpConciseAnnotationsResponse;
const NOOP = () => {};

function SelectorHookProbe() {
	const selector = useTokenSelector({
		value: "",
		onValueChange: NOOP,
		open: true,
		onOpenChange: NOOP,
	});

	return (
		<div>
			<button type="button" data-testid="crypto-scope" onClick={() => selector.handleScopeSelect("crypto")}>
				Crypto
			</button>
			<button type="button" data-testid="retry" onClick={selector.retryClassifications}>
				Retry
			</button>
			<output
				data-loading={String(selector.isLoading)}
				data-error={String(selector.hasClassificationError)}
				data-markets={selector.rows.map((row) => row.original.name).join(",")}
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
		testState.measure.mockReset();
		testState.scrollToIndex.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function renderHookProbe(selectCrypto = true) {
		act(() => {
			root.render(<SelectorHookProbe />);
		});
		if (selectCrypto) {
			act(() => {
				container.querySelector<HTMLButtonElement>('[data-testid="crypto-scope"]')?.click();
			});
		}

		const output = container.querySelector("output");
		if (!output) throw new Error("Missing token selector probe output");
		return output;
	}

	it("maps a pending annotation query to loading and suppresses classified rows", () => {
		testState.annotationsPending = true;

		const output = renderHookProbe();

		expect(output.getAttribute("data-loading")).toBe("true");
		expect(output.getAttribute("data-error")).toBe("false");
		expect(output.getAttribute("data-markets")).toBe("");
	});

	it("maps an annotation error to the retryable error state", () => {
		testState.annotationsError = true;

		const output = renderHookProbe();

		expect(output.getAttribute("data-loading")).toBe("false");
		expect(output.getAttribute("data-error")).toBe("true");
		expect(output.getAttribute("data-markets")).toBe("");

		act(() => {
			container.querySelector<HTMLButtonElement>('[data-testid="retry"]')?.click();
		});
		expect(testState.refetchAnnotations).toHaveBeenCalledTimes(1);
	});

	it("keeps a successful empty response distinct from loading and errors", () => {
		testState.annotations = [];

		const output = renderHookProbe();

		expect(output.getAttribute("data-loading")).toBe("false");
		expect(output.getAttribute("data-error")).toBe("false");
		expect(output.getAttribute("data-markets")).toBe("");
	});

	it("retains classified rows when cached annotations exist during a background error", () => {
		testState.annotations = ANNOTATIONS;
		testState.annotationsError = true;

		const output = renderHookProbe();

		expect(output.getAttribute("data-loading")).toBe("false");
		expect(output.getAttribute("data-error")).toBe("false");
		expect(output.getAttribute("data-markets")).toBe("BTC");
	});

	it("does not block annotation-independent scopes while annotations are pending", () => {
		testState.annotationsPending = true;

		const output = renderHookProbe(false);

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
						scope="crypto"
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
});
