// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FUNDING_COMPARISON_QUERY_OPTIONS } from "@/config/funding-comparison";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { useFundingComparisonController } from "../use-funding-comparison-controller";

interface FundingsQueryState {
	data: unknown;
	isError: boolean;
	fetchStatus: "idle" | "fetching" | "paused";
	refetch: () => Promise<unknown>;
}

interface MarketsState {
	perpMarkets: { name: string; openInterest?: string; markPx?: string }[];
	catalogState: { status: "restoring" | "loading" | "paused" | "error" | "ready" };
	catalogQueries: {
		allPerpMetas: { status: "pending" | "error" | "success"; fetchStatus: "idle" | "fetching" | "paused" };
	};
	retryMarketCatalog: () => Promise<void>;
}

interface StoreState {
	fundings: FundingsQueryState;
	markets: MarketsState;
}

const store = vi.hoisted(() => {
	const listeners = new Set<() => void>();
	const holder: { state: StoreState | null; infoCalls: unknown[][]; navigate: (coin: string) => void } = {
		state: null,
		infoCalls: [],
		navigate: () => undefined,
	};
	return {
		holder,
		get(): StoreState {
			if (!holder.state) throw new Error("Store was not initialised");
			return holder.state;
		},
		set(next: Partial<StoreState>) {
			holder.state = { ...(holder.state as StoreState), ...next };
			for (const listener of listeners) listener();
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
});

vi.mock("@/lib/hyperliquid", async () => {
	const { useSyncExternalStore } = await import("react");
	return {
		useInfo: (...args: unknown[]) => {
			store.holder.infoCalls.push(args);
			return useSyncExternalStore(store.subscribe, () => store.get().fundings);
		},
		useMarketsInfo: () => useSyncExternalStore(store.subscribe, () => store.get().markets),
	};
});

vi.mock("@/hooks/trade/use-market-navigation", () => ({
	useMarketNavigation: () => store.holder.navigate,
}));

const NEXT = 1_790_000_000_000;

function entry(coin: string, hlRate: string, binanceRate: string) {
	return [
		coin,
		[
			["HlPerp", { fundingRate: hlRate, nextFundingTime: NEXT, fundingIntervalHours: 1 }],
			["BinPerp", { fundingRate: binanceRate, nextFundingTime: NEXT, fundingIntervalHours: 8 }],
			["BybitPerp", null],
		],
	];
}

function fundings(data: unknown, overrides: Partial<FundingsQueryState> = {}): FundingsQueryState {
	return { data, isError: false, fetchStatus: "idle", refetch: vi.fn(async () => undefined), ...overrides };
}

function markets(overrides: Partial<MarketsState> = {}): MarketsState {
	return {
		perpMarkets: [
			{ name: "BTC", openInterest: "10", markPx: "100000" },
			{ name: "ETH", openInterest: "100", markPx: "4000" },
		],
		catalogState: { status: "ready" },
		catalogQueries: { allPerpMetas: { status: "success", fetchStatus: "idle" } },
		retryMarketCatalog: vi.fn(async () => undefined),
		...overrides,
	};
}

let controller: ReturnType<typeof useFundingComparisonController> | null = null;

function Probe() {
	controller = useFundingComparisonController();
	return null;
}

function current() {
	if (!controller) throw new Error("Controller was not captured");
	return controller;
}

describe("useFundingComparisonController", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		store.holder.state = {
			fundings: fundings([entry("BTC", "0.00001", "0.0001"), entry("ETH", "0.00002", "0.00004")]),
			markets: markets(),
		};
		store.holder.infoCalls = [];
		store.holder.navigate = vi.fn();
		controller = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function render() {
		act(() => root.render(<Probe />));
	}

	it("requests unpersisted predicted fundings with the page cadence and sorts by open interest", () => {
		render();

		expect(store.holder.infoCalls[0]).toEqual(["predictedFundings", undefined, FUNDING_COMPARISON_QUERY_OPTIONS]);
		expect(FUNDING_COMPARISON_QUERY_OPTIONS).toEqual({
			requestTimeoutMs: 10_000,
			staleTime: 30_000,
			refetchInterval: 60_000,
			retry: 1,
		});
		expect(current()).toMatchObject({
			pageState: "normal",
			period: "8h",
			sortKey: "openInterest",
			sortDirection: "descending",
			rowsPerPage: 25,
			totalRows: 2,
		});
		expect(current().rows.map((row) => row.coin)).toEqual(["BTC", "ETH"]);
		expect(current().rows[0].rates.HlPerp.value).toBe("0.00008");
	});

	it("stays quiet while the first snapshot, the catalog or the network is pending", () => {
		store.holder.state = {
			fundings: fundings(undefined, { fetchStatus: "fetching" }),
			markets: markets(),
		};
		render();
		expect(current()).toMatchObject({ pageState: "loading", rows: [], isRetrying: false });

		act(() => store.set({ fundings: fundings(undefined, { fetchStatus: "paused" }) }));
		expect(current().pageState).toBe("loading");

		act(() =>
			store.set({
				fundings: fundings([entry("BTC", "0.00001", "0.0001")]),
				markets: markets({ catalogState: { status: "restoring" } }),
			}),
		);
		expect(current()).toMatchObject({ pageState: "loading", rows: [] });

		act(() => store.set({ markets: markets({ catalogState: { status: "loading" } }) }));
		expect(current().pageState).toBe("loading");

		act(() => store.set({ markets: markets({ catalogState: { status: "paused" } }) }));
		expect(current().pageState).toBe("loading");

		act(() => store.set({ markets: markets() }));
		expect(current()).toMatchObject({ pageState: "normal", totalRows: 1 });
	});

	it("shows the quiet retry state for a failed or malformed first snapshot", () => {
		store.holder.state = { fundings: fundings(undefined, { isError: true }), markets: markets() };
		render();
		expect(current()).toMatchObject({ pageState: "error", isRetrying: false });

		act(() => current().onRetry());
		expect(store.get().fundings.refetch).toHaveBeenCalledOnce();
		expect(store.get().markets.retryMarketCatalog).not.toHaveBeenCalled();

		act(() => store.set({ fundings: fundings(undefined, { isError: true, fetchStatus: "fetching" }) }));
		expect(current()).toMatchObject({ pageState: "error", isRetrying: true });

		act(() => store.set({ fundings: fundings({ BTC: [] }) }));
		expect(current()).toMatchObject({ pageState: "error", rows: [] });

		act(() => store.set({ fundings: fundings([["BTC", [["HlPerp", { fundingRate: "1e-5", nextFundingTime: 1 }]]]]) }));
		expect(current().pageState).toBe("error");
	});

	it("fails closed when the perp catalog failed and retries both sources", () => {
		store.holder.state = { fundings: fundings([entry("BTC", "0.00001", "0.0001")]), markets: markets() };
		store.set({ markets: markets({ perpMarkets: [], catalogState: { status: "error" } }) });
		render();
		expect(current()).toMatchObject({ pageState: "error", rows: [] });

		act(() => current().onRetry());
		expect(store.get().fundings.refetch).toHaveBeenCalledOnce();
		expect(store.get().markets.retryMarketCatalog).toHaveBeenCalledOnce();

		act(() =>
			store.set({
				markets: markets({
					perpMarkets: [],
					catalogQueries: { allPerpMetas: { status: "error", fetchStatus: "fetching" } },
				}),
			}),
		);
		expect(current().pageState).toBe("loading");

		act(() =>
			store.set({
				markets: markets({
					perpMarkets: [],
					catalogQueries: { allPerpMetas: { status: "error", fetchStatus: "idle" } },
				}),
			}),
		);
		expect(current().pageState).toBe("error");
	});

	it("keeps the last snapshot quietly when a refresh fails", () => {
		render();
		act(() => store.set({ fundings: { ...store.get().fundings, isError: true, fetchStatus: "idle" } }));
		expect(current()).toMatchObject({ pageState: "normal", totalRows: 2 });
		expect(current().rows.map((row) => row.coin)).toEqual(["BTC", "ETH"]);
	});

	it("concludes empty only for a current successful snapshot and separates an empty search", () => {
		store.holder.state = { fundings: fundings([]), markets: markets() };
		render();
		expect(current()).toMatchObject({ pageState: "empty", totalRows: 0 });

		act(() => store.set({ fundings: fundings([], { isError: true }) }));
		expect(current().pageState).toBe("error");

		act(() => store.set({ fundings: fundings([entry("BTC", "0.00001", "0.0001")]) }));
		act(() => current().onQueryChange("  doge "));
		expect(current()).toMatchObject({ pageState: "noResults", query: "  doge ", totalRows: 0 });

		act(() => current().onClearQuery());
		expect(current()).toMatchObject({ pageState: "normal", query: "", totalRows: 1 });
	});

	it("returns to the first page when the period, sort, search or page size changes", () => {
		const coins = Array.from({ length: 30 }, (_, index) => `C${String(index).padStart(2, "0")}`);
		store.holder.state = {
			fundings: fundings(coins.map((coin) => entry(coin, "0.00001", "0.0001"))),
			markets: markets({ perpMarkets: coins.map((coin) => ({ name: coin, openInterest: "1", markPx: "1" })) }),
		};
		render();
		expect(current()).toMatchObject({ page: 1, totalPages: 2, start: 1, end: 25 });

		const goToSecondPage = () => {
			act(() => current().onNextPage());
			expect(current()).toMatchObject({ page: 2, start: 26, end: 30 });
		};

		goToSecondPage();
		act(() => current().onNextPage());
		expect(current().page).toBe(2);
		act(() => current().onPeriodChange("1y"));
		expect(current()).toMatchObject({ page: 1, period: "1y" });

		goToSecondPage();
		act(() => current().onSort("BinPerp"));
		expect(current()).toMatchObject({ page: 1, sortKey: "BinPerp", sortDirection: "descending" });

		goToSecondPage();
		act(() => current().onQueryChange("C"));
		expect(current()).toMatchObject({ page: 1, totalRows: 30 });

		goToSecondPage();
		act(() => current().onRowsPerPageChange(10));
		expect(current()).toMatchObject({ page: 1, rowsPerPage: 10, totalPages: 3 });

		act(() => current().onRowsPerPageChange(7));
		expect(current().rowsPerPage).toBe(10);

		act(() => current().onPreviousPage());
		expect(current().page).toBe(1);
	});

	it("shows the open-interest placeholder until the market context arrives", () => {
		store.holder.state = {
			fundings: fundings([entry("BTC", "0.00001", "0.0001")]),
			markets: markets({ perpMarkets: [{ name: "BTC" }] }),
		};
		render();
		expect(current().rows[0].openInterestUsd).toBeNull();

		act(() => store.set({ markets: markets({ perpMarkets: [{ name: "BTC", openInterest: "2", markPx: "50000" }] }) }));
		expect(current().rows[0].openInterestUsd).toBe("100000");
	});

	it("opens the trade route for a selected market", () => {
		render();
		act(() => current().onSelectMarket("ETH"));
		expect(store.holder.navigate).toHaveBeenCalledWith("ETH");
	});
});
