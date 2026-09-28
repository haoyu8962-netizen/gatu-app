import { describe, expect, it, vi } from "vitest";
import { FUNDING_HISTORY_RANGES } from "@/domain/market/funding-rate-history";
import { IncompleteHistorySnapshotError, MalformedHistoryPageError } from "@/lib/trade/history-pagination";
import {
	fetchMarketFundingHistory,
	isValidMarketFundingRate,
	MARKET_FUNDING_HISTORY_MAX_PAGES,
	type MarketFundingRate,
} from "@/lib/trade/market-funding-history";

const HOUR_MS = 3_600_000;
const NOW = 1_790_600_000_000;

interface FundingHistoryParameters {
	coin: string;
	endTime?: number | null;
	startTime: number;
}

function row(time: number, coin = "BTC", fundingRate = "0.0000125"): MarketFundingRate {
	return { coin, fundingRate, premium: "-0.0001", time };
}

function createInfo(implementation: (params: FundingHistoryParameters) => Promise<unknown>) {
	const fundingHistory = vi.fn((params: FundingHistoryParameters, _signal?: AbortSignal) => implementation(params));
	return { fundingHistory, info: { fundingHistory } as never };
}

function hourlyRows(start: number, count: number, coin = "BTC") {
	return Array.from({ length: count }, (_, index) => row(start + index * HOUR_MS + 17, coin));
}

describe("isValidMarketFundingRate", () => {
	it.each([
		["a matching record", row(NOW), true],
		["a HIP-3 record with its dex prefix", row(NOW, "xyz:AAPL"), true],
		["another coin", row(NOW, "ETH"), false],
		["a non-decimal rate", row(NOW, "BTC", "1e-5"), false],
		["a numeric rate", { ...row(NOW), fundingRate: 0.00001 }, false],
		["a fractional timestamp", row(NOW + 0.5), false],
		["a negative timestamp", row(-1), false],
		["null", null, false],
	])("classifies %s", (_label, item, expected) => {
		const coin = (item as MarketFundingRate | null)?.coin === "xyz:AAPL" ? "xyz:AAPL" : "BTC";
		expect(isValidMarketFundingRate(item, coin)).toBe(expected);
	});
});

describe("fetchMarketFundingHistory", () => {
	it("requests the range window ending at the supplied time", async () => {
		const { fundingHistory, info } = createInfo(async () => [row(NOW - HOUR_MS)]);

		const rows = await fetchMarketFundingHistory({
			coin: "BTC",
			info,
			now: NOW,
			range: "8h",
			signal: new AbortController().signal,
		});

		expect(rows).toEqual([row(NOW - HOUR_MS)]);
		expect(fundingHistory).toHaveBeenCalledTimes(1);
		expect(fundingHistory.mock.calls[0]?.[0]).toEqual({
			coin: "BTC",
			endTime: NOW,
			startTime: NOW - FUNDING_HISTORY_RANGES["8h"].windowMs,
		});
	});

	it("continues full pages from the last timestamp and removes the inclusive overlap", async () => {
		const start = NOW - FUNDING_HISTORY_RANGES["8h"].windowMs;
		const all = hourlyRows(start, 720);
		const { fundingHistory, info } = createInfo(async ({ startTime }) =>
			all.filter((item) => item.time >= Number(startTime)).slice(0, 500),
		);

		const rows = await fetchMarketFundingHistory({
			coin: "BTC",
			info,
			now: NOW,
			range: "8h",
			signal: new AbortController().signal,
		});

		expect(rows).toHaveLength(720);
		expect(new Set(rows.map((item) => item.time)).size).toBe(720);
		expect(fundingHistory.mock.calls.map(([params]) => params.startTime)).toEqual([start, all[499]?.time]);
	});

	it("stops after a page shorter than the page limit", async () => {
		const { fundingHistory, info } = createInfo(async () => hourlyRows(NOW - 10 * HOUR_MS, 10));

		await fetchMarketFundingHistory({ coin: "BTC", info, now: NOW, range: "1h", signal: new AbortController().signal });

		expect(fundingHistory).toHaveBeenCalledTimes(1);
	});

	it("fails as incomplete when the page budget cannot cover the window", async () => {
		const { fundingHistory, info } = createInfo(async ({ startTime }) =>
			Array.from({ length: 500 }, (_, index) => row(Number(startTime) + index)),
		);

		await expect(
			fetchMarketFundingHistory({ coin: "BTC", info, now: NOW, range: "1d", signal: new AbortController().signal }),
		).rejects.toBeInstanceOf(IncompleteHistorySnapshotError);
		expect(fundingHistory).toHaveBeenCalledTimes(MARKET_FUNDING_HISTORY_MAX_PAGES);
	});

	it.each([
		["another coin", [row(NOW - HOUR_MS, "ETH")]],
		["an invalid rate", [row(NOW - HOUR_MS, "BTC", "not-a-rate")]],
		["a non-integer time", [row(NOW - HOUR_MS + 0.25)]],
		["descending records", [row(NOW - HOUR_MS), row(NOW - 2 * HOUR_MS)]],
		["a record after the requested end", [row(NOW + 1)]],
	])("rejects a page with %s", async (_label, page) => {
		const { info } = createInfo(async () => page);

		await expect(
			fetchMarketFundingHistory({ coin: "BTC", info, now: NOW, range: "1h", signal: new AbortController().signal }),
		).rejects.toBeInstanceOf(MalformedHistoryPageError);
	});

	it("accepts HIP-3 records that keep their dex prefix", async () => {
		const { fundingHistory, info } = createInfo(async () => [row(NOW - HOUR_MS, "xyz:AAPL")]);

		await expect(
			fetchMarketFundingHistory({
				coin: "xyz:AAPL",
				info,
				now: NOW,
				range: "1h",
				signal: new AbortController().signal,
			}),
		).resolves.toEqual([row(NOW - HOUR_MS, "xyz:AAPL")]);
		expect(fundingHistory.mock.calls[0]?.[0].coin).toBe("xyz:AAPL");
	});

	it("retries a rate-limited page through the injected wait", async () => {
		const rateLimited = Object.assign(new Error("rate limited"), {
			response: { headers: { get: () => "2" }, status: 429 },
		});
		let calls = 0;
		const { fundingHistory, info } = createInfo(async () => {
			calls += 1;
			if (calls === 1) throw rateLimited;
			return [row(NOW - HOUR_MS)];
		});
		const wait = vi.fn(async () => undefined);
		const controller = new AbortController();

		await expect(
			fetchMarketFundingHistory({ coin: "BTC", info, now: NOW, range: "1h", signal: controller.signal, wait }),
		).resolves.toHaveLength(1);
		expect(fundingHistory).toHaveBeenCalledTimes(2);
		expect(wait).toHaveBeenCalledWith(2_000, controller.signal);
	});

	it("stops paging once the query is aborted", async () => {
		const controller = new AbortController();
		const { fundingHistory, info } = createInfo(async ({ startTime }) => {
			controller.abort();
			return Array.from({ length: 500 }, (_, index) => row(Number(startTime) + index * HOUR_MS));
		});

		await expect(
			fetchMarketFundingHistory({ coin: "BTC", info, now: NOW, range: "8h", signal: controller.signal }),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(fundingHistory).toHaveBeenCalledTimes(1);
	});
});
