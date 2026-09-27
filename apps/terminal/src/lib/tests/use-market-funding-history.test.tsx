// @vitest-environment jsdom

import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FundingHistoryRange } from "@/domain/market/funding-rate-history";
import { useMarketFundingHistory } from "@/hooks/trade/use-market-funding-history";

const HOUR_MS = 3_600_000;
const NOW = 1_790_496_000_000 + 16 * HOUR_MS;
const STALE_TIME_MS = 5 * 60_000;

const mocks = vi.hoisted(() => ({
	env: "Mainnet",
	fundingHistory: vi.fn(),
	isOnline: true,
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ env: mocks.env, info: { fundingHistory: mocks.fundingHistory } }),
}));

vi.mock("@/hooks/use-mobile", () => ({
	useOnlineStatus: () => mocks.isOnline,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let latest: ReturnType<typeof useMarketFundingHistory> | null = null;

function Probe({ coin, enabled, range }: { coin: string; enabled: boolean; range: FundingHistoryRange }) {
	latest = useMarketFundingHistory({ coin, enabled, range });
	return null;
}

function OtherView({ coin, range }: { coin: string; range: FundingHistoryRange }) {
	useMarketFundingHistory({ coin, enabled: true, range });
	return null;
}

function rows(coin: string, count: number, rate = "0.0000125") {
	return Array.from({ length: count }, (_, index) => ({
		coin,
		fundingRate: rate,
		premium: "0",
		time: NOW - (count - index) * HOUR_MS + 11,
	}));
}

function deferred<T>() {
	let resolve: (value: T) => void = () => {};
	let reject: (error: unknown) => void = () => {};
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, reject, resolve };
}

async function flush() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

function installFakeClock() {
	vi.useFakeTimers({ now: NOW, toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
}

// Fake timers give a zero-delay timer created during a tick a 1 ms delay, so TanStack's notification
// timers scheduled by an interval or stale timeout need a few extra milliseconds to reach React.
const NOTIFY_SETTLE_MS = 5;

async function advance(ms: number) {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms + NOTIFY_SETTLE_MS);
	});
}

describe("useMarketFundingHistory", () => {
	let container: HTMLDivElement;
	let root: Root;
	let client: QueryClient;

	beforeEach(() => {
		vi.spyOn(Date, "now").mockReturnValue(NOW);
		mocks.env = "Mainnet";
		mocks.isOnline = true;
		mocks.fundingHistory.mockReset();
		latest = null;
		client = new QueryClient();
		container = document.createElement("div");
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		client.clear();
		vi.useRealTimers();
		onlineManager.setOnline(true);
		focusManager.setFocused(undefined);
		vi.restoreAllMocks();
	});

	async function render(props: { coin?: string; enabled?: boolean; range?: FundingHistoryRange } = {}) {
		await act(async () => {
			root.render(
				<QueryClientProvider client={client}>
					<Probe coin={props.coin ?? "BTC"} enabled={props.enabled ?? true} range={props.range ?? "8h"} />
				</QueryClientProvider>,
			);
		});
	}

	async function renderWithOtherView(props: { enabled: boolean; range: FundingHistoryRange }) {
		await act(async () => {
			root.render(
				<QueryClientProvider client={client}>
					<Probe coin="BTC" enabled={props.enabled} range={props.range} />
					<OtherView coin="BTC" range={props.range} />
				</QueryClientProvider>,
			);
		});
	}

	function current() {
		if (!latest) throw new Error("Missing hook value");
		return latest;
	}

	it("does not request history while inactive or without a perpetual coin", async () => {
		await render({ enabled: false });
		expect(current().status).toBe("disabled");
		await render({ coin: "" });
		expect(current().status).toBe("disabled");
		await flush();

		expect(mocks.fundingHistory).not.toHaveBeenCalled();
	});

	it("maps a complete snapshot to ready range buckets", async () => {
		const firstPage = deferred<unknown>();
		mocks.fundingHistory.mockReturnValueOnce(firstPage.promise);

		await render();
		expect(current().status).toBe("loading");
		await act(async () => firstPage.resolve(rows("BTC", 12)));
		await flush();

		expect(current().status).toBe("ready");
		expect(current().buckets.map((bucket) => bucket.rate)).toEqual(["0.00005", "0.0001"]);
		expect(current().buckets.at(-1)?.cumulativeRate).toBe("0.00015");
		expect(mocks.fundingHistory.mock.calls[0]?.[0]).toEqual({
			coin: "BTC",
			endTime: NOW,
			startTime: NOW - 30 * 24 * HOUR_MS,
		});
	});

	it("keeps a confirmed empty snapshot distinct from loading", async () => {
		mocks.fundingHistory.mockResolvedValue([]);

		await render({ coin: "xyz:NEW" });
		await flush();

		expect(current()).toMatchObject({ buckets: [], status: "ready" });
	});

	it("never exposes the previous market or range while the next key loads", async () => {
		mocks.fundingHistory.mockResolvedValueOnce(rows("BTC", 8));
		await render();
		await flush();
		expect(current().buckets).toHaveLength(1);

		const pending = deferred<unknown>();
		mocks.fundingHistory.mockReturnValueOnce(pending.promise);
		await render({ coin: "ETH" });
		expect(current()).toMatchObject({ buckets: [], status: "loading" });
		await act(async () => pending.resolve(rows("ETH", 16)));
		await flush();
		expect(current().buckets).toHaveLength(2);

		mocks.fundingHistory.mockReturnValueOnce(new Promise(() => {}));
		await render({ coin: "ETH", range: "1h" });
		expect(current()).toMatchObject({ buckets: [], status: "loading" });

		mocks.env = "Testnet";
		mocks.fundingHistory.mockReturnValueOnce(new Promise(() => {}));
		await render({ coin: "ETH" });
		expect(current()).toMatchObject({ buckets: [], status: "loading" });
		expect(mocks.fundingHistory.mock.calls.map(([params]) => params.coin)).toEqual(["BTC", "ETH", "ETH", "ETH"]);
	});

	it("reports a failed first load as an error, and a retry as loading", async () => {
		mocks.fundingHistory.mockRejectedValueOnce(new Error("bad request"));
		await render();
		await flush();
		expect(current()).toMatchObject({ buckets: [], status: "error" });

		const pending = deferred<unknown>();
		mocks.fundingHistory.mockReturnValueOnce(pending.promise);
		act(() => current().refresh());
		await flush();
		expect(current().status).toBe("loading");

		await act(async () => pending.resolve(rows("BTC", 8)));
		await flush();
		expect(current().status).toBe("ready");
	});

	it("keeps loaded buckets when a refresh fails", async () => {
		mocks.fundingHistory.mockResolvedValueOnce(rows("BTC", 8));
		await render();
		await flush();
		const loaded = current().buckets;

		mocks.fundingHistory.mockRejectedValueOnce(new Error("server error"));
		act(() => current().refresh());
		await flush();

		expect(current().status).toBe("ready");
		expect(current().buckets).toBe(loaded);
	});

	it("reports an offline first load without an error", async () => {
		mocks.isOnline = false;
		mocks.fundingHistory.mockRejectedValueOnce(new Error("network"));
		await render();
		await flush();

		expect(current().status).toBe("offline");
	});

	it("does not refetch a stale snapshot on window focus", async () => {
		mocks.fundingHistory.mockResolvedValue(rows("BTC", 8));
		await render();
		await flush();
		vi.spyOn(Date, "now").mockReturnValue(NOW + 10 * 60_000);

		await act(async () => {
			focusManager.setFocused(false);
			focusManager.setFocused(true);
		});
		await flush();

		expect(mocks.fundingHistory).toHaveBeenCalledTimes(1);
		focusManager.setFocused(undefined);
	});

	it("keeps the cached snapshot while inactive and refreshes a stale one on reactivation", async () => {
		mocks.fundingHistory.mockResolvedValue(rows("BTC", 8));
		await render();
		await flush();
		const loaded = current().buckets;

		await render({ enabled: false });
		expect(current()).toMatchObject({ buckets: loaded, status: "ready" });
		await render();
		await flush();
		expect(mocks.fundingHistory).toHaveBeenCalledTimes(1);

		await render({ enabled: false });
		vi.spyOn(Date, "now").mockReturnValue(NOW + 10 * 60_000);
		const pending = deferred<unknown>();
		mocks.fundingHistory.mockReturnValueOnce(pending.promise);
		await render();

		expect(mocks.fundingHistory).toHaveBeenCalledTimes(2);
		expect(current()).toMatchObject({ buckets: loaded, isRefreshing: true, status: "ready" });
		await act(async () => pending.resolve(rows("BTC", 8)));
	});

	it("aborts an in-flight load when the view deactivates, and loads again on reactivation", async () => {
		const firstPage = deferred<unknown>();
		let firstSignal: AbortSignal | undefined;
		mocks.fundingHistory.mockImplementationOnce((_params: unknown, signal: AbortSignal) => {
			firstSignal = signal;
			return firstPage.promise;
		});
		await render({ range: "1d" });
		expect(current().status).toBe("loading");
		expect(mocks.fundingHistory).toHaveBeenCalledTimes(1);

		await render({ enabled: false, range: "1d" });
		await flush();
		expect(firstSignal?.aborted).toBe(true);
		expect(current()).toMatchObject({ buckets: [], status: "disabled" });

		await act(async () => firstPage.resolve(rows("BTC", 500)));
		await flush();
		expect(mocks.fundingHistory).toHaveBeenCalledTimes(1);
		expect(current()).toMatchObject({ buckets: [], status: "disabled" });

		const reactivatedPage = deferred<unknown>();
		mocks.fundingHistory.mockReturnValueOnce(reactivatedPage.promise);
		await render({ range: "1d" });
		expect(current().status).toBe("loading");
		await act(async () => reactivatedPage.resolve(rows("BTC", 48)));
		await flush();

		expect(mocks.fundingHistory).toHaveBeenCalledTimes(2);
		expect(mocks.fundingHistory.mock.calls[1]?.[1]?.aborted).toBe(false);
		expect(current().status).toBe("ready");
		expect(current().buckets).toHaveLength(2);
	});

	it("keeps an in-flight load that another active view still needs", async () => {
		const firstPage = deferred<unknown>();
		let firstSignal: AbortSignal | undefined;
		mocks.fundingHistory.mockImplementationOnce((_params: unknown, signal: AbortSignal) => {
			firstSignal = signal;
			return firstPage.promise;
		});
		await renderWithOtherView({ enabled: true, range: "8h" });
		await renderWithOtherView({ enabled: false, range: "8h" });
		await flush();

		expect(firstSignal?.aborted).toBe(false);
		await act(async () => firstPage.resolve(rows("BTC", 8)));
		await flush();
		expect(current()).toMatchObject({ status: "ready" });
		expect(current().buckets).toHaveLength(1);
		expect(mocks.fundingHistory).toHaveBeenCalledTimes(1);
	});

	it("never confirms an empty history from a stale snapshot whose refresh failed", async () => {
		mocks.fundingHistory.mockResolvedValueOnce([]);
		await render({ coin: "xyz:NEW" });
		await flush();
		expect(current()).toMatchObject({ buckets: [], status: "ready" });

		await render({ coin: "xyz:NEW", enabled: false });
		vi.spyOn(Date, "now").mockReturnValue(NOW + 10 * 60_000);
		const refresh = deferred<unknown>();
		mocks.fundingHistory.mockReturnValueOnce(refresh.promise);
		await render({ coin: "xyz:NEW" });
		expect(mocks.fundingHistory).toHaveBeenCalledTimes(2);
		expect(current()).toMatchObject({ buckets: [], status: "loading" });

		await act(async () => refresh.reject(new Error("server error")));
		await flush();
		expect(current()).toMatchObject({ buckets: [], status: "error" });

		mocks.fundingHistory.mockResolvedValueOnce([]);
		act(() => current().refresh());
		await flush();
		expect(current()).toMatchObject({ buckets: [], status: "ready" });
	});

	it("never confirms an empty history from a stale snapshot while its refresh is paused offline", async () => {
		mocks.fundingHistory.mockResolvedValueOnce([]);
		await render({ coin: "xyz:NEW" });
		await flush();

		await render({ coin: "xyz:NEW", enabled: false });
		vi.spyOn(Date, "now").mockReturnValue(NOW + 10 * 60_000);
		mocks.isOnline = false;
		onlineManager.setOnline(false);
		await render({ coin: "xyz:NEW" });
		await flush();

		expect(mocks.fundingHistory).toHaveBeenCalledTimes(1);
		expect(current()).toMatchObject({ buckets: [], status: "offline" });

		mocks.isOnline = true;
		mocks.fundingHistory.mockResolvedValueOnce([]);
		await act(async () => onlineManager.setOnline(true));
		await flush();
		expect(mocks.fundingHistory).toHaveBeenCalledTimes(2);
		expect(current()).toMatchObject({ buckets: [], status: "ready" });
	});

	it("refreshes an active empty snapshot when it goes stale instead of confirming it", async () => {
		installFakeClock();
		mocks.fundingHistory.mockResolvedValueOnce([]);
		await render({ coin: "xyz:NEW" });
		await advance(0);
		expect(current()).toMatchObject({ buckets: [], status: "ready" });

		const refresh = deferred<unknown>();
		mocks.fundingHistory.mockReturnValueOnce(refresh.promise);
		await advance(STALE_TIME_MS);

		expect(mocks.fundingHistory).toHaveBeenCalledTimes(2);
		expect(current()).toMatchObject({ buckets: [], status: "loading" });

		await act(async () => refresh.resolve([]));
		await advance(0);
		expect(current()).toMatchObject({ buckets: [], status: "ready" });
	});

	it("stops refreshing an empty snapshot once a refresh returns records", async () => {
		installFakeClock();
		mocks.fundingHistory.mockResolvedValueOnce([]);
		await render({ coin: "xyz:NEW" });
		await advance(0);

		mocks.fundingHistory.mockResolvedValue(rows("xyz:NEW", 8));
		await advance(STALE_TIME_MS);
		expect(mocks.fundingHistory).toHaveBeenCalledTimes(2);
		expect(current().status).toBe("ready");
		expect(current().buckets).toHaveLength(1);

		await advance(3 * STALE_TIME_MS);
		expect(mocks.fundingHistory).toHaveBeenCalledTimes(2);
		expect(current().buckets).toHaveLength(1);
	});

	it("does not poll a non-empty history while the view stays active", async () => {
		installFakeClock();
		mocks.fundingHistory.mockResolvedValue(rows("BTC", 8));
		await render();
		await advance(0);
		expect(current().status).toBe("ready");

		await advance(3 * STALE_TIME_MS);

		expect(mocks.fundingHistory).toHaveBeenCalledTimes(1);
		expect(current()).toMatchObject({ isRefreshing: false, status: "ready" });
		expect(current().buckets).toHaveLength(1);
	});

	it("does not refresh a stale empty snapshot while the view is inactive", async () => {
		installFakeClock();
		mocks.fundingHistory.mockResolvedValueOnce([]);
		await render({ coin: "xyz:NEW" });
		await advance(0);

		await render({ coin: "xyz:NEW", enabled: false });
		await advance(3 * STALE_TIME_MS);

		expect(mocks.fundingHistory).toHaveBeenCalledTimes(1);
	});

	it("stops confirming a stale empty snapshot while the page is hidden, and refreshes it on return", async () => {
		installFakeClock();
		mocks.fundingHistory.mockResolvedValueOnce([]);
		await render({ coin: "xyz:NEW" });
		await advance(0);
		expect(current()).toMatchObject({ buckets: [], status: "ready" });

		act(() => focusManager.setFocused(false));
		await advance(STALE_TIME_MS);

		expect(mocks.fundingHistory).toHaveBeenCalledTimes(1);
		expect(current()).toMatchObject({ buckets: [], status: "loading" });

		mocks.fundingHistory.mockResolvedValueOnce([]);
		act(() => focusManager.setFocused(true));
		await advance(0);

		expect(mocks.fundingHistory).toHaveBeenCalledTimes(2);
		expect(current()).toMatchObject({ buckets: [], status: "ready" });
	});

	it("does not confirm an empty history while the app is offline", async () => {
		mocks.fundingHistory.mockResolvedValueOnce([]);
		await render({ coin: "xyz:NEW" });
		await flush();
		expect(current().status).toBe("ready");

		mocks.isOnline = false;
		await render({ coin: "xyz:NEW" });
		expect(current()).toMatchObject({ buckets: [], status: "offline" });
	});
});
