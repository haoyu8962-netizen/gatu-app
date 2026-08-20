import type { CandleWsEvent } from "@nktkas/hyperliquid";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatafeed } from "@/components/trade/chart/datafeed";
import { CHART_HISTORY_REQUEST_TIMEOUT_MS } from "@/config/time";
import { resetCandleGates } from "@/lib/chart/candle-gate";
import { getChartMarketKeys, getChartMarketLookupKey, getChartSymbolInfo } from "@/lib/chart/market-symbol";
import { resolutionToInterval } from "@/lib/chart/resolution";
import { getCandleStore } from "@/lib/chart/store";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import type { Bar, LibrarySymbolInfo, ResolutionString } from "@/types/charting_library";

const infoClient = vi.hoisted(() => ({
	allMids: vi.fn(),
	candleSnapshot: vi.fn(),
	meta: vi.fn(),
}));

const subscriptionClient = vi.hoisted(() => ({
	candle: vi.fn(),
	unsubscribe: vi.fn(),
}));

vi.mock("@lingui/core/macro", () => ({
	t: (strings: TemplateStringsArray, ...values: unknown[]) =>
		strings.reduce((result, part, index) => `${result}${part}${values[index] ?? ""}`, ""),
}));

vi.mock("@/lib/hyperliquid", () => ({
	getInfoClient: () => infoClient,
	getSubscriptionClient: () => subscriptionClient,
}));

function resolveDatafeedSymbol(datafeed: ReturnType<typeof createDatafeed>, symbolName: string) {
	return new Promise<LibrarySymbolInfo>((resolve, reject) => {
		datafeed.resolveSymbol(symbolName, resolve, reject, {});
	});
}

function getMarketSymbolResolver(market: UnifiedMarketInfo) {
	const keys = new Set(getChartMarketKeys(market).map(getChartMarketLookupKey));
	return (symbolName: string, coin: string) =>
		keys.has(getChartMarketLookupKey(symbolName)) || keys.has(getChartMarketLookupKey(coin))
			? getChartSymbolInfo(market)
			: undefined;
}

describe("TradingView datafeed", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetCandleGates();
		infoClient.candleSnapshot.mockReset().mockResolvedValue([]);
		infoClient.allMids.mockResolvedValue({});
		infoClient.meta.mockResolvedValue({ universe: [] });
		subscriptionClient.unsubscribe.mockResolvedValue(undefined);
		subscriptionClient.candle.mockResolvedValue({
			unsubscribe: subscriptionClient.unsubscribe,
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("uses canonical spot symbols while preserving display metadata", async () => {
		const datafeed = createDatafeed({
			getSymbolInfo: (symbolName, coin) =>
				symbolName === "ETH/USDH" || coin === "@235"
					? {
							name: "ETH/USDH",
							ticker: "@235",
							description: "ETH/USDH",
							pricescale: 100,
						}
					: undefined,
		});

		const symbol = await resolveDatafeedSymbol(datafeed, "@235");

		expect(symbol.name).toBe("ETH/USDH");
		expect(symbol.ticker).toBe("@235");
		expect(symbol.description).toBe("ETH/USDH");
		expect(symbol.pricescale).toBe(100);

		infoClient.candleSnapshot.mockResolvedValueOnce([]);
		await new Promise<void>((resolve, reject) => {
			datafeed.getBars(
				symbol,
				"60" as ResolutionString,
				{
					countBack: 100,
					firstDataRequest: false,
					from: Date.UTC(2026, 5, 27) / 1000,
					to: Date.UTC(2026, 5, 28) / 1000,
				},
				() => resolve(),
				reject,
			);
		});

		expect(infoClient.candleSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({
				coin: "@235",
				interval: "1h",
			}),
		);
	});

	it("preserves a slash-based canonical spot ticker after symbol resolution", async () => {
		const market = {
			kind: "spot",
			name: "PURR/USDC",
			pairName: "PURR/USDC",
			szDecimals: 0,
			markPx: "0.2",
		} as UnifiedMarketInfo;
		const datafeed = createDatafeed({ getSymbolInfo: getMarketSymbolResolver(market) });
		const symbol = await resolveDatafeedSymbol(datafeed, "PURR/USDC");

		infoClient.candleSnapshot.mockResolvedValueOnce([]);
		await new Promise<void>((resolve, reject) => {
			datafeed.getBars(
				symbol,
				"60" as ResolutionString,
				{ countBack: 100, firstDataRequest: false, from: 1, to: 2 },
				() => resolve(),
				reject,
			);
		});

		expect(infoClient.candleSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({ coin: "PURR/USDC", interval: "1h" }),
		);
	});

	it("uses canonical HIP-3 symbols while preserving display metadata", async () => {
		const datafeed = createDatafeed({
			getSymbolInfo: (symbolName, coin) =>
				symbolName === "xyz:KR200/USDC" || coin === "xyz:KR200"
					? {
							name: "KR200-USDC",
							ticker: "xyz:KR200",
							description: "KR200-USDC",
							pricescale: 100,
						}
					: undefined,
		});

		const symbol = await resolveDatafeedSymbol(datafeed, "xyz:KR200");

		expect(symbol.name).toBe("KR200-USDC");
		expect(symbol.ticker).toBe("xyz:KR200");
		expect(symbol.description).toBe("KR200-USDC");
		expect(symbol.pricescale).toBe(100);

		infoClient.candleSnapshot.mockResolvedValueOnce([]);
		await new Promise<void>((resolve, reject) => {
			datafeed.getBars(
				symbol,
				"60" as ResolutionString,
				{
					countBack: 100,
					firstDataRequest: false,
					from: Date.UTC(2026, 5, 27) / 1000,
					to: Date.UTC(2026, 5, 28) / 1000,
				},
				() => resolve(),
				reject,
			);
		});

		expect(infoClient.candleSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({
				coin: "xyz:KR200",
				interval: "1h",
			}),
		);
	});

	it("maps an exchange-prefixed HIP-3 display symbol back to its canonical API coin", async () => {
		const market = {
			kind: "builderPerp",
			name: "xyz:CXMT",
			pairName: "CXMT-USDC",
			quoteToken: { displayName: "USDC", name: "USDC" },
			szDecimals: 2,
			markPx: "12.34",
		} as UnifiedMarketInfo;
		const datafeed = createDatafeed({ getSymbolInfo: getMarketSymbolResolver(market) });

		const symbol = await resolveDatafeedSymbol(datafeed, "HYPERLIQUID:CXMT-USDC");
		expect(symbol.ticker).toBe("xyz:CXMT");

		infoClient.candleSnapshot.mockResolvedValueOnce([]);
		await new Promise<void>((resolve, reject) => {
			datafeed.getBars(
				symbol,
				"60" as ResolutionString,
				{
					countBack: 100,
					firstDataRequest: false,
					from: Date.UTC(2026, 5, 27) / 1000,
					to: Date.UTC(2026, 5, 28) / 1000,
				},
				() => resolve(),
				reject,
			);
		});

		expect(infoClient.candleSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({ coin: "xyz:CXMT", interval: "1h" }),
		);
	});

	it("subscribes to HIP-3 candles with the canonical coin after display-name resolution", async () => {
		const market = {
			kind: "builderPerp",
			name: "xyz:CXMT",
			pairName: "CXMT-USDC",
			quoteToken: { displayName: "USDC", name: "USDC" },
			szDecimals: 2,
			markPx: "12.34",
		} as UnifiedMarketInfo;
		const datafeed = createDatafeed({ getSymbolInfo: getMarketSymbolResolver(market) });
		const symbol = await resolveDatafeedSymbol(datafeed, "HYPERLIQUID:CXMT-USDC");
		vi.useFakeTimers();

		datafeed.subscribeBars(symbol, "60" as ResolutionString, vi.fn(), "cxmt-listener", vi.fn());
		await Promise.resolve();
		await Promise.resolve();

		expect(subscriptionClient.candle).toHaveBeenCalledWith(
			{ coin: "xyz:CXMT", interval: "1h" },
			expect.any(Function),
			expect.objectContaining({ onError: expect.any(Function) }),
		);

		datafeed.unsubscribeBars("cxmt-listener");
		await vi.advanceTimersByTimeAsync(5_000);
	});

	it("fails closed when a display symbol is not backed by market metadata", async () => {
		const datafeed = createDatafeed();

		await expect(resolveDatafeedSymbol(datafeed, "HYPERLIQUID:CXMT-USDC")).rejects.toBe(
			"Unknown symbol: HYPERLIQUID:CXMT-USDC",
		);
		expect(infoClient.meta).not.toHaveBeenCalled();
		expect(infoClient.candleSnapshot).not.toHaveBeenCalled();
	});

	it("fails closed when default perp metadata cannot be loaded", async () => {
		infoClient.meta.mockRejectedValueOnce(new Error("meta unavailable"));
		const datafeed = createDatafeed();

		await expect(resolveDatafeedSymbol(datafeed, "CXMT")).rejects.toBe("Unknown symbol: CXMT");
		expect(infoClient.candleSnapshot).not.toHaveBeenCalled();
	});

	it.each(["@CXMT", "xyz:UNKNOWN"])("rejects an unverified structured coin %s", async (symbolName) => {
		const datafeed = createDatafeed();
		await expect(resolveDatafeedSymbol(datafeed, symbolName)).rejects.toBe(`Unknown symbol: ${symbolName}`);
	});

	it("does not request history or subscribe when TradingView supplies an unresolved symbol", async () => {
		const datafeed = createDatafeed();
		const unresolvedSymbol = { name: "CXMT-USDC", ticker: "CXMT" } as LibrarySymbolInfo;
		const historyError = await new Promise<string>((resolve) => {
			datafeed.getBars(
				unresolvedSymbol,
				"60" as ResolutionString,
				{ countBack: 100, firstDataRequest: true, from: 1, to: 2 },
				() => resolve("unexpected success"),
				resolve,
			);
		});

		datafeed.subscribeBars(unresolvedSymbol, "60" as ResolutionString, vi.fn(), "invalid-listener", vi.fn());
		await Promise.resolve();

		expect(historyError).toBe("Unknown symbol: CXMT");
		expect(infoClient.candleSnapshot).not.toHaveBeenCalled();
		expect(subscriptionClient.candle).not.toHaveBeenCalled();
	});

	it("returns older bars when the requested range is empty but older candles exist", async () => {
		const recentFromSeconds = Date.UTC(2026, 5, 27) / 1000;
		const recentToSeconds = Date.UTC(2026, 5, 28) / 1000;
		const olderBarTime = recentFromSeconds * 1_000 - 2 * 60 * 60 * 1_000;
		const previousBarTime = recentFromSeconds * 1_000 - 60 * 60 * 1_000;
		infoClient.candleSnapshot.mockResolvedValueOnce([]).mockResolvedValueOnce([
			{
				T: olderBarTime + 3_599_999,
				c: "2100.1",
				h: "2100.1",
				i: "1h",
				l: "2100.1",
				n: 1,
				o: "2100.1",
				s: "@235",
				t: olderBarTime,
				v: "1",
			},
			{
				T: previousBarTime + 3_599_999,
				c: "2110.1",
				h: "2110.1",
				i: "1h",
				l: "2110.1",
				n: 1,
				o: "2110.1",
				s: "@235",
				t: previousBarTime,
				v: "1",
			},
		]);

		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "@235" ? { name: "ETH/USDH", ticker: "@235", description: "ETH/USDH", pricescale: 100 } : undefined,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "@235");
		vi.useFakeTimers({ now: Date.UTC(2026, 5, 28) });
		const resultPromise = new Promise<{
			bars: { close: number; time: number }[];
			meta: { noData?: boolean } | undefined;
		}>((resolve, reject) => {
			datafeed.getBars(
				symbol,
				"60" as ResolutionString,
				{ countBack: 1, firstDataRequest: true, from: recentFromSeconds, to: recentToSeconds },
				(bars, meta) => resolve({ bars, meta }),
				reject,
			);
		});
		await vi.advanceTimersByTimeAsync(1);
		const result = await resultPromise;

		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(2);
		expect(infoClient.candleSnapshot).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				coin: "@235",
				interval: "1h",
				startTime: recentFromSeconds * 1000,
				endTime: recentToSeconds * 1000,
			}),
		);
		expect(infoClient.candleSnapshot).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				coin: "@235",
				interval: "1h",
				startTime: recentFromSeconds * 1000 - 100 * 60 * 60 * 1_000,
				endTime: recentFromSeconds * 1000,
			}),
		);
		expect(result.bars).toEqual([expect.objectContaining({ close: 2110.1, time: previousBarTime })]);
		expect(result.meta).toEqual({ noData: false });

		vi.useRealTimers();
	});

	it("backfills a partial non-initial response, deduplicates by time, and keeps the latest countBack bars", async () => {
		const dayMs = 24 * 60 * 60 * 1000;
		const nowMs = Date.UTC(2026, 5, 28);
		const fromMs = nowMs - dayMs;
		const oldestTime = fromMs - 3 * dayMs;
		const duplicateTime = fromMs - 2 * dayMs;
		const previousTime = fromMs - dayMs;
		const currentTimeA = fromMs + 12 * 60 * 60 * 1000;
		const currentTimeB = currentTimeA + 60 * 60 * 1000;
		infoClient.candleSnapshot
			.mockResolvedValueOnce([
				{
					T: currentTimeA + 3_599_999,
					c: "20",
					h: "20",
					i: "1h",
					l: "20",
					n: 1,
					o: "20",
					s: "PARTIAL",
					t: currentTimeA,
					v: "1",
				},
				{
					T: currentTimeB + 3_599_999,
					c: "21",
					h: "21",
					i: "1h",
					l: "21",
					n: 1,
					o: "21",
					s: "PARTIAL",
					t: currentTimeB,
					v: "1",
				},
			])
			.mockResolvedValueOnce([
				{
					T: oldestTime + 3_599_999,
					c: "9",
					h: "9",
					i: "1h",
					l: "9",
					n: 1,
					o: "9",
					s: "PARTIAL",
					t: oldestTime,
					v: "1",
				},
				{
					T: duplicateTime + 3_599_999,
					c: "10",
					h: "10",
					i: "1h",
					l: "10",
					n: 1,
					o: "10",
					s: "PARTIAL",
					t: duplicateTime,
					v: "1",
				},
				{
					T: duplicateTime + 3_599_999,
					c: "11",
					h: "11",
					i: "1h",
					l: "11",
					n: 1,
					o: "11",
					s: "PARTIAL",
					t: duplicateTime,
					v: "1",
				},
				{
					T: previousTime + 3_599_999,
					c: "12",
					h: "12",
					i: "1h",
					l: "12",
					n: 1,
					o: "12",
					s: "PARTIAL",
					t: previousTime,
					v: "1",
				},
			]);
		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "PARTIAL"
					? { name: "PARTIAL-USDC", ticker: "PARTIAL", description: "PARTIAL-USDC", pricescale: 100 }
					: undefined,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "PARTIAL");
		vi.useFakeTimers({ now: nowMs });
		const resultPromise = new Promise<Bar[]>((resolve, reject) => {
			datafeed.getBars(
				symbol,
				"60" as ResolutionString,
				{ countBack: 4, firstDataRequest: false, from: fromMs / 1_000, to: nowMs / 1_000 },
				(bars) => resolve(bars),
				reject,
			);
		});
		await vi.advanceTimersByTimeAsync(1);
		const bars = await resultPromise;

		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(2);
		expect(infoClient.candleSnapshot).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ startTime: fromMs - 100 * 60 * 60 * 1_000, endTime: fromMs }),
		);
		expect(bars.map((bar) => bar.time)).toEqual([duplicateTime, previousTime, currentTimeA, currentTimeB]);
		expect(bars.some((bar) => bar.time === oldestTime)).toBe(false);
		expect(bars[0]?.close).toBe(11);
		getCandleStore().getState().clearLastBar("PARTIAL:60");
		datafeed.destroy();
	});

	it("preserves all main-range bars when they already satisfy countBack", async () => {
		const nowMs = Date.UTC(2026, 5, 28);
		const fromMs = nowMs - 24 * 60 * 60 * 1000;
		const times = [fromMs, fromMs + 60 * 60 * 1000, fromMs + 2 * 60 * 60 * 1000];
		infoClient.candleSnapshot.mockResolvedValueOnce(
			times.map((time, index) => ({
				T: time + 3_599_999,
				c: String(20 + index),
				h: String(20 + index),
				i: "1h",
				l: String(20 + index),
				n: 1,
				o: String(20 + index),
				s: "COMPLETE",
				t: time,
				v: "1",
			})),
		);
		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "COMPLETE"
					? { name: "COMPLETE-USDC", ticker: "COMPLETE", description: "COMPLETE-USDC", pricescale: 100 }
					: undefined,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "COMPLETE");
		vi.useFakeTimers({ now: nowMs });
		const resultPromise = new Promise<Bar[]>((resolve, reject) => {
			datafeed.getBars(
				symbol,
				"60" as ResolutionString,
				{ countBack: 2, firstDataRequest: true, from: fromMs / 1_000, to: nowMs / 1_000 },
				(bars) => resolve(bars),
				reject,
			);
		});
		await vi.advanceTimersByTimeAsync(1);

		await expect(resultPromise).resolves.toEqual(times.map((time) => expect.objectContaining({ time })));
		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(1);
		getCandleStore().getState().clearLastBar("COMPLETE:60");
		datafeed.destroy();
	});

	it("proves exhaustion before setting noData on a non-initial historical request", async () => {
		const oldFromSeconds = Date.UTC(2026, 4, 1) / 1000;
		const oldToSeconds = Date.UTC(2026, 4, 2) / 1000;
		infoClient.candleSnapshot.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "@235" ? { name: "ETH/USDH", ticker: "@235", description: "ETH/USDH", pricescale: 100 } : undefined,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "@235");
		vi.useFakeTimers({ now: Date.UTC(2026, 5, 28) });
		const resultPromise = new Promise<{
			bars: { close: number; time: number }[];
			meta: { noData?: boolean } | undefined;
		}>((resolve, reject) => {
			datafeed.getBars(
				symbol,
				"60" as ResolutionString,
				{ countBack: 100, firstDataRequest: false, from: oldFromSeconds, to: oldToSeconds },
				(bars, meta) => resolve({ bars, meta }),
				reject,
			);
		});
		await vi.advanceTimersByTimeAsync(1);
		const result = await resultPromise;

		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(3);
		expect(infoClient.candleSnapshot).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				startTime: oldFromSeconds * 1_000 - 200 * 60 * 60 * 1_000,
				endTime: oldFromSeconds * 1_000,
			}),
		);
		expect(infoClient.candleSnapshot).toHaveBeenNthCalledWith(
			3,
			expect.objectContaining({
				startTime: 0,
				endTime: oldFromSeconds * 1_000,
			}),
		);
		expect(result.bars).toEqual([]);
		expect(result.meta).toEqual({ noData: true });

		vi.useRealTimers();
	});

	it("times out a stalled history request and ignores a late response", async () => {
		let resolveSnapshot: ((value: []) => void) | undefined;
		infoClient.candleSnapshot.mockImplementationOnce(
			() =>
				new Promise<[]>((resolve) => {
					resolveSnapshot = resolve;
				}),
		);
		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "HYPE" ? { name: "HYPE-USDC", ticker: "HYPE", description: "HYPE-USDC", pricescale: 100 } : undefined,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "HYPE");
		vi.useFakeTimers();
		const onResult = vi.fn();
		const onError = vi.fn();

		datafeed.getBars(
			symbol,
			"60" as ResolutionString,
			{ countBack: 100, firstDataRequest: true, from: 1, to: 2 },
			onResult,
			onError,
		);

		await vi.advanceTimersByTimeAsync(CHART_HISTORY_REQUEST_TIMEOUT_MS - 1);
		expect(onResult).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith("Chart history request timed out");
		expect(onResult).not.toHaveBeenCalled();

		resolveSnapshot?.([]);
		await Promise.resolve();
		await vi.advanceTimersByTimeAsync(1);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onResult).not.toHaveBeenCalled();
	});

	it("consumes a late history rejection without reporting a second error", async () => {
		let rejectSnapshot: ((reason: Error) => void) | undefined;
		infoClient.candleSnapshot.mockReturnValueOnce(
			new Promise<[]>((_resolve, reject) => {
				rejectSnapshot = reject;
			}),
		);
		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "HYPE" ? { name: "HYPE-USDC", ticker: "HYPE", description: "HYPE-USDC", pricescale: 100 } : undefined,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "HYPE");
		vi.useFakeTimers();
		const onError = vi.fn();

		datafeed.getBars(
			symbol,
			"60" as ResolutionString,
			{ countBack: 100, firstDataRequest: true, from: 1, to: 2 },
			vi.fn(),
			onError,
		);
		await vi.advanceTimersByTimeAsync(CHART_HISTORY_REQUEST_TIMEOUT_MS + 1);
		expect(onError).toHaveBeenCalledTimes(1);

		rejectSnapshot?.(new Error("late transport failure"));
		await Promise.resolve();
		await vi.advanceTimersByTimeAsync(1);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith("Chart history request timed out");
	});

	it("clears the timeout after a settled history request", async () => {
		infoClient.candleSnapshot.mockResolvedValueOnce([]);
		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "SETTLED"
					? { name: "SETTLED-USDC", ticker: "SETTLED", description: "SETTLED-USDC", pricescale: 100 }
					: undefined,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "SETTLED");
		vi.useFakeTimers();
		const onResult = vi.fn();
		const onError = vi.fn();

		datafeed.getBars(
			symbol,
			"60" as ResolutionString,
			{ countBack: 1, firstDataRequest: false, from: 1, to: 2 },
			onResult,
			onError,
		);
		await vi.advanceTimersByTimeAsync(1);

		expect(onResult).toHaveBeenCalledWith([], { noData: true });
		await vi.advanceTimersByTimeAsync(CHART_HISTORY_REQUEST_TIMEOUT_MS);
		expect(onError).not.toHaveBeenCalled();
		expect(onResult).toHaveBeenCalledTimes(1);
		datafeed.destroy();
	});

	it("shares one timeout budget with the previous-bars fallback", async () => {
		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "HYPE" ? { name: "HYPE-USDC", ticker: "HYPE", description: "HYPE-USDC", pricescale: 100 } : undefined,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "HYPE");
		vi.useFakeTimers({ now: Date.UTC(2026, 5, 28) });
		infoClient.candleSnapshot
			.mockImplementationOnce(
				() => new Promise<[]>((resolve) => setTimeout(() => resolve([]), CHART_HISTORY_REQUEST_TIMEOUT_MS - 2_000)),
			)
			.mockReturnValueOnce(new Promise<[]>(() => {}));
		const onResult = vi.fn();
		const onError = vi.fn();

		datafeed.getBars(
			symbol,
			"60" as ResolutionString,
			{
				countBack: 100,
				firstDataRequest: true,
				from: Date.UTC(2026, 5, 27) / 1_000,
				to: Date.UTC(2026, 5, 28) / 1_000,
			},
			onResult,
			onError,
		);

		await vi.advanceTimersByTimeAsync(CHART_HISTORY_REQUEST_TIMEOUT_MS - 2_000);
		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(2);
		expect(onError).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1_999);
		expect(onError).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(onError).toHaveBeenCalledWith("Chart history request timed out");
		expect(onResult).not.toHaveBeenCalled();
	});

	it("returns partial main-range bars when the single fallback times out", async () => {
		const nowMs = Date.UTC(2026, 5, 28);
		const fromMs = nowMs - 24 * 60 * 60 * 1000;
		const mainBarTime = fromMs + 60 * 60 * 1000;
		infoClient.candleSnapshot
			.mockResolvedValueOnce([
				{
					T: mainBarTime + 3_599_999,
					c: "20",
					h: "20",
					i: "1h",
					l: "20",
					n: 1,
					o: "20",
					s: "PARTIALTIMEOUT",
					t: mainBarTime,
					v: "1",
				},
			])
			.mockReturnValueOnce(new Promise<[]>(() => {}));
		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "PARTIALTIMEOUT"
					? {
							name: "PARTIALTIMEOUT-USDC",
							ticker: "PARTIALTIMEOUT",
							description: "PARTIALTIMEOUT-USDC",
							pricescale: 100,
						}
					: undefined,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "PARTIALTIMEOUT");
		vi.useFakeTimers({ now: nowMs });
		const onResult = vi.fn();
		const onError = vi.fn();

		datafeed.getBars(
			symbol,
			"60" as ResolutionString,
			{ countBack: 10, firstDataRequest: true, from: fromMs / 1_000, to: nowMs / 1_000 },
			onResult,
			onError,
		);
		await vi.advanceTimersByTimeAsync(CHART_HISTORY_REQUEST_TIMEOUT_MS);
		await vi.advanceTimersByTimeAsync(1);

		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(2);
		expect(onResult).toHaveBeenCalledWith([expect.objectContaining({ time: mainBarTime, close: 20 })], {
			noData: false,
		});
		expect(onError).not.toHaveBeenCalled();
		getCandleStore().getState().clearLastBar("PARTIALTIMEOUT:60");
		datafeed.destroy();
	});

	it("reports synchronous validation failures asynchronously", async () => {
		const datafeed = createDatafeed();
		const onError = vi.fn();
		vi.useFakeTimers();

		datafeed.getBars(
			{ name: "UNKNOWN", ticker: "UNKNOWN" } as LibrarySymbolInfo,
			"2S" as ResolutionString,
			{ countBack: 100, firstDataRequest: true, from: 1, to: 2 },
			vi.fn(),
			onError,
		);

		expect(onError).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(0);
		expect(onError).toHaveBeenCalledWith("Unsupported resolution: 2S");
	});

	it("completes disabled symbol searches asynchronously", async () => {
		const datafeed = createDatafeed();
		const onResult = vi.fn();
		vi.useFakeTimers();

		datafeed.searchSymbols("HYPE", "HYPERLIQUID", "crypto", onResult);

		expect(onResult).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(0);
		expect(onResult).toHaveBeenCalledWith([]);
	});

	it("does not advertise server time when only the browser clock is available", async () => {
		const datafeed = createDatafeed();
		const onReady = vi.fn();
		vi.useFakeTimers();

		datafeed.onReady(onReady);

		expect(onReady).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(0);
		expect(onReady).toHaveBeenCalledWith(expect.objectContaining({ supports_time: false }));
		expect(datafeed.getServerTime).toBeUndefined();
	});

	it("declares direct minute and daily bars while delegating calendar weekly and monthly bars", async () => {
		const dailyTime = Date.UTC(2026, 7, 10);
		infoClient.candleSnapshot.mockResolvedValueOnce([
			{
				T: dailyTime + 86_399_999,
				c: "40",
				h: "42",
				i: "1d",
				l: "38",
				n: 1,
				o: "39",
				s: "HYPE",
				t: dailyTime,
				v: "10",
			},
		]);
		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "HYPE" ? { name: "HYPE-USDC", ticker: "HYPE", description: "HYPE-USDC", pricescale: 100 } : undefined,
		});

		const symbol = await resolveDatafeedSymbol(datafeed, "HYPE");

		expect(symbol).toEqual(
			expect.objectContaining({
				has_intraday: true,
				intraday_multipliers: ["1", "3", "5", "15", "30", "60", "120", "240", "480", "720"],
				has_daily: true,
				daily_multipliers: ["1"],
				has_weekly_and_monthly: false,
			}),
		);
		expect(resolutionToInterval("1D" as ResolutionString)).toBe("1d");
		expect(resolutionToInterval("1W" as ResolutionString)).toBeUndefined();
		expect(resolutionToInterval("1M" as ResolutionString)).toBeUndefined();

		await new Promise<void>((resolve, reject) => {
			datafeed.getBars(
				symbol,
				"1D" as ResolutionString,
				{ countBack: 1, firstDataRequest: true, from: dailyTime / 1_000, to: dailyTime / 1_000 + 86_400 },
				() => resolve(),
				reject,
			);
		});
		expect(infoClient.candleSnapshot).toHaveBeenCalledWith(expect.objectContaining({ coin: "HYPE", interval: "1d" }));

		vi.useFakeTimers();
		datafeed.subscribeBars(symbol, "1D" as ResolutionString, vi.fn(), "daily-listener", vi.fn());
		await Promise.resolve();
		await Promise.resolve();
		expect(subscriptionClient.candle).toHaveBeenCalledWith(
			{ coin: "HYPE", interval: "1d" },
			expect.any(Function),
			expect.objectContaining({ onError: expect.any(Function) }),
		);
		datafeed.unsubscribeBars("daily-listener");
		await vi.advanceTimersByTimeAsync(5_000);
	});

	it("invalidates realtime caches before requesting a TradingView data reset", async () => {
		const onRealtimeReset = vi.fn();
		const throwingReset = vi.fn(() => {
			throw new Error("stale TradingView listener");
		});
		const healthyReset = vi.fn();
		const datafeed = createDatafeed({
			onRealtimeReset,
			getSymbolInfo: (_symbolName, coin) =>
				coin === "HYPE" ? { name: "HYPE-USDC", ticker: "HYPE", description: "HYPE-USDC", pricescale: 100 } : undefined,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "HYPE");
		vi.useFakeTimers();

		datafeed.subscribeBars(symbol, "60" as ResolutionString, vi.fn(), "hype-listener-a", throwingReset);
		datafeed.subscribeBars(symbol, "60" as ResolutionString, vi.fn(), "hype-listener-b", healthyReset);
		await Promise.resolve();
		await Promise.resolve();

		datafeed.resetRealtimeCache();

		expect(throwingReset).toHaveBeenCalledTimes(1);
		expect(healthyReset).toHaveBeenCalledTimes(1);
		expect(onRealtimeReset).toHaveBeenCalledTimes(1);

		datafeed.unsubscribeBars("hype-listener-a");
		datafeed.unsubscribeBars("hype-listener-b");
		await vi.advanceTimersByTimeAsync(5_000);
	});

	it("tries a bounded window before one exhaustive fallback when the first range is empty", async () => {
		const nowMs = Date.UTC(2026, 7, 11, 12);
		const fromMs = nowMs - 60_000;
		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "EMPTY"
					? { name: "EMPTY-USDC", ticker: "EMPTY", description: "EMPTY-USDC", pricescale: 100 }
					: undefined,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "EMPTY");
		vi.useFakeTimers({ now: nowMs });
		const onResult = vi.fn();
		const onError = vi.fn();

		datafeed.getBars(
			symbol,
			"1" as ResolutionString,
			{ countBack: 1, firstDataRequest: true, from: fromMs / 1_000, to: nowMs / 1_000 },
			onResult,
			onError,
		);
		await vi.advanceTimersByTimeAsync(1);

		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(3);
		expect(infoClient.candleSnapshot).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ startTime: fromMs - 100 * 60_000, endTime: fromMs }),
		);
		expect(infoClient.candleSnapshot).toHaveBeenNthCalledWith(
			3,
			expect.objectContaining({ startTime: 0, endTime: fromMs }),
		);
		expect(onResult).toHaveBeenCalledWith([], { noData: true });
		expect(onError).not.toHaveBeenCalled();

		datafeed.getBars(
			symbol,
			"1" as ResolutionString,
			{ countBack: 1, firstDataRequest: false, from: fromMs / 1_000 - 60, to: fromMs / 1_000 },
			onResult,
			onError,
		);
		await vi.advanceTimersByTimeAsync(1);

		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(3);
		expect(onResult).toHaveBeenLastCalledWith([], { noData: true });
		expect(onError).not.toHaveBeenCalled();
		datafeed.destroy();
	});

	it("sets noData only after an empty fallback reaches the start of history", async () => {
		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "EMPTY"
					? { name: "EMPTY-USDC", ticker: "EMPTY", description: "EMPTY-USDC", pricescale: 100 }
					: undefined,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "EMPTY");
		vi.useFakeTimers();
		const onResult = vi.fn();

		datafeed.getBars(
			symbol,
			"1" as ResolutionString,
			{ countBack: 1, firstDataRequest: false, from: 30, to: 60 },
			onResult,
			vi.fn(),
		);
		await vi.advanceTimersByTimeAsync(1);

		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(2);
		expect(infoClient.candleSnapshot).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ startTime: 0, endTime: 30_000 }),
		);
		expect(onResult).toHaveBeenCalledWith([], { noData: true });
	});

	it("caps a countBack fallback at Hyperliquid's 5,000-candle history limit", async () => {
		const nowMs = Date.UTC(2026, 7, 11, 12);
		const mainBarTime = nowMs - 30_000;
		infoClient.candleSnapshot.mockResolvedValueOnce([
			{
				T: mainBarTime + 59_999,
				c: "20",
				h: "20",
				i: "1m",
				l: "20",
				n: 1,
				o: "20",
				s: "LIMIT",
				t: mainBarTime,
				v: "1",
			},
		]);
		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "LIMIT"
					? { name: "LIMIT-USDC", ticker: "LIMIT", description: "LIMIT-USDC", pricescale: 100 }
					: undefined,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "LIMIT");
		vi.useFakeTimers({ now: nowMs });

		datafeed.getBars(
			symbol,
			"1" as ResolutionString,
			{ countBack: 10_000, firstDataRequest: true, from: nowMs / 1_000 - 60, to: nowMs / 1_000 + 60 },
			vi.fn(),
			vi.fn(),
		);
		await vi.advanceTimersByTimeAsync(1);

		expect(infoClient.candleSnapshot).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				startTime: nowMs - 60_000 - 4_999 * 60_000,
				endTime: nowMs - 60_000,
			}),
		);
	});

	it("isolates historical cache bars from TradingView callback mutation", async () => {
		const candleTime = Date.UTC(2026, 7, 11, 12);
		infoClient.candleSnapshot.mockResolvedValueOnce([
			{
				T: candleTime + 3_599_999,
				c: "12",
				h: "13",
				i: "1h",
				l: "10",
				n: 1,
				o: "11",
				s: "COPYHIST",
				t: candleTime,
				v: "2",
			},
		]);
		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "COPYHIST"
					? { name: "COPYHIST-USDC", ticker: "COPYHIST", description: "COPYHIST-USDC", pricescale: 100 }
					: undefined,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "COPYHIST");
		const callbackBars = await new Promise<Bar[]>((resolve, reject) => {
			datafeed.getBars(
				symbol,
				"60" as ResolutionString,
				{ countBack: 1, firstDataRequest: false, from: candleTime / 1_000, to: candleTime / 1_000 + 3_600 },
				(bars) => resolve(bars),
				reject,
			);
		});

		const callbackBar = callbackBars[0];
		expect(callbackBar).toBeDefined();
		if (callbackBar) callbackBar.close = 999;
		const cachedBar = getCandleStore().getState().getLastBar("COPYHIST:60");
		expect(cachedBar?.close).toBe(12);
		expect(cachedBar).not.toBe(callbackBar);
		getCandleStore().getState().clearLastBar("COPYHIST:60");
		datafeed.destroy();
	});

	it("isolates realtime cache bars from TradingView callback mutation", async () => {
		let emitCandle: ((event: CandleWsEvent) => void) | undefined;
		subscriptionClient.candle.mockImplementationOnce((_params: unknown, listener: (event: CandleWsEvent) => void) => {
			emitCandle = listener;
			return Promise.resolve({ unsubscribe: subscriptionClient.unsubscribe });
		});
		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "COPYRT"
					? { name: "COPYRT-USDC", ticker: "COPYRT", description: "COPYRT-USDC", pricescale: 100 }
					: undefined,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "COPYRT");
		const onTick = vi.fn((bar: Bar) => {
			bar.close = 999;
		});
		vi.useFakeTimers();
		datafeed.subscribeBars(symbol, "60" as ResolutionString, onTick, "copyrt-listener", vi.fn());
		await Promise.resolve();
		await Promise.resolve();

		emitCandle?.({
			T: 3_600_999,
			c: "12",
			h: "13",
			i: "1h",
			l: "10",
			n: 1,
			o: "11",
			s: "COPYRT",
			t: 1_000,
			v: "2",
		});

		expect(onTick).toHaveBeenCalledOnce();
		const cachedBar = getCandleStore().getState().getLastBar("COPYRT:60");
		expect(cachedBar?.close).toBe(12);
		expect(cachedBar).not.toBe(onTick.mock.calls[0]?.[0]);
		getCandleStore().getState().clearLastBar("COPYRT:60");
		datafeed.destroy();
		await vi.advanceTimersByTimeAsync(5_000);
	});

	it("destroy is idempotent and cancels history, realtime, and delayed callbacks", async () => {
		infoClient.candleSnapshot.mockReturnValueOnce(new Promise<[]>(() => {}));
		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "DESTROY"
					? { name: "DESTROY-USDC", ticker: "DESTROY", description: "DESTROY-USDC", pricescale: 100 }
					: undefined,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "DESTROY");
		vi.useFakeTimers();
		const onReady = vi.fn();
		const onResult = vi.fn();
		const onError = vi.fn();
		datafeed.onReady(onReady);
		datafeed.getBars(
			symbol,
			"60" as ResolutionString,
			{ countBack: 1, firstDataRequest: false, from: 1, to: 2 },
			onResult,
			onError,
		);
		datafeed.subscribeBars(symbol, "60" as ResolutionString, vi.fn(), "destroy-listener", vi.fn());

		datafeed.destroy();
		datafeed.destroy();
		await Promise.resolve();
		await vi.advanceTimersByTimeAsync(CHART_HISTORY_REQUEST_TIMEOUT_MS + 5_000);

		expect(onReady).not.toHaveBeenCalled();
		expect(onResult).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
		expect(subscriptionClient.unsubscribe).toHaveBeenCalledOnce();
	});

	it("excludes a bar sitting exactly on the exclusive range end", async () => {
		const fromSeconds = Date.UTC(2026, 5, 27) / 1000;
		const toSeconds = fromSeconds + 2 * 3600;
		const insideTime = fromSeconds * 1000;
		const boundaryTime = toSeconds * 1000;
		infoClient.candleSnapshot.mockResolvedValueOnce(
			[insideTime, boundaryTime].map((time) => ({
				T: time + 3_599_999,
				c: "20",
				h: "20",
				i: "1h",
				l: "20",
				n: 1,
				o: "20",
				s: "EDGE",
				t: time,
				v: "1",
			})),
		);
		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "EDGE" ? { name: "EDGE-USDC", ticker: "EDGE", description: "EDGE-USDC", pricescale: 100 } : undefined,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "EDGE");

		const bars = await new Promise<Bar[]>((resolve, reject) => {
			datafeed.getBars(
				symbol,
				"60" as ResolutionString,
				{ countBack: 1, firstDataRequest: true, from: fromSeconds, to: toSeconds },
				(result) => resolve(result),
				reject,
			);
		});

		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(1);
		expect(bars.map((bar) => bar.time)).toEqual([insideTime]);
		getCandleStore().getState().clearLastBar("EDGE:60");
		datafeed.destroy();
	});

	it("maps a rate limited history request to a friendly error and gates the next request", async () => {
		const rateLimitError = Object.assign(new Error("429 Too Many Requests"), {
			response: { status: 429, headers: { get: () => null } },
		});
		infoClient.candleSnapshot.mockRejectedValueOnce(rateLimitError);
		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "LIMITED"
					? { name: "LIMITED-USDC", ticker: "LIMITED", description: "LIMITED-USDC", pricescale: 100 }
					: undefined,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "LIMITED");
		vi.useFakeTimers();
		const onResult = vi.fn();
		const onError = vi.fn();

		datafeed.getBars(
			symbol,
			"60" as ResolutionString,
			{ countBack: 1, firstDataRequest: true, from: 1, to: 2 },
			onResult,
			onError,
		);
		await vi.advanceTimersByTimeAsync(1);

		expect(onError).toHaveBeenCalledWith("Chart data is temporarily rate limited");
		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(1);

		datafeed.getBars(
			symbol,
			"60" as ResolutionString,
			{ countBack: 1, firstDataRequest: true, from: 1, to: 2 },
			onResult,
			onError,
		);
		await vi.advanceTimersByTimeAsync(1);

		expect(onError).toHaveBeenCalledTimes(2);
		expect(onError).toHaveBeenLastCalledWith("Chart data is temporarily rate limited");
		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(1);
		expect(onResult).not.toHaveBeenCalled();
		datafeed.destroy();
	});

	it("reports a non-rate-limited history failure to the recovery callback", async () => {
		const historyError = new Error("network down");
		infoClient.candleSnapshot.mockRejectedValueOnce(historyError);
		const onHistoryError = vi.fn();
		const onHistorySuccess = vi.fn();
		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "RECOVERY"
					? { name: "RECOVERY-USDC", ticker: "RECOVERY", description: "RECOVERY-USDC", pricescale: 100 }
					: undefined,
			onHistoryError,
			onHistorySuccess,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "RECOVERY");
		vi.useFakeTimers();
		const onError = vi.fn();

		datafeed.getBars(
			symbol,
			"60" as ResolutionString,
			{ countBack: 1, firstDataRequest: true, from: 1, to: 2 },
			vi.fn(),
			onError,
		);
		await vi.advanceTimersByTimeAsync(1);

		expect(onHistoryError).toHaveBeenCalledOnce();
		expect(onHistoryError).toHaveBeenCalledWith(historyError);
		expect(onHistorySuccess).not.toHaveBeenCalled();
		expect(onError).toHaveBeenCalledWith("network down");
		datafeed.destroy();
	});

	it("joins concurrent identical history requests into one HTTP request", async () => {
		const fromSeconds = Date.UTC(2026, 5, 27) / 1000;
		const toSeconds = Date.UTC(2026, 5, 28) / 1000;
		const barTime = fromSeconds * 1000;
		let resolveSnapshot: ((value: unknown[]) => void) | undefined;
		infoClient.candleSnapshot.mockImplementationOnce(
			() =>
				new Promise<unknown[]>((resolve) => {
					resolveSnapshot = resolve;
				}),
		);
		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "SHARED"
					? { name: "SHARED-USDC", ticker: "SHARED", description: "SHARED-USDC", pricescale: 100 }
					: undefined,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "SHARED");
		vi.useFakeTimers({ now: Date.UTC(2026, 5, 28) });
		const firstResult = vi.fn();
		const secondResult = vi.fn();
		const periodParams = { countBack: 1, firstDataRequest: true, from: fromSeconds, to: toSeconds };

		datafeed.getBars(symbol, "60" as ResolutionString, periodParams, firstResult, vi.fn());
		datafeed.getBars(symbol, "60" as ResolutionString, periodParams, secondResult, vi.fn());
		await vi.advanceTimersByTimeAsync(1);

		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(1);

		resolveSnapshot?.([
			{ T: barTime + 3_599_999, c: "20", h: "20", i: "1h", l: "20", n: 1, o: "20", s: "SHARED", t: barTime, v: "1" },
		]);
		await vi.advanceTimersByTimeAsync(1);

		expect(firstResult).toHaveBeenCalledTimes(1);
		expect(secondResult).toHaveBeenCalledTimes(1);
		expect(firstResult.mock.calls[0]?.[0]).not.toBe(secondResult.mock.calls[0]?.[0]);
		getCandleStore().getState().clearLastBar("SHARED:60");
		datafeed.destroy();
	});
});
