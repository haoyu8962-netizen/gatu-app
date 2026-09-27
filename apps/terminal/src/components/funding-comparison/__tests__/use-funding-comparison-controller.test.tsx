// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FUNDING_COMPARISON_MAX_SNAPSHOT_AGE_MS, FUNDING_COMPARISON_QUERY_OPTIONS } from "@/config/funding-comparison";
import { LIVE_MARK_MAX_STALE_MS, type MarkPriceStatus } from "@/domain/trade/market-price";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { useFundingComparisonController } from "../use-funding-comparison-controller";

interface FundingsQueryState {
	data: unknown;
	dataUpdatedAt: number;
	isError: boolean;
	fetchStatus: "idle" | "fetching" | "paused";
	refetch: () => Promise<unknown>;
}

interface PerpMarketState {
	name: string;
	openInterest?: string;
	markPx?: string;
	markPriceStatus: MarkPriceStatus;
	markPriceReceivedAt: number | undefined;
}

interface MarketsState {
	perpMarkets: PerpMarketState[];
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
	return {
		data,
		dataUpdatedAt: data === undefined ? 0 : Date.now(),
		isError: false,
		fetchStatus: "idle",
		refetch: vi.fn(async () => undefined),
		...overrides,
	};
}

function perp(
	name: string,
	openInterest?: string,
	markPx?: string,
	overrides: Partial<PerpMarketState> = {},
): PerpMarketState {
	const live = openInterest !== undefined && markPx !== undefined;
	return {
		name,
		openInterest,
		markPx,
		markPriceStatus: live ? "success" : "loading",
		markPriceReceivedAt: live ? Date.now() : undefined,
		...overrides,
	};
}

function markets(overrides: Partial<MarketsState> = {}): MarketsState {
	return {
		perpMarkets: [perp("BTC", "10", "100000"), perp("ETH", "100", "4000")],
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
		vi.useRealTimers();
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

	it("bounds the snapshot age at two refresh intervals", () => {
		expect(FUNDING_COMPARISON_MAX_SNAPSHOT_AGE_MS).toBe(120_000);
		expect(FUNDING_COMPARISON_MAX_SNAPSHOT_AGE_MS).toBe(FUNDING_COMPARISON_QUERY_OPTIONS.refetchInterval * 2);
	});

	it("keeps a fresh snapshot through a failed refresh and drops it once it ages past the bound", () => {
		vi.useFakeTimers({ now: 1_800_000_000_000 });
		store.holder.state = {
			fundings: fundings([entry("BTC", "0.00001", "0.0001"), entry("ETH", "0.00002", "0.00004")]),
			markets: markets(),
		};
		render();
		act(() => store.set({ fundings: { ...store.get().fundings, isError: true, fetchStatus: "idle" } }));
		expect(current()).toMatchObject({ pageState: "normal", totalRows: 2 });
		expect(current().rows.map((row) => row.coin)).toEqual(["BTC", "ETH"]);

		act(() => vi.advanceTimersByTime(FUNDING_COMPARISON_MAX_SNAPSHOT_AGE_MS - 1));
		expect(current()).toMatchObject({ pageState: "normal", totalRows: 2 });

		act(() => vi.advanceTimersByTime(1));
		expect(current()).toMatchObject({ pageState: "error", rows: [], totalRows: 0, isRetrying: false });

		act(() => current().onRetry());
		expect(store.get().fundings.refetch).toHaveBeenCalledOnce();

		act(() => store.set({ fundings: { ...store.get().fundings, fetchStatus: "fetching" } }));
		expect(current()).toMatchObject({ pageState: "error", rows: [], isRetrying: true });

		act(() => store.set({ fundings: fundings([entry("BTC", "0.00001", "0.0001")]) }));
		expect(current()).toMatchObject({ pageState: "normal", totalRows: 1 });
	});

	it("stays quiet with a skeleton while an aged snapshot is refreshed without a failure", () => {
		vi.useFakeTimers({ now: 1_800_000_000_000 });
		store.holder.state = { fundings: fundings([entry("BTC", "0.00001", "0.0001")]), markets: markets() };
		render();
		expect(current().pageState).toBe("normal");

		act(() => vi.advanceTimersByTime(FUNDING_COMPARISON_MAX_SNAPSHOT_AGE_MS));
		expect(current()).toMatchObject({ pageState: "loading", rows: [], totalRows: 0 });

		act(() => store.set({ fundings: { ...store.get().fundings, fetchStatus: "fetching" } }));
		expect(current()).toMatchObject({ pageState: "loading", rows: [] });

		act(() => store.set({ fundings: fundings([entry("BTC", "0.00001", "0.0001")]) }));
		expect(current()).toMatchObject({ pageState: "normal", totalRows: 1 });
	});

	it("rechecks the snapshot age when the page becomes visible again", () => {
		vi.useFakeTimers({ now: 1_800_000_000_000 });
		store.holder.state = { fundings: fundings([entry("BTC", "0.00001", "0.0001")]), markets: markets() };
		render();
		vi.setSystemTime(Date.now() + FUNDING_COMPARISON_MAX_SNAPSHOT_AGE_MS);
		expect(current().pageState).toBe("normal");

		act(() => {
			document.dispatchEvent(new Event("visibilitychange"));
		});
		expect(current()).toMatchObject({ pageState: "loading", rows: [] });
	});

	it("keeps measuring the snapshot age on the monotonic clock after the wall clock is rolled back", () => {
		vi.useFakeTimers({ now: 1_800_000_000_000 });
		store.holder.state = { fundings: fundings([entry("BTC", "0.00001", "0.0001")]), markets: markets() };
		render();
		act(() => store.set({ fundings: { ...store.get().fundings, isError: true } }));

		act(() => vi.advanceTimersByTime(60_000));
		act(() => vi.setSystemTime(Date.now() - 60_000));
		act(() => vi.advanceTimersByTime(FUNDING_COMPARISON_MAX_SNAPSHOT_AGE_MS - 60_000 - 1));
		expect(current()).toMatchObject({ pageState: "normal", totalRows: 1 });

		act(() => vi.advanceTimersByTime(1));
		expect(current()).toMatchObject({ pageState: "error", rows: [], totalRows: 0 });
	});

	it("drops the snapshot once 120 s of monotonic time pass after the wall clock went back an hour", () => {
		vi.useFakeTimers({ now: 1_800_000_000_000 });
		store.holder.state = { fundings: fundings([entry("BTC", "0.00001", "0.0001")]), markets: markets() };
		render();
		act(() => store.set({ fundings: { ...store.get().fundings, isError: true } }));

		act(() => vi.setSystemTime(Date.now() - 3_600_000));
		act(() => vi.advanceTimersByTime(FUNDING_COMPARISON_MAX_SNAPSHOT_AGE_MS));
		expect(current()).toMatchObject({ pageState: "error", rows: [] });
	});

	it.each([
		["focus", () => window.dispatchEvent(new Event("focus"))],
		["visibilitychange", () => document.dispatchEvent(new Event("visibilitychange"))],
	])("rechecks the monotonic snapshot age on %s after a throttled timer and a wall-clock rollback", (_event, fire) => {
		vi.useFakeTimers({ now: 1_800_000_000_000 });
		store.holder.state = { fundings: fundings([entry("BTC", "0.00001", "0.0001")]), markets: markets() };
		render();
		act(() => vi.clearAllTimers());
		act(() => vi.advanceTimersByTime(FUNDING_COMPARISON_MAX_SNAPSHOT_AGE_MS));
		act(() => vi.setSystemTime(Date.now() - FUNDING_COMPARISON_MAX_SNAPSHOT_AGE_MS));
		expect(current().pageState).toBe("normal");

		act(fire);
		expect(current()).toMatchObject({ pageState: "loading", rows: [] });
	});

	it("treats a wall clock that went back behind the receipt as an unusable snapshot on the next check", () => {
		vi.useFakeTimers({ now: 1_800_000_000_000 });
		store.holder.state = { fundings: fundings([entry("BTC", "0.00001", "0.0001")]), markets: markets() };
		render();
		act(() => vi.setSystemTime(Date.now() - 3_600_000));
		expect(current().pageState).toBe("normal");

		act(() => {
			window.dispatchEvent(new Event("focus"));
		});
		expect(current()).toMatchObject({ pageState: "loading", rows: [] });
	});

	it("does not conclude an empty result from an aged empty snapshot", () => {
		vi.useFakeTimers({ now: 1_800_000_000_000 });
		store.holder.state = { fundings: fundings([]), markets: markets() };
		render();
		expect(current().pageState).toBe("empty");

		act(() => vi.advanceTimersByTime(FUNDING_COMPARISON_MAX_SNAPSHOT_AGE_MS));
		expect(current().pageState).toBe("loading");

		act(() => store.set({ fundings: { ...store.get().fundings, isError: true } }));
		expect(current().pageState).toBe("error");
	});

	it("drops the snapshot while the refresh is paused offline or received ahead of the local clock", () => {
		render();
		expect(current().pageState).toBe("normal");

		act(() => store.set({ fundings: { ...store.get().fundings, fetchStatus: "paused" } }));
		expect(current()).toMatchObject({ pageState: "loading", rows: [], totalRows: 0 });

		act(() => store.set({ fundings: { ...store.get().fundings, isError: true } }));
		expect(current()).toMatchObject({ pageState: "error", rows: [] });

		act(() => store.set({ fundings: fundings([entry("BTC", "0.00001", "0.0001")]) }));
		expect(current()).toMatchObject({ pageState: "normal", totalRows: 1 });

		act(() =>
			store.set({ fundings: fundings([entry("BTC", "0.00001", "0.0001")], { dataUpdatedAt: Date.now() + 60_000 }) }),
		);
		expect(current()).toMatchObject({ pageState: "loading", rows: [] });
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
			markets: markets({ perpMarkets: coins.map((coin) => perp(coin, "1", "1")) }),
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
			markets: markets({ perpMarkets: [perp("BTC")] }),
		};
		render();
		expect(current().rows[0].openInterestUsd).toBeNull();

		act(() => store.set({ markets: markets({ perpMarkets: [perp("BTC", "2", "50000")] }) }));
		expect(current().rows[0].openInterestUsd).toBe("100000");
	});

	it("hides open interest while the market price is not live, sorts it last and keeps the funding rates", () => {
		render();
		const openInterestByCoin = () => current().rows.map((row) => [row.coin, row.openInterestUsd]);
		expect(openInterestByCoin()).toEqual([
			["BTC", "1000000"],
			["ETH", "400000"],
		]);

		const unavailable: Partial<PerpMarketState>[] = [
			{ markPriceStatus: "loading" },
			{ markPriceStatus: "stale" },
			{ markPriceStatus: "error" },
			{ markPriceStatus: "idle" },
			{ markPriceReceivedAt: undefined },
			{ markPriceReceivedAt: Date.now() - LIVE_MARK_MAX_STALE_MS - 1 },
			{ markPriceReceivedAt: Date.now() + 60_000 },
		];
		for (const overrides of unavailable) {
			act(() =>
				store.set({
					markets: markets({ perpMarkets: [perp("BTC", "10", "100000", overrides), perp("ETH", "100", "4000")] }),
				}),
			);
			expect(current().pageState).toBe("normal");
			expect(openInterestByCoin()).toEqual([
				["ETH", "400000"],
				["BTC", null],
			]);
			expect(current().rows[1].rates.HlPerp.value).toBe("0.00008");
			expect(current().rows[1].arbs.BinPerp?.value).toBe("0.00002");
		}

		act(() => current().onSort("openInterest"));
		expect(current().sortDirection).toBe("ascending");
		expect(openInterestByCoin()).toEqual([
			["ETH", "400000"],
			["BTC", null],
		]);

		act(() => store.set({ markets: markets() }));
		expect(openInterestByCoin()).toEqual([
			["ETH", "400000"],
			["BTC", "1000000"],
		]);
	});

	it("opens the trade route for a selected market", () => {
		render();
		act(() => current().onSelectMarket("ETH"));
		expect(store.holder.navigate).toHaveBeenCalledWith("ETH");
	});
});
