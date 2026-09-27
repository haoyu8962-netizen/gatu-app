import type { UserFillsResponse, UserTwapSliceFillsResponse } from "@nktkas/hyperliquid";
import { describe, expect, it, vi } from "vitest";
import { MalformedHistoryPageError } from "@/lib/trade/history-pagination";
import {
	fetchUserTwapSliceFillHistory,
	filterNonTwapUserFills,
	getUserFillNotional,
	hasUserFillExplorerTransaction,
	isValidUserFillHistoryItem,
	isValidUserTwapSliceFillHistoryItem,
	mergeUserFillSources,
	normalizeUserTwapSliceFills,
	TWAP_SLICE_FILLS_EXPORT_LIMIT,
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

describe("fetchUserTwapSliceFillHistory", () => {
	const endTime = 1_000_000;

	it("walks inclusive ascending pages and deduplicates the overlap by fill identity", async () => {
		const entries = Array.from({ length: 3_688 }, (_, index) =>
			createSliceFill(index + 1, 1_000 + Math.floor((index + 1) / 2)),
		);
		const fetchPage = serveAscendingPages(entries, 2_000);

		const result = await fetchUserTwapSliceFillHistory(fetchPage, { endTime, signal: new AbortController().signal });

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

		const result = await fetchUserTwapSliceFillHistory(fetchPage, { endTime, signal: new AbortController().signal });

		expect(fetchPage.mock.calls.map(([startTime]) => startTime)).toEqual([0, 500, 999, 1_200]);
		expect(result.items).toHaveLength(1_200);
		expect(result.truncated).toBe(false);
	});

	it("returns a complete empty history for an empty first page", async () => {
		const fetchPage = serveAscendingPages([], 2_000);

		await expect(
			fetchUserTwapSliceFillHistory(fetchPage, { endTime, signal: new AbortController().signal }),
		).resolves.toEqual({ items: [], truncated: false });
		expect(fetchPage).toHaveBeenCalledTimes(1);
	});

	it("takes the TWAP ID from the entry even when the nested fill has none", async () => {
		const entry: TwapSliceFill = { fill: createFill({ twapId: null }), twapId: 0 };
		const fetchPage = serveAscendingPages([entry], 2_000);

		const result = await fetchUserTwapSliceFillHistory(fetchPage, { endTime, signal: new AbortController().signal });

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
			fetchUserTwapSliceFillHistory(fetchPage, { endTime, signal: new AbortController().signal }),
		).rejects.toBeInstanceOf(MalformedHistoryPageError);
	});

	it("fails closed when a later page returns fills older than its start time", async () => {
		const firstPage = [createSliceFill(1, 1_000), createSliceFill(2, 2_000)];
		const fetchPage = vi.fn(async (startTime: number) => (startTime === 0 ? firstPage : [createSliceFill(3, 1_500)]));

		await expect(
			fetchUserTwapSliceFillHistory(fetchPage, { endTime, signal: new AbortController().signal }),
		).rejects.toBeInstanceOf(MalformedHistoryPageError);
	});

	it("keeps only the latest fills in ascending order and reports the retention limit", async () => {
		const entries = Array.from({ length: 12_001 }, (_, index) => createSliceFill(index + 1, index + 1));
		const fetchPage = serveAscendingPages(entries, 2_000);

		const result = await fetchUserTwapSliceFillHistory(fetchPage, { endTime, signal: new AbortController().signal });

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
			signal: new AbortController().signal,
		});

		expect(fetchPage).toHaveBeenCalledTimes(2);
		expect(result.truncated).toBe(true);
		expect(result.items).toHaveLength(19);
	});

	it("stops before the next page once the export is aborted", async () => {
		const controller = new AbortController();
		const entries = Array.from({ length: 30 }, (_, index) => createSliceFill(index + 1, index + 1));
		const fetchPage = vi.fn(async (startTime: number) => {
			controller.abort();
			return entries.filter((entry) => entry.fill.time >= startTime).slice(0, 10);
		});

		await expect(
			fetchUserTwapSliceFillHistory(fetchPage, { endTime, signal: controller.signal }),
		).rejects.toMatchObject({
			name: "AbortError",
		});
		expect(fetchPage).toHaveBeenCalledTimes(1);
	});
});
