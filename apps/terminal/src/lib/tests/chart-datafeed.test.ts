import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import type { CandleWsEvent } from "@nktkas/hyperliquid";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatafeed } from "@/components/trade/chart/datafeed";
import { CHART_HISTORY_REQUEST_TIMEOUT_MS } from "@/config/time";
import { CANDLE_GATE_BACKOFF_MS, resetCandleGates } from "@/lib/chart/candle-gate";
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

function messageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

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
		i18n.loadAndActivate({ locale: "en", messages: {} });
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
		expect(symbol).not.toHaveProperty("variable_tick_size");

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

	it("passes the market's price format to TradingView", async () => {
		const market = {
			kind: "perp",
			name: "HYPE",
			pairName: "HYPE-USDC",
			szDecimals: 2,
			markPx: "90.0865",
		} as UnifiedMarketInfo;
		const datafeed = createDatafeed({ getSymbolInfo: getMarketSymbolResolver(market) });

		const symbol = await resolveDatafeedSymbol(datafeed, "HYPE");

		expect(symbol).toMatchObject({
			ticker: "HYPE",
			minmov: 1,
			pricescale: 1000,
			variable_tick_size: "0.0001 9.9999 0.001 99.999 0.01 999.99 0.1 9999.9 1",
		});
		expect(infoClient.meta).not.toHaveBeenCalled();
		expect(infoClient.allMids).not.toHaveBeenCalled();
	});

	it.each(["118234", "118234.0", "118234.5"])(
		"derives a listed perp's price format from its metadata when the mid is %s",
		async (mid) => {
			vi.resetModules();
			const { createDatafeed: createIsolatedDatafeed } = await import("@/components/trade/chart/datafeed");
			infoClient.meta.mockResolvedValue({ universe: [{ name: "BTC", szDecimals: 5, maxLeverage: 40 }] });
			infoClient.allMids.mockResolvedValue({ BTC: mid });

			const symbol = await resolveDatafeedSymbol(createIsolatedDatafeed(), "BTC");

			expect(symbol).toMatchObject({ ticker: "BTC", pricescale: 1, variable_tick_size: "0.1 9999.9 1" });
		},
	);

	it("uses a listed perp's finest tick as the scale when mids are unavailable", async () => {
		vi.resetModules();
		const { createDatafeed: createIsolatedDatafeed } = await import("@/components/trade/chart/datafeed");
		infoClient.meta.mockResolvedValue({ universe: [{ name: "HYPE", szDecimals: 2, maxLeverage: 10 }] });
		infoClient.allMids.mockRejectedValue(new Error("mids unavailable"));

		const symbol = await resolveDatafeedSymbol(createIsolatedDatafeed(), "HYPE");

		expect(symbol).toMatchObject({
			ticker: "HYPE",
			pricescale: 10_000,
			variable_tick_size: "0.0001 9.9999 0.001 99.999 0.01 999.99 0.1 9999.9 1",
		});
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

	it("widens one request to prioritize countBack when the requested range is empty", async () => {
		const recentFromSeconds = Date.UTC(2026, 5, 27) / 1000;
		const recentToSeconds = Date.UTC(2026, 5, 28) / 1000;
		const olderBarTime = recentFromSeconds * 1_000 - 2 * 60 * 60 * 1_000;
		const previousBarTime = recentFromSeconds * 1_000 - 60 * 60 * 1_000;
		infoClient.candleSnapshot.mockResolvedValueOnce([
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
				{ countBack: 26, firstDataRequest: true, from: recentFromSeconds, to: recentToSeconds },
				(bars, meta) => resolve({ bars, meta }),
				reject,
			);
		});
		await vi.advanceTimersByTimeAsync(1);
		const result = await resultPromise;

		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(1);
		expect(infoClient.candleSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({
				coin: "@235",
				interval: "1h",
				startTime: olderBarTime,
				endTime: recentToSeconds * 1000,
			}),
		);
		expect(result.bars).toEqual([
			expect.objectContaining({ close: 2100.1, time: olderBarTime }),
			expect.objectContaining({ close: 2110.1, time: previousBarTime }),
		]);
		expect(result.meta).toEqual({ noData: false });

		vi.useRealTimers();
	});

	it("returns a deduplicated countBack window from one widened request", async () => {
		const hourMs = 60 * 60 * 1000;
		const nowMs = Date.UTC(2026, 5, 28);
		const fromMs = nowMs - 2 * hourMs;
		const oldestTime = nowMs - 4 * hourMs;
		const duplicateTime = nowMs - 3 * hourMs;
		const currentTimeA = fromMs;
		const currentTimeB = fromMs + hourMs;
		infoClient.candleSnapshot.mockResolvedValueOnce([
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

		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(1);
		expect(infoClient.candleSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({ startTime: oldestTime, endTime: nowMs }),
		);
		expect(bars.map((bar) => bar.time)).toEqual([oldestTime, duplicateTime, currentTimeA, currentTimeB]);
		expect(bars[1]?.close).toBe(11);
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

	it("uses one bounded probe to recover older bars across an empty history window", async () => {
		const oldFromSeconds = Date.UTC(2026, 4, 1) / 1000;
		const oldToSeconds = Date.UTC(2026, 4, 2) / 1000;
		const requestFromMs = oldToSeconds * 1_000 - 100 * 60 * 60 * 1_000;
		const olderBarTime = requestFromMs - 60 * 60 * 1_000;
		infoClient.candleSnapshot.mockResolvedValueOnce([]).mockResolvedValueOnce([
			{
				T: olderBarTime + 3_599_999,
				c: "20",
				h: "20",
				i: "1h",
				l: "20",
				n: 1,
				o: "20",
				s: "@235",
				t: olderBarTime,
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
				{ countBack: 100, firstDataRequest: false, from: oldFromSeconds, to: oldToSeconds },
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
				startTime: requestFromMs,
				endTime: oldToSeconds * 1_000,
			}),
		);
		expect(infoClient.candleSnapshot).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ startTime: 0, endTime: requestFromMs }),
		);
		expect(result.bars).toEqual([expect.objectContaining({ time: olderBarTime })]);
		expect(result.meta).toEqual({ noData: false });

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

	it("returns partial bars from the single countBack-prioritized request", async () => {
		const nowMs = Date.UTC(2026, 5, 28);
		const fromMs = nowMs - 2 * 60 * 60 * 1000;
		const mainBarTime = fromMs + 60 * 60 * 1000;
		infoClient.candleSnapshot.mockResolvedValueOnce([
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
		]);
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
		await vi.advanceTimersByTimeAsync(1);

		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(1);
		expect(infoClient.candleSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({
				startTime: nowMs - 10 * 60 * 60 * 1000,
				endTime: nowMs,
			}),
		);
		expect(onResult).toHaveBeenCalledWith([expect.objectContaining({ time: mainBarTime, close: 20 })], {
			noData: false,
		});
		expect(onError).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(CHART_HISTORY_REQUEST_TIMEOUT_MS);
		expect(onResult).toHaveBeenCalledTimes(1);
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

	it("isolates duplicate listener guids across datafeed replacement and teardown", async () => {
		const streamListeners = new Map<string, (event: CandleWsEvent) => void>();
		const primaryUnsubscribe = vi.fn().mockResolvedValue(undefined);
		const replacementUnsubscribe = vi.fn().mockResolvedValue(undefined);
		const subscribeStream = (params: { coin: string; interval: string }, listener: (event: CandleWsEvent) => void) => {
			streamListeners.set(params.coin, listener);
			return Promise.resolve({
				unsubscribe: params.coin === "NAMESPACE" ? primaryUnsubscribe : replacementUnsubscribe,
			});
		};
		subscriptionClient.candle.mockImplementationOnce(subscribeStream).mockImplementationOnce(subscribeStream);

		const getSymbolInfo = (_symbolName: string, coin: string) =>
			coin === "NAMESPACE" || coin === "NAMESPACE2"
				? { name: `${coin}-USDC`, ticker: coin, description: `${coin}-USDC`, pricescale: 100 }
				: undefined;
		const datafeedA = createDatafeed({ getSymbolInfo });
		const datafeedB = createDatafeed({ getSymbolInfo });
		const [primarySymbolA, primarySymbolB, replacementSymbol] = await Promise.all([
			resolveDatafeedSymbol(datafeedA, "NAMESPACE"),
			resolveDatafeedSymbol(datafeedB, "NAMESPACE"),
			resolveDatafeedSymbol(datafeedA, "NAMESPACE2"),
		]);
		const sharedGuid = "shared-listener-guid";
		const ticksA = vi.fn();
		const ticksB = vi.fn();
		const replacementTicksA = vi.fn();
		vi.useFakeTimers();

		datafeedA.subscribeBars(primarySymbolA, "60" as ResolutionString, ticksA, sharedGuid, vi.fn());
		datafeedB.subscribeBars(primarySymbolB, "60" as ResolutionString, ticksB, sharedGuid, vi.fn());
		await Promise.resolve();
		await Promise.resolve();

		expect(subscriptionClient.candle).toHaveBeenCalledTimes(1);
		expect(getCandleStore().getState().streams["NAMESPACE:1h"]?.listeners.size).toBe(2);
		streamListeners.get("NAMESPACE")?.({
			t: 60_000,
			o: "100",
			h: "105",
			l: "95",
			c: "102",
			v: "1",
		} as CandleWsEvent);
		expect(ticksA).toHaveBeenCalledOnce();
		expect(ticksB).toHaveBeenCalledOnce();

		datafeedA.subscribeBars(replacementSymbol, "60" as ResolutionString, replacementTicksA, sharedGuid, vi.fn());
		await Promise.resolve();
		await Promise.resolve();

		expect(subscriptionClient.candle).toHaveBeenCalledTimes(2);
		expect(getCandleStore().getState().streams["NAMESPACE:1h"]?.listeners.size).toBe(1);
		expect(getCandleStore().getState().streams["NAMESPACE2:1h"]?.listeners.size).toBe(1);
		streamListeners.get("NAMESPACE")?.({
			t: 120_000,
			o: "102",
			h: "106",
			l: "101",
			c: "104",
			v: "1",
		} as CandleWsEvent);
		streamListeners.get("NAMESPACE2")?.({
			t: 120_000,
			o: "20",
			h: "22",
			l: "19",
			c: "21",
			v: "2",
		} as CandleWsEvent);
		expect(ticksA).toHaveBeenCalledOnce();
		expect(ticksB).toHaveBeenCalledTimes(2);
		expect(replacementTicksA).toHaveBeenCalledOnce();

		datafeedA.destroy();
		expect(getCandleStore().getState().streams["NAMESPACE:1h"]?.listeners.size).toBe(1);
		expect(getCandleStore().getState().streams["NAMESPACE2:1h"]?.listeners.size).toBe(0);
		expect(primaryUnsubscribe).not.toHaveBeenCalled();
		expect(replacementUnsubscribe).not.toHaveBeenCalled();

		streamListeners.get("NAMESPACE")?.({
			t: 180_000,
			o: "104",
			h: "108",
			l: "103",
			c: "107",
			v: "1",
		} as CandleWsEvent);
		expect(ticksB).toHaveBeenCalledTimes(3);
		expect(replacementTicksA).toHaveBeenCalledOnce();

		await vi.advanceTimersByTimeAsync(5_000);
		expect(replacementUnsubscribe).toHaveBeenCalledOnce();
		expect(primaryUnsubscribe).not.toHaveBeenCalled();

		datafeedB.unsubscribeBars(sharedGuid);
		await vi.advanceTimersByTimeAsync(5_000);
		expect(primaryUnsubscribe).toHaveBeenCalledOnce();
		datafeedB.destroy();
		getCandleStore().getState().clearLastBar("NAMESPACE:60");
		getCandleStore().getState().clearLastBar("NAMESPACE2:60");
	});

	it("keeps duplicate listener guids isolated through shared stream recovery", async () => {
		const streamListeners: Array<(event: CandleWsEvent) => void> = [];
		const streamErrors: Array<(error: unknown) => void> = [];
		const subscribeStream = (
			_params: { coin: string; interval: string },
			listener: (event: CandleWsEvent) => void,
			options?: { onError?: (error: unknown) => void },
		) => {
			streamListeners.push(listener);
			if (options?.onError) streamErrors.push(options.onError);
			return Promise.resolve({ unsubscribe: subscriptionClient.unsubscribe });
		};
		subscriptionClient.candle
			.mockImplementationOnce(subscribeStream)
			.mockImplementationOnce(subscribeStream)
			.mockImplementationOnce(subscribeStream);

		const getSymbolInfo = (_symbolName: string, coin: string) =>
			coin === "RECOVERYNAMESPACE"
				? { name: `${coin}-USDC`, ticker: coin, description: `${coin}-USDC`, pricescale: 100 }
				: undefined;
		const resetA = vi.fn();
		const resetB = vi.fn();
		const onRealtimeResetA = vi.fn();
		const onRealtimeResetB = vi.fn();
		const datafeedA = createDatafeed({ getSymbolInfo, onRealtimeReset: onRealtimeResetA });
		const datafeedB = createDatafeed({ getSymbolInfo, onRealtimeReset: onRealtimeResetB });
		const [symbolA, symbolB] = await Promise.all([
			resolveDatafeedSymbol(datafeedA, "RECOVERYNAMESPACE"),
			resolveDatafeedSymbol(datafeedB, "RECOVERYNAMESPACE"),
		]);
		const ticksA = vi.fn();
		const ticksB = vi.fn();
		const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
		vi.useFakeTimers();

		datafeedA.subscribeBars(symbolA, "60" as ResolutionString, ticksA, "shared-recovery-guid", resetA);
		datafeedB.subscribeBars(symbolB, "60" as ResolutionString, ticksB, "shared-recovery-guid", resetB);
		await Promise.resolve();
		await Promise.resolve();

		expect(subscriptionClient.candle).toHaveBeenCalledTimes(1);
		expect(getCandleStore().getState().streams["RECOVERYNAMESPACE:1h"]?.listeners.size).toBe(2);
		streamErrors[0]?.(new Error("socket dropped"));
		await vi.advanceTimersByTimeAsync(250);
		await Promise.resolve();
		await Promise.resolve();

		expect(subscriptionClient.candle).toHaveBeenCalledTimes(2);
		expect(resetA).toHaveBeenCalledOnce();
		expect(resetB).toHaveBeenCalledOnce();
		expect(onRealtimeResetA).toHaveBeenCalledOnce();
		expect(onRealtimeResetB).toHaveBeenCalledOnce();

		streamListeners[1]?.({
			t: 60_000,
			o: "100",
			h: "105",
			l: "95",
			c: "102",
			v: "1",
		} as CandleWsEvent);
		expect(ticksA).toHaveBeenCalledOnce();
		expect(ticksB).toHaveBeenCalledOnce();

		datafeedA.destroy();
		streamErrors[1]?.(new Error("socket dropped again"));
		await vi.advanceTimersByTimeAsync(250);
		await Promise.resolve();
		await Promise.resolve();

		expect(subscriptionClient.candle).toHaveBeenCalledTimes(3);
		expect(resetA).toHaveBeenCalledOnce();
		expect(resetB).toHaveBeenCalledTimes(2);
		expect(onRealtimeResetA).toHaveBeenCalledOnce();
		expect(onRealtimeResetB).toHaveBeenCalledTimes(2);

		streamListeners[2]?.({
			t: 120_000,
			o: "102",
			h: "106",
			l: "101",
			c: "104",
			v: "1",
		} as CandleWsEvent);
		expect(ticksA).toHaveBeenCalledOnce();
		expect(ticksB).toHaveBeenCalledTimes(2);

		datafeedB.destroy();
		await vi.advanceTimersByTimeAsync(5_000);
		expect(subscriptionClient.unsubscribe).toHaveBeenCalledOnce();
		getCandleStore().getState().clearLastBar("RECOVERYNAMESPACE:60");
		randomSpy.mockRestore();
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

		expect(datafeed.resetRealtimeCache("HYPE:5m")).toBe(false);
		expect(throwingReset).not.toHaveBeenCalled();
		expect(healthyReset).not.toHaveBeenCalled();
		expect(onRealtimeReset).not.toHaveBeenCalled();

		expect(datafeed.resetRealtimeCache("HYPE:1h")).toBe(true);

		expect(throwingReset).toHaveBeenCalledTimes(1);
		expect(healthyReset).toHaveBeenCalledTimes(1);
		expect(onRealtimeReset).toHaveBeenCalledTimes(1);

		datafeed.unsubscribeBars("hype-listener-a");
		datafeed.unsubscribeBars("hype-listener-b");
		await vi.advanceTimersByTimeAsync(5_000);
	});

	it("ignores stale realtime reset callbacks after the chart target changes", async () => {
		let target = { coin: "OLD", resolution: "60" as ResolutionString };
		const requestRealtimeReset = vi.fn();
		const onRealtimeReset = vi.fn();
		const oldReset = vi.fn();
		const newReset = vi.fn();
		const datafeed = createDatafeed({
			getHistoryTarget: () => target,
			requestRealtimeReset,
			onRealtimeReset,
			getSymbolInfo: (_symbolName, coin) =>
				coin === "OLD" || coin === "NEW"
					? { name: `${coin}-USDC`, ticker: coin, description: `${coin}-USDC`, pricescale: 100 }
					: undefined,
		});
		const oldSymbol = await resolveDatafeedSymbol(datafeed, "OLD");
		const newSymbol = await resolveDatafeedSymbol(datafeed, "NEW");
		vi.useFakeTimers();

		datafeed.subscribeBars(oldSymbol, "60" as ResolutionString, vi.fn(), "old-listener", oldReset);
		await Promise.resolve();
		await Promise.resolve();
		const oldRecoveryReset = getCandleStore().getState().streams["OLD:1h"]?.listeners.values().next()
			.value?.onResetCache;
		expect(oldRecoveryReset).toBeTypeOf("function");

		target = { coin: "NEW", resolution: "5" as ResolutionString };
		oldRecoveryReset?.();
		expect(datafeed.resetRealtimeCache()).toBe(false);
		expect(requestRealtimeReset).not.toHaveBeenCalled();
		expect(oldReset).not.toHaveBeenCalled();
		expect(onRealtimeReset).not.toHaveBeenCalled();

		datafeed.subscribeBars(newSymbol, "5" as ResolutionString, vi.fn(), "new-listener", newReset);
		await Promise.resolve();
		await Promise.resolve();

		expect(datafeed.resetRealtimeCache()).toBe(true);
		expect(newReset).toHaveBeenCalledOnce();
		expect(oldReset).not.toHaveBeenCalled();
		expect(onRealtimeReset).toHaveBeenCalledOnce();

		datafeed.unsubscribeBars("old-listener");
		datafeed.unsubscribeBars("new-listener");
		await vi.advanceTimersByTimeAsync(5_000);
		datafeed.destroy();
	});

	it("reports when TradingView has no realtime cache callback to reset", () => {
		const onRealtimeReset = vi.fn();
		const datafeed = createDatafeed({ onRealtimeReset });

		expect(datafeed.resetRealtimeCache()).toBe(false);
		expect(onRealtimeReset).not.toHaveBeenCalled();
		datafeed.destroy();
	});

	it("probes an empty window once and caches the confirmed history boundary", async () => {
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

		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(2);
		expect(infoClient.candleSnapshot).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ startTime: fromMs, endTime: nowMs }),
		);
		expect(infoClient.candleSnapshot).toHaveBeenNthCalledWith(
			2,
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

		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(2);
		expect(onResult).toHaveBeenLastCalledWith([], { noData: true });
		expect(onError).not.toHaveBeenCalled();
		datafeed.destroy();
	});

	it("sets noData when the empty bounded request already reaches the start of history", async () => {
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

		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(1);
		expect(infoClient.candleSnapshot).toHaveBeenCalledWith(expect.objectContaining({ startTime: 0, endTime: 60_000 }));
		expect(onResult).toHaveBeenCalledWith([], { noData: true });
	});

	it("does not claim exhaustion when a raw candle falls on the exclusive request end", async () => {
		infoClient.candleSnapshot.mockResolvedValueOnce([
			{
				T: 119_999,
				c: "20",
				h: "20",
				i: "1m",
				l: "20",
				n: 1,
				o: "20",
				s: "EMPTY",
				t: 60_000,
				v: "1",
			},
		]);
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

		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(1);
		expect(onResult).toHaveBeenCalledWith([], { noData: false });
		datafeed.destroy();
	});

	it("caps the single countBack request at Hyperliquid's 5,000-candle history limit", async () => {
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

		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(1);
		expect(infoClient.candleSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({
				startTime: nowMs - 4_999 * 60_000,
				endTime: nowMs + 60_000,
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

	it("does not move the realtime cache backward when loading older history", async () => {
		const hourMs = 60 * 60 * 1_000;
		const olderTime = Date.UTC(2026, 7, 11, 10);
		const latestTime = olderTime + 2 * hourMs;
		infoClient.candleSnapshot
			.mockResolvedValueOnce([
				{
					T: latestTime + hourMs - 1,
					c: "20",
					h: "20",
					i: "1h",
					l: "20",
					n: 1,
					o: "20",
					s: "MONOTONIC",
					t: latestTime,
					v: "1",
				},
			])
			.mockResolvedValueOnce([
				{
					T: olderTime + hourMs - 1,
					c: "10",
					h: "10",
					i: "1h",
					l: "10",
					n: 1,
					o: "10",
					s: "MONOTONIC",
					t: olderTime,
					v: "1",
				},
			]);
		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "MONOTONIC"
					? { name: "MONOTONIC-USDC", ticker: "MONOTONIC", description: "MONOTONIC-USDC", pricescale: 100 }
					: undefined,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "MONOTONIC");
		const requestBars = (fromMs: number) =>
			new Promise<void>((resolve, reject) => {
				datafeed.getBars(
					symbol,
					"60" as ResolutionString,
					{ countBack: 1, firstDataRequest: false, from: fromMs / 1_000, to: (fromMs + hourMs) / 1_000 },
					() => resolve(),
					reject,
				);
			});

		await requestBars(latestTime);
		await requestBars(olderTime);

		expect(getCandleStore().getState().getLastBar("MONOTONIC:60")).toEqual(
			expect.objectContaining({ time: latestTime, close: 20 }),
		);
		getCandleStore().getState().clearLastBar("MONOTONIC:60");
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

	it("waits for the candle gate and transparently recovers the first rate-limited history request", async () => {
		const nowMs = Date.UTC(2026, 5, 28);
		const rateLimitError = Object.assign(new Error("429 Too Many Requests"), {
			response: { status: 429, headers: { get: () => null } },
		});
		infoClient.candleSnapshot.mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce([]);
		const onHistoryError = vi.fn();
		const onHistoryRateLimit = vi.fn();
		const onHistorySuccess = vi.fn();
		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "LIMITED"
					? { name: "LIMITED-USDC", ticker: "LIMITED", description: "LIMITED-USDC", pricescale: 100 }
					: undefined,
			onHistoryError,
			onHistoryRateLimit,
			onHistorySuccess,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "LIMITED");
		vi.useFakeTimers({ now: nowMs });
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

		expect(onHistoryRateLimit).toHaveBeenCalledWith(
			expect.objectContaining({ name: "CandleRateLimitError", retryAt: nowMs + CANDLE_GATE_BACKOFF_MS[0] }),
			"LIMITED:1h",
			{
				requestId: 1,
				streamGeneration: 1,
				streamKey: "LIMITED:1h",
				targetGeneration: 0,
			},
		);
		expect(onResult).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(CANDLE_GATE_BACKOFF_MS[0]);
		await vi.advanceTimersByTimeAsync(1);

		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(2);
		expect(onHistoryRateLimit).toHaveBeenCalledTimes(1);
		expect(onHistoryError).not.toHaveBeenCalled();
		expect(onHistorySuccess).toHaveBeenCalledWith("LIMITED:1h", {
			requestId: 1,
			streamGeneration: 1,
			streamKey: "LIMITED:1h",
			targetGeneration: 0,
		});
		expect(onResult).toHaveBeenCalledTimes(1);
		expect(onError).not.toHaveBeenCalled();
		datafeed.destroy();
	});

	it("reports one terminal error when Retry-After exceeds the inline recovery budget", async () => {
		const nowMs = Date.UTC(2026, 5, 28);
		const rateLimitError = Object.assign(new Error("429 Too Many Requests"), {
			response: {
				status: 429,
				headers: { get: (name: string) => (name === "retry-after" ? "30" : null) },
			},
		});
		infoClient.candleSnapshot.mockRejectedValueOnce(rateLimitError);
		const onHistoryError = vi.fn();
		const onHistoryRateLimit = vi.fn();
		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "LONG-LIMITED"
					? {
							name: "LONG-LIMITED-USDC",
							ticker: "LONG-LIMITED",
							description: "LONG-LIMITED-USDC",
							pricescale: 100,
						}
					: undefined,
			onHistoryError,
			onHistoryRateLimit,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "LONG-LIMITED");
		vi.useFakeTimers({ now: nowMs });
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

		const identity = {
			requestId: 1,
			streamGeneration: 1,
			streamKey: "LONG-LIMITED:1h",
			targetGeneration: 0,
		};
		expect(onHistoryRateLimit).toHaveBeenCalledWith(
			expect.objectContaining({ name: "CandleRateLimitError", retryAt: nowMs + 30_000 }),
			"LONG-LIMITED:1h",
			identity,
		);
		expect(onHistoryError).toHaveBeenCalledWith(
			expect.objectContaining({ name: "CandleRateLimitError", retryAt: nowMs + 30_000 }),
			"LONG-LIMITED:1h",
			identity,
		);
		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(1);
		expect(onResult).not.toHaveBeenCalled();
		expect(onError).toHaveBeenCalledOnce();
		expect(onError).toHaveBeenCalledWith("Chart data is temporarily rate limited");
		datafeed.destroy();
	});

	it("cancels an inline rate-limit wait when the history target changes", async () => {
		const nowMs = Date.UTC(2026, 5, 28);
		const rateLimitError = Object.assign(new Error("429 Too Many Requests"), {
			response: { status: 429, headers: { get: () => null } },
		});
		infoClient.candleSnapshot.mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce([]);
		let targetGeneration = 0;
		const onHistoryError = vi.fn();
		const onHistoryRateLimit = vi.fn();
		const onHistorySuccess = vi.fn();
		const datafeed = createDatafeed({
			getHistoryTargetGeneration: () => targetGeneration,
			getSymbolInfo: (_symbolName, coin) =>
				coin === "OLD-MARKET"
					? {
							name: "OLD-MARKET-USDC",
							ticker: "OLD-MARKET",
							description: "OLD-MARKET-USDC",
							pricescale: 100,
						}
					: undefined,
			onHistoryError,
			onHistoryRateLimit,
			onHistorySuccess,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "OLD-MARKET");
		vi.useFakeTimers({ now: nowMs });
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
		expect(onHistoryRateLimit).toHaveBeenCalledOnce();

		targetGeneration += 1;
		datafeed.invalidateHistoryRequests();
		await vi.advanceTimersByTimeAsync(CANDLE_GATE_BACKOFF_MS[0] + 25_000);

		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(1);
		expect(onHistoryRateLimit).toHaveBeenCalledTimes(1);
		expect(onHistoryError).not.toHaveBeenCalled();
		expect(onHistorySuccess).not.toHaveBeenCalled();
		expect(onResult).toHaveBeenCalledOnce();
		expect(onResult).toHaveBeenCalledWith([], { noData: false });
		expect(onError).not.toHaveBeenCalled();
		datafeed.destroy();
	});

	it("settles a superseded market request without publishing its late history state", async () => {
		let resolveOldSnapshot: ((value: []) => void) | undefined;
		infoClient.candleSnapshot
			.mockImplementationOnce(
				() =>
					new Promise<[]>((resolve) => {
						resolveOldSnapshot = resolve;
					}),
			)
			.mockResolvedValueOnce([]);
		let targetGeneration = 0;
		const onHistoryError = vi.fn();
		const onHistorySuccess = vi.fn();
		const datafeed = createDatafeed({
			getHistoryTargetGeneration: () => targetGeneration,
			getSymbolInfo: (_symbolName, coin) =>
				coin === "OLD" || coin === "NEW"
					? { name: `${coin}-USDC`, ticker: coin, description: `${coin}-USDC`, pricescale: 100 }
					: undefined,
			onHistoryError,
			onHistorySuccess,
		});
		const oldSymbol = await resolveDatafeedSymbol(datafeed, "OLD");
		const newSymbol = await resolveDatafeedSymbol(datafeed, "NEW");
		vi.useFakeTimers();
		const oldResult = vi.fn();
		const oldError = vi.fn();
		const newResult = vi.fn();
		const newError = vi.fn();
		const periodParams = { countBack: 1, firstDataRequest: true, from: 1, to: 2 };

		datafeed.getBars(oldSymbol, "60" as ResolutionString, periodParams, oldResult, oldError);
		await vi.advanceTimersByTimeAsync(1);

		targetGeneration += 1;
		datafeed.invalidateHistoryRequests();
		datafeed.getBars(newSymbol, "60" as ResolutionString, periodParams, newResult, newError);
		await vi.advanceTimersByTimeAsync(1);

		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(2);
		expect(oldResult).toHaveBeenCalledOnce();
		expect(oldResult).toHaveBeenCalledWith([], { noData: false });
		expect(oldError).not.toHaveBeenCalled();
		expect(newResult).toHaveBeenCalledWith([], { noData: true });
		expect(newError).not.toHaveBeenCalled();
		expect(onHistoryError).not.toHaveBeenCalled();
		expect(onHistorySuccess).toHaveBeenCalledOnce();
		expect(onHistorySuccess).toHaveBeenCalledWith("NEW:1h", {
			requestId: 2,
			streamGeneration: 2,
			streamKey: "NEW:1h",
			targetGeneration: 1,
		});

		resolveOldSnapshot?.([]);
		await Promise.resolve();
		await vi.advanceTimersByTimeAsync(1);

		expect(oldResult).toHaveBeenCalledTimes(1);
		expect(onHistorySuccess).toHaveBeenCalledTimes(1);
		datafeed.destroy();
	});

	it("rejects old symbol and resolution requests that start after the target changes", async () => {
		const barTime = 60_000;
		infoClient.candleSnapshot.mockResolvedValueOnce([
			{
				T: barTime + 299_999,
				c: "20",
				h: "20",
				i: "5m",
				l: "20",
				n: 1,
				o: "20",
				s: "NEW",
				t: barTime,
				v: "1",
			},
		]);
		let targetGeneration = 0;
		let target = { coin: "OLD", resolution: "60" as ResolutionString };
		const onHistoryError = vi.fn();
		const onHistorySuccess = vi.fn();
		const datafeed = createDatafeed({
			getHistoryTargetGeneration: () => targetGeneration,
			getHistoryTarget: () => target,
			getSymbolInfo: (_symbolName, coin) =>
				coin === "OLD" || coin === "NEW"
					? { name: `${coin}-USDC`, ticker: coin, description: `${coin}-USDC`, pricescale: 100 }
					: undefined,
			onHistoryError,
			onHistorySuccess,
		});
		const oldSymbol = await resolveDatafeedSymbol(datafeed, "OLD");
		const newSymbol = await resolveDatafeedSymbol(datafeed, "NEW");
		vi.useFakeTimers();
		const oldSymbolResult = vi.fn();
		const oldResolutionResult = vi.fn();
		const currentResult = vi.fn();
		const periodParams = { countBack: 1, firstDataRequest: true, from: 60, to: 360 };

		targetGeneration += 1;
		target = { coin: "NEW", resolution: "5" as ResolutionString };
		datafeed.invalidateHistoryRequests();
		datafeed.getBars(oldSymbol, "60" as ResolutionString, periodParams, oldSymbolResult, vi.fn());
		datafeed.getBars(newSymbol, "60" as ResolutionString, periodParams, oldResolutionResult, vi.fn());
		datafeed.getBars(newSymbol, "5" as ResolutionString, periodParams, currentResult, vi.fn());
		await vi.advanceTimersByTimeAsync(1);

		expect(oldSymbolResult).toHaveBeenCalledWith([], { noData: false });
		expect(oldResolutionResult).toHaveBeenCalledWith([], { noData: false });
		expect(infoClient.candleSnapshot).toHaveBeenCalledOnce();
		expect(infoClient.candleSnapshot).toHaveBeenCalledWith(expect.objectContaining({ coin: "NEW", interval: "5m" }));
		expect(currentResult).toHaveBeenCalledWith([expect.objectContaining({ time: barTime })], { noData: false });
		expect(onHistoryError).not.toHaveBeenCalled();
		expect(onHistorySuccess).toHaveBeenCalledWith("NEW:5m", {
			requestId: 1,
			streamGeneration: 1,
			streamKey: "NEW:5m",
			targetGeneration: 1,
		});
		datafeed.destroy();
	});

	it("destroy cancels an inline rate-limit wait without dispatching a history callback", async () => {
		const nowMs = Date.UTC(2026, 5, 28);
		const rateLimitError = Object.assign(new Error("429 Too Many Requests"), {
			response: { status: 429, headers: { get: () => null } },
		});
		infoClient.candleSnapshot.mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce([]);
		const onHistoryError = vi.fn();
		const onHistoryRateLimit = vi.fn();
		const onHistorySuccess = vi.fn();
		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "DESTROY-LIMITED"
					? {
							name: "DESTROY-LIMITED-USDC",
							ticker: "DESTROY-LIMITED",
							description: "DESTROY-LIMITED-USDC",
							pricescale: 100,
						}
					: undefined,
			onHistoryError,
			onHistoryRateLimit,
			onHistorySuccess,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "DESTROY-LIMITED");
		vi.useFakeTimers({ now: nowMs });
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
		expect(onHistoryRateLimit).toHaveBeenCalledOnce();

		datafeed.destroy();
		await vi.advanceTimersByTimeAsync(CANDLE_GATE_BACKOFF_MS[0] + 25_000);

		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(1);
		expect(onHistoryError).not.toHaveBeenCalled();
		expect(onHistorySuccess).not.toHaveBeenCalled();
		expect(onResult).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
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
		expect(onHistoryError).toHaveBeenCalledWith(historyError, "RECOVERY:1h", {
			requestId: 1,
			streamGeneration: 1,
			streamKey: "RECOVERY:1h",
			targetGeneration: 0,
		});
		expect(onHistorySuccess).not.toHaveBeenCalled();
		expect(onError).toHaveBeenCalledWith("Chart data could not be loaded");
		datafeed.destroy();
	});

	it("never hands raw transport text to TradingView and follows the active language", async () => {
		const transportError = Object.assign(
			new Error("503 Service Unavailable - <html><body>upstream connect error</body></html>"),
			{ name: "HttpRequestError", response: { status: 503 } },
		);
		infoClient.candleSnapshot.mockRejectedValueOnce(transportError);
		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "OUTAGE"
					? { name: "OUTAGE-USDC", ticker: "OUTAGE", description: "OUTAGE-USDC", pricescale: 100 }
					: undefined,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "OUTAGE");
		i18n.loadAndActivate({
			locale: "zh",
			messages: { [messageId("Chart data could not be loaded")]: "图表数据无法加载" },
		});
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

		expect(onError).toHaveBeenCalledExactlyOnceWith("图表数据无法加载");
		datafeed.destroy();
	});

	it("reports an unexpected symbol resolution failure without its internal message", async () => {
		const datafeed = createDatafeed({
			getSymbolInfo: () => {
				throw new Error("Cannot read properties of undefined (reading 'szDecimals')");
			},
		});

		await expect(resolveDatafeedSymbol(datafeed, "HYPE")).rejects.toBe("Chart data could not be loaded");
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
