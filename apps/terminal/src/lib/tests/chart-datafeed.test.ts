import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatafeed } from "@/components/trade/chart/datafeed";
import type { LibrarySymbolInfo, ResolutionString } from "@/types/charting_library";

const infoClient = vi.hoisted(() => ({
	allMids: vi.fn(),
	candleSnapshot: vi.fn(),
	meta: vi.fn(),
}));

vi.mock("@lingui/core/macro", () => ({
	t: (strings: TemplateStringsArray, ...values: unknown[]) =>
		strings.reduce((result, part, index) => `${result}${part}${values[index] ?? ""}`, ""),
}));

vi.mock("@/lib/hyperliquid", () => ({
	getInfoClient: () => infoClient,
}));

describe("TradingView datafeed", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		infoClient.allMids.mockResolvedValue({});
		infoClient.meta.mockResolvedValue({ universe: [] });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("uses market metadata for spot display symbols while mapping to the API ticker", async () => {
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

		const symbol = await new Promise<LibrarySymbolInfo>((resolve, reject) => {
			datafeed.resolveSymbol("ETH/USDH", resolve, reject, {});
		});

		expect(symbol.name).toBe("ETH/USDH");
		expect(symbol.ticker).toBe("@235");
		expect(symbol.description).toBe("ETH/USDH");
		expect(symbol.pricescale).toBe(100);

		const symbolFromTicker = await new Promise<LibrarySymbolInfo>((resolve, reject) => {
			datafeed.resolveSymbol("@235", resolve, reject, {});
		});

		expect(symbolFromTicker.name).toBe("ETH/USDH");
		expect(symbolFromTicker.ticker).toBe("@235");
		expect(symbolFromTicker.description).toBe("ETH/USDH");

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

	it("uses market metadata for HIP-3 display symbols while mapping to the API ticker", async () => {
		const datafeed = createDatafeed({
			getSymbolInfo: (symbolName, coin) =>
				symbolName === "xyz:KR200/USDC" || coin === "xyz:KR200"
					? {
							name: "xyz:KR200/USDC",
							ticker: "xyz:KR200",
							description: "KR200-USDC",
							pricescale: 100,
						}
					: undefined,
		});

		const symbol = await new Promise<LibrarySymbolInfo>((resolve, reject) => {
			datafeed.resolveSymbol("HYPERLIQUID:xyz:KR200/USDC", resolve, reject, {});
		});

		expect(symbol.name).toBe("xyz:KR200/USDC");
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

	it("returns older bars when the requested range is empty but older candles exist", async () => {
		vi.useFakeTimers({ now: Date.UTC(2026, 5, 28) });
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

		const datafeed = createDatafeed();
		const result = await new Promise<{
			bars: { close: number; time: number }[];
			meta: { noData?: boolean } | undefined;
		}>((resolve, reject) => {
			datafeed.getBars(
				{ name: "ETH/USDH", ticker: "@235" } as LibrarySymbolInfo,
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
		vi.useFakeTimers({ now: Date.UTC(2026, 5, 28) });
		const oldFromSeconds = Date.UTC(2026, 4, 1) / 1000;
		const oldToSeconds = Date.UTC(2026, 4, 2) / 1000;
		infoClient.candleSnapshot.mockResolvedValueOnce([]);

		const datafeed = createDatafeed();
		const result = await new Promise<{
			bars: { close: number; time: number }[];
			meta: { noData?: boolean } | undefined;
		}>((resolve, reject) => {
			datafeed.getBars(
				{ name: "ETH/USDH", ticker: "@235" } as LibrarySymbolInfo,
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
});
