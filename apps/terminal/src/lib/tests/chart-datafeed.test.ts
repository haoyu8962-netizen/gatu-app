import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatafeed } from "@/components/trade/chart/datafeed";
import { getChartMarketKeys, getChartMarketLookupKey, getChartSymbolInfo } from "@/lib/chart/market-symbol";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import type { LibrarySymbolInfo, ResolutionString } from "@/types/charting_library";

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
		const dayMs = 24 * 60 * 60 * 1000;
		const olderBarTime = Date.UTC(2026, 4, 25, 14);
		const previousBarTime = Date.UTC(2026, 4, 26, 14);
		const recentFromSeconds = Date.UTC(2026, 5, 27) / 1000;
		const recentToSeconds = Date.UTC(2026, 5, 28) / 1000;
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
		const result = await new Promise<{
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
				startTime: recentFromSeconds * 1000 - 180 * dayMs,
				endTime: recentFromSeconds * 1000,
			}),
		);
		expect(result.bars).toEqual([expect.objectContaining({ close: 2110.1, time: previousBarTime })]);
		expect(result.meta).toEqual({ noData: false });

		vi.useRealTimers();
	});

	it("does not backfill old historical gaps with unrelated earlier bars", async () => {
		const oldFromSeconds = Date.UTC(2026, 4, 1) / 1000;
		const oldToSeconds = Date.UTC(2026, 4, 2) / 1000;
		infoClient.candleSnapshot.mockResolvedValueOnce([]);

		const datafeed = createDatafeed({
			getSymbolInfo: (_symbolName, coin) =>
				coin === "@235" ? { name: "ETH/USDH", ticker: "@235", description: "ETH/USDH", pricescale: 100 } : undefined,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "@235");
		vi.useFakeTimers({ now: Date.UTC(2026, 5, 28) });
		const result = await new Promise<{
			bars: { close: number; time: number }[];
			meta: { noData?: boolean } | undefined;
		}>((resolve, reject) => {
			datafeed.getBars(
				symbol,
				"60" as ResolutionString,
				{ countBack: 100, firstDataRequest: true, from: oldFromSeconds, to: oldToSeconds },
				(bars, meta) => resolve({ bars, meta }),
				reject,
			);
		});

		expect(infoClient.candleSnapshot).toHaveBeenCalledTimes(1);
		expect(result.bars).toEqual([]);
		expect(result.meta).toEqual({ noData: true });

		vi.useRealTimers();
	});

	it("invalidates realtime caches before requesting a TradingView data reset", async () => {
		const onRealtimeReset = vi.fn();
		const onResetCache = vi.fn();
		const datafeed = createDatafeed({
			onRealtimeReset,
			getSymbolInfo: (_symbolName, coin) =>
				coin === "HYPE" ? { name: "HYPE-USDC", ticker: "HYPE", description: "HYPE-USDC", pricescale: 100 } : undefined,
		});
		const symbol = await resolveDatafeedSymbol(datafeed, "HYPE");
		vi.useFakeTimers();

		datafeed.subscribeBars(symbol, "60" as ResolutionString, vi.fn(), "hype-listener", onResetCache);
		await Promise.resolve();
		await Promise.resolve();

		datafeed.resetRealtimeCache();

		expect(onResetCache).toHaveBeenCalledTimes(1);
		expect(onRealtimeReset).toHaveBeenCalledTimes(1);

		datafeed.unsubscribeBars("hype-listener");
		await vi.advanceTimersByTimeAsync(5_000);
	});
});
