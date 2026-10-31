import type { UserFillsResponse, UserTwapSliceFillsResponse } from "@nktkas/hyperliquid";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UnifiedMarket } from "@/lib/hyperliquid";
import { MalformedHistoryPageError, waitForHistoryRetry } from "@/lib/trade/history-pagination";
import { getItemWeightedInfoRequestWeight, INFO_REST_WEIGHT_LIMIT_PER_MINUTE } from "@/lib/trade/info-weight-pacer";
import {
	clearTwapSliceFillsExportPacersForTests,
	createTwapSliceFillsExportPacer,
	fetchUserTwapSliceFillHistory,
	filterNonTwapUserFills,
	getTwapSliceFillsExportPacer,
	getUserFillNetClosedPnl,
	getUserFillNotional,
	hasUserFillExplorerTransaction,
	isValidUserFillHistoryItem,
	isValidUserTwapSliceFillHistoryItem,
	mergeUserFillSources,
	normalizeUserTwapSliceFills,
	TWAP_SLICE_FILLS_EXPORT_LIMIT,
	TWAP_SLICE_FILLS_EXPORT_WEIGHT_PER_MINUTE,
} from "@/lib/trade/user-fills";

type UserFill = UserFillsResponse[number];
type TwapSliceFill = UserTwapSliceFillsResponse[number];

function createFill(overrides: Partial<UserFill> = {}): UserFill {
	return {
		closedPnl: "0.0",
		coin: "BTC",
		crossed: true,
		dir: "Open Long",
		fee: "0.01",
		feeToken: "USDC",
		hash: "0x0000000000000000000000000000000000000000000000000000000000000000",
		oid: 42,
		px: "63000",
		side: "B",
		startPosition: "0.0",
		sz: "0.01",
		tid: 100,
		time: 1000,
		twapId: null,
		...overrides,
	};
}

describe("mergeUserFillSources", () => {
	it("merges REST history with realtime fills and sorts newest first", () => {
		const older = createFill();
		const newer = createFill({ oid: 43, tid: 101, time: 2000 });

		expect(mergeUserFillSources([older], [newer])).toEqual([newer, older]);
	});

	it("deduplicates the same fill across REST and WebSocket snapshots", () => {
		const restFill = createFill();
		const realtimeFill = createFill({ fee: "0.02" });

		expect(mergeUserFillSources([restFill], [realtimeFill])).toEqual([realtimeFill]);
	});

	it("handles unavailable sources without fabricating fills", () => {
		expect(mergeUserFillSources(undefined, undefined)).toEqual([]);
	});

	it("keeps only fills that are not associated with a TWAP", () => {
		const ordinaryFill = createFill();
		const zeroIdTwapFill = createFill({ oid: 43, tid: 101, twapId: 0 });
		const twapFill = createFill({ oid: 44, tid: 102, twapId: 7 });

		expect(filterNonTwapUserFills([ordinaryFill, zeroIdTwapFill, twapFill])).toEqual([ordinaryFill]);
	});

	it("validates the documented TWAP ID shape on user fills", () => {
		expect(isValidUserFillHistoryItem(createFill())).toBe(true);
		expect(isValidUserFillHistoryItem(createFill({ twapId: 0 }))).toBe(true);
		expect(isValidUserFillHistoryItem(createFill({ twapId: Number.NaN }))).toBe(false);
		expect(isValidUserFillHistoryItem({ ...createFill(), twapId: undefined })).toBe(false);
	});

	it("validates optional liquidation details before they drive display state", () => {
		expect(
			isValidUserFillHistoryItem(
				createFill({
					liquidation: {
						liquidatedUser: "0x1111111111111111111111111111111111111111",
						markPx: "62000.5",
						method: "backstop",
					},
				}),
			),
		).toBe(true);

		for (const liquidation of [
			"liquidated",
			{ markPx: "invalid", method: "market" },
			{ markPx: "62000", method: "unknown" },
			{ liquidatedUser: "0x1234", markPx: "62000", method: "market" },
		]) {
			expect(isValidUserFillHistoryItem({ ...createFill(), liquidation })).toBe(false);
		}
	});

	it("normalizes TWAP slice fills without losing their parent ID", () => {
		const entry: UserTwapSliceFillsResponse[number] = { fill: createFill(), twapId: 7 };

		expect(isValidUserTwapSliceFillHistoryItem(entry)).toBe(true);
		expect(normalizeUserTwapSliceFills([entry])).toEqual([{ ...entry.fill, twapId: 7 }]);
	});

	it("does not create explorer links for the documented zero TWAP transaction hash", () => {
		expect(hasUserFillExplorerTransaction(createFill())).toBe(false);
		expect(hasUserFillExplorerTransaction(createFill({ hash: `0x${"1".repeat(64)}` }))).toBe(true);
	});

	it("computes slice fill notional with decimal arithmetic", () => {
		expect(getUserFillNotional(createFill({ px: "0.1000000000000000001", sz: "3" }))).toBe("0.3000000000000000003");
		expect(getUserFillNotional(createFill({ px: "invalid" }))).toBeNull();
	});
});

function createSliceFill(index: number, time: number, twapId = 7): TwapSliceFill {
	return { fill: createFill({ oid: index, tid: index, time }), twapId };
}

function serveAscendingPages(entries: readonly TwapSliceFill[], pageSize: number) {
	return vi.fn(async (startTime: number, endTime: number, _signal: AbortSignal) =>
		entries.filter((entry) => entry.fill.time >= startTime && entry.fill.time <= endTime).slice(0, pageSize),
	);
}

function createPacingClock() {
	let time = 0;
	const waits: number[] = [];
	return {
		now: () => time,
		wait: async (delayMs: number, _signal: AbortSignal) => {
			waits.push(delayMs);
			time += delayMs;
		},
		waits,
	};
}

describe("fetchUserTwapSliceFillHistory", () => {
	const endTime = 1_000_000;

	it("walks inclusive ascending pages and deduplicates the overlap by fill identity", async () => {
		const entries = Array.from({ length: 3_688 }, (_, index) =>
			createSliceFill(index + 1, 1_000 + Math.floor((index + 1) / 2)),
		);
		const fetchPage = serveAscendingPages(entries, 2_000);

		const result = await fetchUserTwapSliceFillHistory(fetchPage, {
			endTime,
			pacer: createTwapSliceFillsExportPacer(),
			signal: new AbortController().signal,
		});

		expect(fetchPage.mock.calls.map(([startTime, pageEndTime]) => [startTime, pageEndTime])).toEqual([
			[0, endTime],
			[2_000, endTime],
			[2_844, endTime],
		]);
		expect(result.truncated).toBe(false);
		expect(result.items).toHaveLength(3_688);
		expect(result.items.map((fill) => fill.tid)).toEqual(entries.map((entry) => entry.fill.tid));
		expect(result.items.every((fill, index, fills) => index === 0 || (fills[index - 1]?.time ?? 0) <= fill.time)).toBe(
			true,
		);
	});

	it("keeps paging through pages shorter than the observed 2000-row size", async () => {
		const entries = Array.from({ length: 1_200 }, (_, index) => createSliceFill(index + 1, index + 1));
		const fetchPage = serveAscendingPages(entries, 500);

		const result = await fetchUserTwapSliceFillHistory(fetchPage, {
			endTime,
			pacer: createTwapSliceFillsExportPacer(),
			signal: new AbortController().signal,
		});

		expect(fetchPage.mock.calls.map(([startTime]) => startTime)).toEqual([0, 500, 999, 1_200]);
		expect(result.items).toHaveLength(1_200);
		expect(result.truncated).toBe(false);
	});

	it("returns a complete empty history for an empty first page", async () => {
		const fetchPage = serveAscendingPages([], 2_000);

		await expect(
			fetchUserTwapSliceFillHistory(fetchPage, {
				endTime,
				pacer: createTwapSliceFillsExportPacer(),
				signal: new AbortController().signal,
			}),
		).resolves.toEqual({ items: [], truncated: false });
		expect(fetchPage).toHaveBeenCalledTimes(1);
	});

	it("takes the TWAP ID from the entry even when the nested fill has none", async () => {
		const entry: TwapSliceFill = { fill: createFill({ twapId: null }), twapId: 0 };
		const fetchPage = serveAscendingPages([entry], 2_000);

		const result = await fetchUserTwapSliceFillHistory(fetchPage, {
			endTime,
			pacer: createTwapSliceFillsExportPacer(),
			signal: new AbortController().signal,
		});

		expect(result.items).toEqual([{ ...entry.fill, twapId: 0 }]);
	});

	it.each([
		["a descending page", [createSliceFill(1, 2_000), createSliceFill(2, 1_000)]],
		["an entry without a TWAP ID", [{ fill: createFill() } as unknown as TwapSliceFill]],
		["an entry with an invalid fill", [{ fill: createFill({ px: "invalid" }), twapId: 7 }]],
		["a fill after the requested end time", [createSliceFill(1, endTime + 1)]],
	])("fails closed on %s", async (_label, page) => {
		const fetchPage = vi.fn(async (startTime: number) => (startTime === 0 ? page : []));

		await expect(
			fetchUserTwapSliceFillHistory(fetchPage, {
				endTime,
				pacer: createTwapSliceFillsExportPacer(),
				signal: new AbortController().signal,
			}),
		).rejects.toBeInstanceOf(MalformedHistoryPageError);
	});

	it("fails closed when a later page returns fills older than its start time", async () => {
		const firstPage = [createSliceFill(1, 1_000), createSliceFill(2, 2_000)];
		const fetchPage = vi.fn(async (startTime: number) => (startTime === 0 ? firstPage : [createSliceFill(3, 1_500)]));

		await expect(
			fetchUserTwapSliceFillHistory(fetchPage, {
				endTime,
				pacer: createTwapSliceFillsExportPacer(),
				signal: new AbortController().signal,
			}),
		).rejects.toBeInstanceOf(MalformedHistoryPageError);
	});

	it("keeps only the latest fills in ascending order and reports the retention limit", async () => {
		const entries = Array.from({ length: 12_001 }, (_, index) => createSliceFill(index + 1, index + 1));
		const fetchPage = serveAscendingPages(entries, 2_000);

		const result = await fetchUserTwapSliceFillHistory(fetchPage, {
			endTime,
			pacer: createTwapSliceFillsExportPacer(createPacingClock()),
			signal: new AbortController().signal,
		});

		expect(result.truncated).toBe(true);
		expect(result.items).toHaveLength(TWAP_SLICE_FILLS_EXPORT_LIMIT);
		expect(result.items[0]?.tid).toBe(2_002);
		expect(result.items.at(-1)?.tid).toBe(12_001);
	});

	it("reports truncation when the page budget ends before the history does", async () => {
		const entries = Array.from({ length: 30 }, (_, index) => createSliceFill(index + 1, index + 1));
		const fetchPage = serveAscendingPages(entries, 10);

		const result = await fetchUserTwapSliceFillHistory(fetchPage, {
			endTime,
			maxPages: 2,
			pacer: createTwapSliceFillsExportPacer(),
			signal: new AbortController().signal,
		});

		expect(fetchPage).toHaveBeenCalledTimes(2);
		expect(result.truncated).toBe(true);
		expect(result.items).toHaveLength(19);
	});

	it("paces full pages so no minute spends more than the export's share of the REST weight budget", async () => {
		const clock = createPacingClock();
		const entries = Array.from({ length: 30_000 }, (_, index) => createSliceFill(index + 1, index + 1));
		const requests: { time: number; weight: number }[] = [];
		const fetchPage = vi.fn(async (startTime: number, pageEndTime: number, _signal: AbortSignal) => {
			const page = entries
				.filter((entry) => entry.fill.time >= startTime && entry.fill.time <= pageEndTime)
				.slice(0, 2_000);
			requests.push({ time: clock.now(), weight: getItemWeightedInfoRequestWeight(page.length) });
			return page;
		});

		const result = await fetchUserTwapSliceFillHistory(fetchPage, {
			endTime: 40_000,
			pacer: createTwapSliceFillsExportPacer(clock),
			signal: new AbortController().signal,
		});

		expect(TWAP_SLICE_FILLS_EXPORT_WEIGHT_PER_MINUTE).toBeLessThan(INFO_REST_WEIGHT_LIMIT_PER_MINUTE);
		for (const request of requests) {
			const windowWeight = requests
				.filter((other) => other.time > request.time - 60_000 && other.time <= request.time)
				.reduce((sum, other) => sum + other.weight, 0);
			expect(windowWeight).toBeLessThanOrEqual(TWAP_SLICE_FILLS_EXPORT_WEIGHT_PER_MINUTE);
		}
		expect(requests.map((request) => request.time)).toEqual([
			...Array.from({ length: 6 }, () => 0),
			...Array.from({ length: 6 }, () => 60_000),
			...Array.from({ length: 5 }, () => 120_000),
		]);
		expect(clock.waits).toEqual([60_000, 60_000]);
		expect(result.truncated).toBe(true);
		expect(result.items).toHaveLength(TWAP_SLICE_FILLS_EXPORT_LIMIT);
		expect(result.items[0]?.tid).toBe(20_001);
		expect(result.items.at(-1)?.tid).toBe(30_000);
	});

	it("does not wait between pages while a small history fits the budget", async () => {
		const clock = createPacingClock();
		const entries = Array.from({ length: 3_688 }, (_, index) => createSliceFill(index + 1, index + 1));

		await fetchUserTwapSliceFillHistory(serveAscendingPages(entries, 2_000), {
			endTime,
			pacer: createTwapSliceFillsExportPacer(clock),
			signal: new AbortController().signal,
		});

		expect(clock.waits).toEqual([]);
	});

	it("abandons a paced wait without requesting the next page once the export is aborted", async () => {
		const controller = new AbortController();
		const entries = Array.from({ length: 12_001 }, (_, index) => createSliceFill(index + 1, index + 1));
		const fetchPage = serveAscendingPages(entries, 2_000);
		const wait = vi.fn((delayMs: number, signal: AbortSignal) => {
			controller.abort();
			return waitForHistoryRetry(delayMs, signal);
		});

		await expect(
			fetchUserTwapSliceFillHistory(fetchPage, {
				endTime,
				pacer: createTwapSliceFillsExportPacer({ now: () => 0, wait }),
				signal: controller.signal,
			}),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(wait).toHaveBeenCalledTimes(1);
		expect(fetchPage).toHaveBeenCalledTimes(6);
	});

	it("stops before the next page once the export is aborted", async () => {
		const controller = new AbortController();
		const entries = Array.from({ length: 30 }, (_, index) => createSliceFill(index + 1, index + 1));
		const fetchPage = vi.fn(async (startTime: number) => {
			controller.abort();
			return entries.filter((entry) => entry.fill.time >= startTime).slice(0, 10);
		});

		await expect(
			fetchUserTwapSliceFillHistory(fetchPage, {
				endTime,
				pacer: createTwapSliceFillsExportPacer(),
				signal: controller.signal,
			}),
		).rejects.toMatchObject({
			name: "AbortError",
		});
		expect(fetchPage).toHaveBeenCalledTimes(1);
	});

	it("keeps an aborted export's weight in its pacer, so the next export waits before its first request", async () => {
		const clock = createPacingClock();
		const firstRun = new AbortController();
		const pacer = createTwapSliceFillsExportPacer({
			now: clock.now,
			wait: (delayMs, signal) => {
				if (firstRun.signal.aborted) return clock.wait(delayMs, signal);
				firstRun.abort();
				return waitForHistoryRetry(delayMs, signal);
			},
		});
		const entries = Array.from({ length: 12_001 }, (_, index) => createSliceFill(index + 1, index + 1));
		const requests: { time: number; weight: number }[] = [];
		const fetchPage = vi.fn(async (startTime: number, pageEndTime: number, _signal: AbortSignal) => {
			const page = entries
				.filter((entry) => entry.fill.time >= startTime && entry.fill.time <= pageEndTime)
				.slice(0, 2_000);
			requests.push({ time: clock.now(), weight: getItemWeightedInfoRequestWeight(page.length) });
			return page;
		});

		await expect(
			fetchUserTwapSliceFillHistory(fetchPage, { endTime, pacer, signal: firstRun.signal }),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(requests.map((request) => request.time)).toEqual(Array.from({ length: 6 }, () => 0));

		const result = await fetchUserTwapSliceFillHistory(fetchPage, {
			endTime,
			pacer,
			signal: new AbortController().signal,
		});

		expect(clock.waits).toEqual([60_000, 60_000]);
		expect(requests.slice(6).map((request) => request.time)).toEqual([
			...Array.from({ length: 6 }, () => 60_000),
			120_000,
			120_000,
		]);
		for (const request of requests) {
			const windowWeight = requests
				.filter((other) => other.time > request.time - 60_000 && other.time <= request.time)
				.reduce((sum, other) => sum + other.weight, 0);
			expect(windowWeight).toBeLessThanOrEqual(TWAP_SLICE_FILLS_EXPORT_WEIGHT_PER_MINUTE);
		}
		expect(result.items).toHaveLength(TWAP_SLICE_FILLS_EXPORT_LIMIT);
	});

	it("paces and records every attempt, counting one that returns no page at the full-page reserve", async () => {
		const pacer = { acquire: vi.fn(async (_signal: AbortSignal) => {}), record: vi.fn((_weight: number) => {}) };
		const rateLimited = Object.assign(new Error("rate limited"), {
			response: { headers: { get: () => "0" }, status: 429 },
		});
		const fetchPage = vi
			.fn()
			.mockRejectedValueOnce(rateLimited)
			.mockResolvedValueOnce([createSliceFill(1, 1_000)])
			.mockResolvedValue([]);

		const result = await fetchUserTwapSliceFillHistory(fetchPage, {
			endTime,
			pacer,
			signal: new AbortController().signal,
		});

		expect(result.items).toHaveLength(1);
		expect(fetchPage).toHaveBeenCalledTimes(3);
		expect(pacer.acquire).toHaveBeenCalledTimes(3);
		expect(pacer.record.mock.calls).toEqual([[120], [21], [20]]);
	});

	it("records an attempt aborted in flight at the full-page reserve", async () => {
		const pacer = { acquire: vi.fn(async (_signal: AbortSignal) => {}), record: vi.fn((_weight: number) => {}) };
		const controller = new AbortController();
		const fetchPage = vi.fn(
			(_startTime: number, _endTime: number, signal: AbortSignal) =>
				new Promise<UserTwapSliceFillsResponse>((_resolve, reject) => {
					signal.addEventListener("abort", () => reject(signal.reason), { once: true });
					controller.abort();
				}),
		);

		await expect(
			fetchUserTwapSliceFillHistory(fetchPage, { endTime, pacer, signal: controller.signal }),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(pacer.record.mock.calls).toEqual([[120]]);
	});
});

describe("getTwapSliceFillsExportPacer", () => {
	afterEach(() => {
		clearTwapSliceFillsExportPacersForTests();
	});

	it("shares one export pacer per network for the life of the tab", () => {
		const mainnetPacer = getTwapSliceFillsExportPacer("mainnet");

		expect(getTwapSliceFillsExportPacer("mainnet")).toBe(mainnetPacer);
		expect(getTwapSliceFillsExportPacer("testnet")).not.toBe(mainnetPacer);
	});
});

describe("getUserFillNetClosedPnl", () => {
	const perp = { kind: "perp" } as UnifiedMarket;
	const spot = { kind: "spot", tokensInfo: [{ name: "HYPE" }, { name: "USDC" }] } as unknown as UnifiedMarket;
	const hip3 = { kind: "builderPerp", quoteToken: { name: "USDT0" } } as unknown as UnifiedMarket;
	function fill(overrides: Partial<Record<"closedPnl" | "coin" | "fee" | "feeToken" | "px", string>> = {}) {
		return { closedPnl: "0", coin: "BTC", fee: "0", feeToken: "USDC", px: "100", ...overrides };
	}

	it("subtracts the fee in the quote token, and a base-token fee at the fill price, as the official terminal does", () => {
		expect(getUserFillNetClosedPnl(fill({ closedPnl: "10", fee: "0.5" }), perp)).toBe("9.5");
		expect(getUserFillNetClosedPnl(fill({ closedPnl: "0", fee: "0.01" }), perp)).toBe("-0.01");
		expect(getUserFillNetClosedPnl(fill({ coin: "@107", fee: "0.1", feeToken: "HYPE", px: "30" }), spot)).toBe("-3");
		expect(getUserFillNetClosedPnl(fill({ coin: "@107", closedPnl: "5", fee: "0.2", px: "30" }), spot)).toBe("4.8");
		expect(getUserFillNetClosedPnl(fill({ coin: "xyz:ORCL", closedPnl: "3", fee: "1", feeToken: "USDT0" }), hip3)).toBe(
			"2",
		);
		expect(
			getUserFillNetClosedPnl(fill({ coin: "#10", closedPnl: "1", fee: "0.25", feeToken: "+10" }), undefined),
		).toBe("0.75");
	});

	it("keeps a fee-free result, treats an unlisted main-DEX perpetual as USDC and leaves the rest empty", () => {
		expect(getUserFillNetClosedPnl(fill({ coin: "xyz:ORCL", closedPnl: "7" }), undefined)).toBe("7");
		expect(getUserFillNetClosedPnl(fill({ closedPnl: "3", fee: "1" }), undefined)).toBe("2");
		expect(getUserFillNetClosedPnl(fill({ closedPnl: "0.5", fee: "0.5" }), perp)).toBeNull();
		expect(getUserFillNetClosedPnl(fill({ coin: "xyz:ORCL", closedPnl: "3", fee: "1" }), undefined)).toBeNull();
		expect(getUserFillNetClosedPnl(fill({ coin: "@107", closedPnl: "3", fee: "1" }), undefined)).toBeNull();
		expect(getUserFillNetClosedPnl(fill({ coin: "PURR/USDC", closedPnl: "3", fee: "1" }), undefined)).toBeNull();
		expect(getUserFillNetClosedPnl(fill({ closedPnl: "x", fee: "1" }), perp)).toBeNull();
	});

	it("adds a rebate, converts a base-token rebate at the fill price and keeps every digit", () => {
		expect(getUserFillNetClosedPnl(fill({ closedPnl: "0", fee: "-0.01" }), perp)).toBe("0.01");
		expect(getUserFillNetClosedPnl(fill({ coin: "@107", fee: "-0.1", feeToken: "HYPE", px: "30" }), spot)).toBe("3");
		expect(getUserFillNetClosedPnl(fill({ closedPnl: "123456789012.123456", fee: "0.000001" }), perp)).toBe(
			"123456789012.123455",
		);
	});
});
