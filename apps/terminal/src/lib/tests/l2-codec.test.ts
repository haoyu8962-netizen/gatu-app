import { deflateRawSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import {
	buildL2SubscriptionPayload,
	canUseL2Decompression,
	createL2BookProcessor,
	decodeL2CompressedDelta,
	inflateL2CompressedPayload,
	type L2BookDelta,
	type L2BookSnapshot,
	type L2BookStreamError,
	mergeL2BookSide,
} from "../../../../../packages/hl-react/src/subscriptions/l2";

function compress(value: unknown): string {
	return deflateRawSync(JSON.stringify(value)).toString("base64");
}

function snapshot(coin: string, time: number, bid = "100", ask = "101"): L2BookSnapshot {
	return {
		coin,
		time,
		levels: [
			Array.from({ length: 6 }, (_, index) => ({ px: String(Number(bid) - index), sz: "1", n: 2 })),
			Array.from({ length: 6 }, (_, index) => ({ px: String(Number(ask) + index), sz: "2", n: 3 })),
		],
	};
}

function deferred<T>() {
	let resolve: (value: T) => void = () => {};
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

describe("incremental l2 subscription payload", () => {
	it("uses the private c/s/m fields and canonical omission rules", () => {
		expect(buildL2SubscriptionPayload({ coin: "BTC" })).toEqual({ type: "l2", c: "BTC" });
		expect(buildL2SubscriptionPayload({ coin: "BTC", nSigFigs: null, mantissa: null })).toEqual({
			type: "l2",
			c: "BTC",
		});
		expect(buildL2SubscriptionPayload({ coin: "BTC", nSigFigs: 4 })).toEqual({
			type: "l2",
			c: "BTC",
			s: 4,
		});
		expect(buildL2SubscriptionPayload({ coin: "xyz:UNITREE", nSigFigs: 5, mantissa: 1 })).toEqual({
			type: "l2",
			c: "xyz:UNITREE",
			s: 5,
		});
		expect(buildL2SubscriptionPayload({ coin: "BTC", nSigFigs: 5, mantissa: 2 })).toEqual({
			type: "l2",
			c: "BTC",
			s: 5,
			m: 2,
		});
	});
});

describe("incremental l2 raw-deflate codec", () => {
	it("probes the exact deflate-raw format", () => {
		expect(canUseL2Decompression()).toBe(true);
		expect(canUseL2Decompression({ DecompressionStream: undefined })).toBe(false);

		const Unsupported = class {
			constructor() {
				throw new TypeError("unsupported format");
			}
		} as unknown as typeof DecompressionStream;
		expect(canUseL2Decompression({ DecompressionStream: Unsupported })).toBe(false);
	});

	it("inflates raw deflate and parses the compact delta shape", async () => {
		const delta: L2BookDelta = {
			c: "BTC",
			t: 123,
			l: [[{ p: "100", s: "2" }], []],
			r: [[], [0]],
		};
		const compressed = compress(delta);

		expect(await inflateL2CompressedPayload(compressed)).toBe(JSON.stringify(delta));
		expect(await decodeL2CompressedDelta(compressed)).toEqual(delta);
	});

	it("bounds compressed and decompressed input independently", async () => {
		const compressed = compress({ c: "BTC", t: 1, l: [[], []], r: [[], []], padding: "x".repeat(256) });

		await expect(
			inflateL2CompressedPayload(compressed, { maximumBase64Characters: compressed.length - 1 }),
		).rejects.toMatchObject({ code: "compressed_payload_too_large" });
		await expect(inflateL2CompressedPayload(compressed, { maximumDecompressedBytes: 32 })).rejects.toMatchObject({
			code: "decompressed_payload_too_large",
		});
	});

	it("returns typed failures for invalid base64, raw deflate, and JSON", async () => {
		await expect(inflateL2CompressedPayload("not-base64")).rejects.toMatchObject({ code: "invalid_base64" });
		await expect(inflateL2CompressedPayload("AAAA")).rejects.toMatchObject({ code: "decompression_failed" });
		await expect(decodeL2CompressedDelta(deflateRawSync("not json").toString("base64"))).rejects.toMatchObject({
			code: "invalid_json",
		});
	});
});

describe("incremental l2 side merge", () => {
	it("removes indexes from the previous sorted side before applying upserts", () => {
		const levels = [
			{ px: "100", sz: "1", n: 1 },
			{ px: "99", sz: "2", n: 2 },
			{ px: "98", sz: "3", n: 3 },
		];
		const original = structuredClone(levels);

		const merged = mergeL2BookSide({
			levels,
			upserts: [
				{ p: "101", s: "4" },
				{ p: "100", s: "5" },
			],
			removedLevelIndexes: [1],
			side: "bids",
		});

		expect(merged).toEqual([
			{ px: "101", sz: "4" },
			{ px: "100", sz: "5" },
			{ px: "98", sz: "3", n: 3 },
		]);
		expect(levels).toEqual(original);
		expect(merged[2]).not.toBe(levels[2]);
	});

	it("sorts asks ascending without mutating source data", () => {
		const levels = [
			{ px: "101", sz: "1", n: 1 },
			{ px: "102", sz: "2", n: 2 },
		];

		expect(
			mergeL2BookSide({
				levels,
				upserts: [{ p: "100.5", s: "3" }],
				removedLevelIndexes: [],
				side: "asks",
			}).map((level) => level.px),
		).toEqual(["100.5", "101", "102"]);
	});

	it.each([
		{ removedLevelIndexes: [3], code: "invalid_removal_index" },
		{ removedLevelIndexes: [1, 1], code: "invalid_removal_index" },
	])("rejects invalid removal indexes", ({ removedLevelIndexes, code }) => {
		expect(() =>
			mergeL2BookSide({
				levels: [
					{ px: "100", sz: "1" },
					{ px: "99", sz: "1" },
				],
				upserts: [],
				removedLevelIndexes,
				side: "bids",
			}),
		).toThrow(expect.objectContaining({ code }));
	});

	it("accepts empty sides and rejects unsorted or over-depth sides", () => {
		expect(() =>
			mergeL2BookSide({
				levels: [
					{ px: "99", sz: "1" },
					{ px: "100", sz: "1" },
				],
				upserts: [],
				removedLevelIndexes: [],
				side: "bids",
			}),
		).toThrow(expect.objectContaining({ code: "invalid_sort_order" }));
		expect(mergeL2BookSide({ levels: [], upserts: [], removedLevelIndexes: [], side: "asks" })).toEqual([]);
		expect(() =>
			mergeL2BookSide({
				levels: Array.from({ length: 21 }, (_, index) => ({ px: String(100 + index), sz: "1" })),
				upserts: [],
				removedLevelIndexes: [],
				side: "asks",
			}),
		).toThrow(expect.objectContaining({ code: "invalid_level_count" }));
	});
});

describe("incremental l2 processor", () => {
	it("accepts a snapshot with an empty side", () => {
		const snapshots: L2BookSnapshot[] = [];
		const onFatalError = vi.fn();
		const oneSidedSnapshot = snapshot("NEW", 1);
		oneSidedSnapshot.levels[0] = [];
		const processor = createL2BookProcessor({
			coin: "NEW",
			onSnapshot: (value) => snapshots.push(value),
			onFatalError,
		});

		processor.handle({ s: oneSidedSnapshot });

		expect(snapshots).toEqual([oneSidedSnapshot]);
		expect(onFatalError).not.toHaveBeenCalled();
	});

	it("fails closed when a non-empty side falls below the six renderable levels", async () => {
		const onFatalError = vi.fn();
		const processor = createL2BookProcessor({
			coin: "BTC",
			onSnapshot: vi.fn(),
			onFatalError,
			decodeCompressed: async () => ({ c: "BTC", t: 2, l: [[], []], r: [[5], []] }),
		});
		processor.handle({ s: snapshot("BTC", 1) });
		processor.handle({ c: "shallow-book" });
		await processor.whenIdle();

		expect(onFatalError).toHaveBeenCalledOnce();
		expect(onFatalError).toHaveBeenCalledWith(expect.objectContaining({ code: "invalid_level_count" }));
	});

	it("filters other-coin snapshots and compressed deltas", async () => {
		const snapshots: L2BookSnapshot[] = [];
		const onFatalError = vi.fn();
		const processor = createL2BookProcessor({
			coin: "BTC",
			onSnapshot: (value) => snapshots.push(value),
			onFatalError,
			decodeCompressed: async () => ({ c: "ETH", t: 2, l: [[], []], r: [[], []] }),
		});

		processor.handle({ s: snapshot("ETH", 1) });
		processor.handle({ c: "other-coin" });
		processor.handle({ u: { c: "ETH", invalid: true } });
		await processor.whenIdle();

		expect(snapshots).toEqual([]);
		expect(onFatalError).not.toHaveBeenCalled();
	});

	it.each([
		{ s: snapshot("BTC", 1), c: "compressed" },
		{ s: snapshot("BTC", 1), u: { c: "BTC", t: 2, l: [[], []], r: [[], []] } },
		{ c: "compressed", u: { c: "BTC", t: 2, l: [[], []], r: [[], []] } },
	])("rejects frames that contain more than one of s, c, or u", (frame) => {
		const onFatalError = vi.fn();
		const processor = createL2BookProcessor({ coin: "BTC", onSnapshot: vi.fn(), onFatalError });
		processor.handle(frame);

		expect(onFatalError).toHaveBeenCalledOnce();
		expect(onFatalError).toHaveBeenCalledWith(expect.objectContaining({ code: "invalid_frame" }));
	});

	it("applies asynchronous deltas strictly in arrival order", async () => {
		const first = deferred<L2BookDelta>();
		const second = deferred<L2BookDelta>();
		const decodeCompressed = vi.fn((value: string) => (value === "first" ? first.promise : second.promise));
		const snapshots: L2BookSnapshot[] = [];
		const processor = createL2BookProcessor({
			coin: "BTC",
			onSnapshot: (value) => snapshots.push(value),
			onFatalError: vi.fn(),
			decodeCompressed,
		});
		processor.handle({ s: snapshot("BTC", 1) });
		processor.handle({ c: "first" });
		processor.handle({ c: "second" });
		await vi.waitFor(() => expect(decodeCompressed).toHaveBeenCalledTimes(1));

		first.resolve({ c: "BTC", t: 2, l: [[{ p: "100", s: "2" }], []], r: [[], []] });
		await vi.waitFor(() => expect(decodeCompressed).toHaveBeenCalledTimes(2));
		second.resolve({ c: "BTC", t: 3, l: [[{ p: "100", s: "3" }], []], r: [[], []] });
		await processor.whenIdle();

		expect(snapshots.map((value) => value.time)).toEqual([1, 2, 3]);
		expect(snapshots.at(-1)?.levels[0][0]).toEqual({ px: "100", sz: "3" });
	});

	it("accepts a raw u delta and serializes it behind compressed work", async () => {
		const compressedDelta = deferred<L2BookDelta>();
		const snapshots: L2BookSnapshot[] = [];
		const processor = createL2BookProcessor({
			coin: "BTC",
			onSnapshot: (value) => snapshots.push(value),
			onFatalError: vi.fn(),
			decodeCompressed: () => compressedDelta.promise,
		});
		processor.handle({ s: snapshot("BTC", 1) });
		processor.handle({ c: "compressed" });
		processor.handle({
			u: { c: "BTC", t: 3, l: [[{ p: "100", s: "3" }], []], r: [[], []] },
		});

		compressedDelta.resolve({ c: "BTC", t: 2, l: [[{ p: "100", s: "2" }], []], r: [[], []] });
		await processor.whenIdle();

		expect(snapshots.map((value) => value.time)).toEqual([1, 2, 3]);
		expect(snapshots.at(-1)?.levels[0][0]).toEqual({ px: "100", sz: "3" });
	});

	it("lets a new snapshot supersede old in-flight work", async () => {
		const oldDelta = deferred<L2BookDelta>();
		const newDelta = deferred<L2BookDelta>();
		const decodeCompressed = vi.fn((value: string) => (value === "old" ? oldDelta.promise : newDelta.promise));
		const snapshots: L2BookSnapshot[] = [];
		const processor = createL2BookProcessor({
			coin: "BTC",
			onSnapshot: (value) => snapshots.push(value),
			onFatalError: vi.fn(),
			decodeCompressed,
		});
		processor.handle({ s: snapshot("BTC", 1) });
		processor.handle({ c: "old" });
		await vi.waitFor(() => expect(decodeCompressed).toHaveBeenCalledWith("old"));

		processor.handle({ s: snapshot("BTC", 10, "200", "201") });
		processor.handle({ c: "new" });
		await vi.waitFor(() => expect(decodeCompressed).toHaveBeenCalledWith("new"));
		newDelta.resolve({ c: "BTC", t: 11, l: [[{ p: "200", s: "4" }], []], r: [[], []] });
		await processor.whenIdle();
		oldDelta.resolve({ c: "BTC", t: 2, l: [[{ p: "100", s: "9" }], []], r: [[], []] });
		await Promise.resolve();

		expect(snapshots.map((value) => value.time)).toEqual([1, 10, 11]);
		expect(snapshots.at(-1)?.levels[0][0]).toEqual({ px: "200", sz: "4" });
	});

	it("drops in-flight work across an explicit reset", async () => {
		const pendingDelta = deferred<L2BookDelta>();
		const snapshots: L2BookSnapshot[] = [];
		const decodeCompressed = vi.fn(() => pendingDelta.promise);
		const processor = createL2BookProcessor({
			coin: "BTC",
			onSnapshot: (value) => snapshots.push(value),
			onFatalError: vi.fn(),
			decodeCompressed,
		});
		processor.handle({ s: snapshot("BTC", 1) });
		processor.handle({ c: "pending" });
		await vi.waitFor(() => expect(decodeCompressed).toHaveBeenCalledOnce());
		processor.reset();
		processor.handle({ s: snapshot("BTC", 10, "200", "201") });
		pendingDelta.resolve({ c: "BTC", t: 2, l: [[{ p: "100", s: "9" }], []], r: [[], []] });
		await Promise.resolve();

		expect(snapshots.map((value) => value.time)).toEqual([1, 10]);
	});

	it("fails closed once and can only resume after an explicit reset", async () => {
		const snapshots: L2BookSnapshot[] = [];
		const errors: L2BookStreamError[] = [];
		const processor = createL2BookProcessor({
			coin: "BTC",
			onSnapshot: (value) => snapshots.push(value),
			onFatalError: (error) => errors.push(error),
			decodeCompressed: async () => ({ c: "BTC", t: 2, l: [[], []], r: [[9], []] }),
		});
		processor.handle({ s: snapshot("BTC", 1) });
		processor.handle({ c: "invalid-removal" });
		await processor.whenIdle();
		processor.handle({ s: snapshot("BTC", 3, "200", "201") });

		expect(errors).toHaveLength(1);
		expect(errors[0]?.code).toBe("invalid_removal_index");
		expect(snapshots.map((value) => value.time)).toEqual([1]);

		processor.reset();
		processor.handle({ s: snapshot("BTC", 3, "200", "201") });
		expect(snapshots.map((value) => value.time)).toEqual([1, 3]);
	});
});
