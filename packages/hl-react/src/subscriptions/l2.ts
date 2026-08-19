export const L2_BOOK_MAX_LEVELS = 20;
export const L2_BOOK_MIN_RENDERABLE_LEVELS = 6;

export const L2_CODEC_LIMITS = {
	maximumBase64Characters: 256 * 1024,
	maximumDecompressedBytes: 1024 * 1024,
} as const;

const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export type L2BookSide = "asks" | "bids";
export type L2SignificantFigures = 2 | 3 | 4 | 5;
export type L2Mantissa = 1 | 2 | 5;

export type L2SubscriptionParameters =
	| { coin: string; nSigFigs?: null; mantissa?: 1 | null }
	| { coin: string; nSigFigs: 2 | 3 | 4; mantissa?: 1 | null }
	| { coin: string; nSigFigs: 5; mantissa?: L2Mantissa | null };

export type L2SubscriptionPayload = {
	type: "l2";
	c: string;
	s?: L2SignificantFigures;
	m?: Exclude<L2Mantissa, 1>;
};

export type L2BookLevel = {
	px: string;
	sz: string;
	n?: number;
};

export type L2BookLevels = [bids: L2BookLevel[], asks: L2BookLevel[]];

export type L2BookSnapshot = {
	coin: string;
	time: number;
	levels: L2BookLevels;
	spread?: string;
	fast?: true;
};

export type L2BookUpsert = {
	p: string;
	s: string;
};

export type L2BookDelta = {
	c: string;
	t: number;
	l: [bids: L2BookUpsert[], asks: L2BookUpsert[]];
	r: [bids: number[], asks: number[]];
};

export const L2_BOOK_STREAM_ERROR_CODES = [
	"unsupported_decompression",
	"snapshot_timeout",
	"subscription_conflict",
	"subscribe_failed",
	"unsubscribe_failed",
	"compressed_payload_too_large",
	"decompressed_payload_too_large",
	"invalid_base64",
	"decompression_failed",
	"invalid_utf8",
	"invalid_json",
	"invalid_frame",
	"invalid_level",
	"invalid_level_count",
	"invalid_sort_order",
	"invalid_removal_index",
	"missing_snapshot",
	"non_monotonic_time",
] as const;

export type L2BookStreamErrorCode = (typeof L2_BOOK_STREAM_ERROR_CODES)[number];

export class L2BookStreamError extends Error {
	readonly code: L2BookStreamErrorCode;

	constructor(code: L2BookStreamErrorCode, options: { cause?: unknown } = {}) {
		super(getErrorMessage(code), options.cause === undefined ? undefined : { cause: options.cause });
		this.name = "L2BookStreamError";
		this.code = code;
	}
}

export interface L2CodecLimits {
	maximumBase64Characters?: number;
	maximumDecompressedBytes?: number;
}

export interface L2DecompressionScope {
	DecompressionStream?: typeof DecompressionStream;
}

export interface MergeL2BookSideParameters {
	levels: readonly L2BookLevel[];
	upserts: readonly L2BookUpsert[];
	removedLevelIndexes: readonly number[];
	side: L2BookSide;
}

export interface CreateL2BookProcessorParameters {
	coin: string;
	onSnapshot: (snapshot: L2BookSnapshot) => void;
	onFatalError: (error: L2BookStreamError) => void;
	decodeCompressed?: (base64: string) => Promise<L2BookDelta>;
}

export interface L2BookProcessor {
	handle(data: unknown): void;
	reset(): void;
	dispose(): void;
	whenIdle(): Promise<void>;
}

export function buildL2SubscriptionPayload(params: L2SubscriptionParameters): L2SubscriptionPayload {
	if (params.coin.length === 0) throw new L2BookStreamError("invalid_frame");

	const nSigFigs = params.nSigFigs ?? null;
	const mantissa = params.mantissa ?? 1;
	return {
		type: "l2",
		c: params.coin,
		...(nSigFigs === null ? {} : { s: nSigFigs }),
		...(mantissa === 1 ? {} : { m: mantissa }),
	};
}

export function canUseL2Decompression(scope: L2DecompressionScope = globalThis): boolean {
	const DecompressionStreamConstructor = scope.DecompressionStream;
	if (typeof DecompressionStreamConstructor !== "function") return false;

	try {
		new DecompressionStreamConstructor("deflate-raw");
		return true;
	} catch {
		return false;
	}
}

export async function inflateL2CompressedPayload(base64: string, limits: L2CodecLimits = {}): Promise<string> {
	const maximumBase64Characters = limits.maximumBase64Characters ?? L2_CODEC_LIMITS.maximumBase64Characters;
	const maximumDecompressedBytes = limits.maximumDecompressedBytes ?? L2_CODEC_LIMITS.maximumDecompressedBytes;

	if (base64.length > maximumBase64Characters) {
		throw new L2BookStreamError("compressed_payload_too_large");
	}

	const compressed = decodeBase64(base64);
	const DecompressionStreamConstructor = globalThis.DecompressionStream;
	if (typeof DecompressionStreamConstructor !== "function") {
		throw new L2BookStreamError("unsupported_decompression");
	}

	let decompressor: DecompressionStream;
	try {
		decompressor = new DecompressionStreamConstructor("deflate-raw");
	} catch (error) {
		throw new L2BookStreamError("unsupported_decompression", { cause: error });
	}

	let decompressed: Uint8Array;
	try {
		const stream = new Blob([compressed]).stream().pipeThrough(decompressor);
		decompressed = await readBoundedStream(stream, maximumDecompressedBytes);
	} catch (error) {
		if (error instanceof L2BookStreamError) throw error;
		throw new L2BookStreamError("decompression_failed", { cause: error });
	}

	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(decompressed);
	} catch (error) {
		throw new L2BookStreamError("invalid_utf8", { cause: error });
	}
}

export async function decodeL2CompressedDelta(base64: string, limits: L2CodecLimits = {}): Promise<L2BookDelta> {
	const text = await inflateL2CompressedPayload(base64, limits);
	let parsed: unknown;
	try {
		parsed = JSON.parse(text) as unknown;
	} catch (error) {
		throw new L2BookStreamError("invalid_json", { cause: error });
	}
	return parseDelta(parsed);
}

export function mergeL2BookSide({
	levels,
	upserts,
	removedLevelIndexes,
	side,
}: MergeL2BookSideParameters): L2BookLevel[] {
	validateSide(levels, side);
	if (upserts.length > L2_BOOK_MAX_LEVELS || removedLevelIndexes.length > L2_BOOK_MAX_LEVELS) {
		throw new L2BookStreamError("invalid_level_count");
	}

	const removed = new Set<number>();
	for (const index of removedLevelIndexes) {
		if (!Number.isSafeInteger(index) || index < 0 || index >= levels.length || removed.has(index)) {
			throw new L2BookStreamError("invalid_removal_index");
		}
		removed.add(index);
	}

	const levelsByPrice = new Map<string, L2BookLevel>();
	for (let index = 0; index < levels.length; index += 1) {
		const level = levels[index];
		if (level !== undefined && !removed.has(index)) levelsByPrice.set(level.px, { ...level });
	}
	for (const upsert of upserts) {
		validateDecimal(upsert.p, false);
		validateDecimal(upsert.s, false);
		levelsByPrice.set(upsert.p, { px: upsert.p, sz: upsert.s });
	}

	const merged = Array.from(levelsByPrice.values());
	merged.sort((left, right) =>
		side === "bids" ? Number(right.px) - Number(left.px) : Number(left.px) - Number(right.px),
	);
	validateSide(merged, side);
	return merged;
}

export function createL2BookProcessor({
	coin,
	onSnapshot,
	onFatalError,
	decodeCompressed = decodeL2CompressedDelta,
}: CreateL2BookProcessorParameters): L2BookProcessor {
	let active = true;
	let failed = false;
	let epoch = 0;
	let snapshot: L2BookSnapshot | undefined;
	let chain = Promise.resolve();

	function fail(error: unknown, expectedEpoch = epoch) {
		if (!active || failed || expectedEpoch !== epoch) return;
		failed = true;
		epoch += 1;
		snapshot = undefined;
		chain = Promise.resolve();
		onFatalError(asL2BookStreamError(error));
	}

	function reset() {
		if (!active) return;
		epoch += 1;
		failed = false;
		snapshot = undefined;
		chain = Promise.resolve();
	}

	function handleSnapshot(value: unknown) {
		const candidateCoin = isRecord(value) ? value.coin : undefined;
		if (typeof candidateCoin === "string" && candidateCoin !== coin) return;

		let next: L2BookSnapshot;
		try {
			next = parseSnapshot(value);
			if (next.coin !== coin) return;
			validateBook(next.levels);
		} catch (error) {
			fail(error);
			return;
		}

		epoch += 1;
		failed = false;
		snapshot = next;
		chain = Promise.resolve();
		onSnapshot(next);
	}

	function enqueueDelta(decode: () => Promise<L2BookDelta>) {
		const expectedEpoch = epoch;
		const pending = chain.then(async () => {
			if (!active || failed || expectedEpoch !== epoch) return;
			const delta = await decode();
			if (!active || failed || expectedEpoch !== epoch || delta.c !== coin) return;

			const previous = snapshot;
			if (!previous) throw new L2BookStreamError("missing_snapshot");
			if (delta.t < previous.time) throw new L2BookStreamError("non_monotonic_time");

			const next: L2BookSnapshot = {
				coin,
				time: delta.t,
				levels: [
					mergeL2BookSide({
						levels: previous.levels[0],
						upserts: delta.l[0],
						removedLevelIndexes: delta.r[0],
						side: "bids",
					}),
					mergeL2BookSide({
						levels: previous.levels[1],
						upserts: delta.l[1],
						removedLevelIndexes: delta.r[1],
						side: "asks",
					}),
				],
			};
			validateBook(next.levels);
			if (!active || failed || expectedEpoch !== epoch) return;
			snapshot = next;
			onSnapshot(next);
		});
		chain = pending.catch((error: unknown) => fail(error, expectedEpoch));
	}

	function handleCompressed(base64: string) {
		enqueueDelta(() => decodeCompressed(base64));
	}

	function handleUncompressed(value: unknown) {
		const candidateCoin = isRecord(value) ? value.c : undefined;
		if (typeof candidateCoin === "string" && candidateCoin !== coin) return;
		enqueueDelta(() => Promise.resolve(parseDelta(value)));
	}

	return {
		handle(data) {
			if (!active || failed) return;
			if (!isRecord(data)) {
				fail(new L2BookStreamError("invalid_frame"));
				return;
			}

			const hasSnapshot = Object.hasOwn(data, "s");
			const hasCompressed = Object.hasOwn(data, "c");
			const hasUncompressed = Object.hasOwn(data, "u");
			if (Number(hasSnapshot) + Number(hasCompressed) + Number(hasUncompressed) !== 1) {
				fail(new L2BookStreamError("invalid_frame"));
				return;
			}
			if (hasSnapshot) {
				handleSnapshot(data.s);
				return;
			}
			if (hasUncompressed) {
				handleUncompressed(data.u);
				return;
			}
			if (typeof data.c !== "string" || data.c.length === 0) {
				fail(new L2BookStreamError("invalid_frame"));
				return;
			}
			handleCompressed(data.c);
		},
		reset,
		dispose() {
			if (!active) return;
			active = false;
			failed = true;
			epoch += 1;
			snapshot = undefined;
			chain = Promise.resolve();
		},
		whenIdle() {
			return chain;
		},
	};
}

function parseSnapshot(value: unknown): L2BookSnapshot {
	if (!isRecord(value) || typeof value.coin !== "string" || !isTimestamp(value.time)) {
		throw new L2BookStreamError("invalid_frame");
	}
	if (!Array.isArray(value.levels) || value.levels.length !== 2) {
		throw new L2BookStreamError("invalid_frame");
	}

	return {
		coin: value.coin,
		time: value.time,
		levels: [parseLevels(value.levels[0], "bids"), parseLevels(value.levels[1], "asks")],
	};
}

function parseDelta(value: unknown): L2BookDelta {
	if (!isRecord(value) || typeof value.c !== "string" || value.c.length === 0 || !isTimestamp(value.t)) {
		throw new L2BookStreamError("invalid_frame");
	}
	if (!isPair(value.l) || !isPair(value.r)) throw new L2BookStreamError("invalid_frame");

	return {
		c: value.c,
		t: value.t,
		l: [parseUpserts(value.l[0]), parseUpserts(value.l[1])],
		r: [parseRemovalIndexes(value.r[0]), parseRemovalIndexes(value.r[1])],
	};
}

function parseLevels(value: unknown, side: L2BookSide): L2BookLevel[] {
	if (!Array.isArray(value)) throw new L2BookStreamError("invalid_frame");
	const levels = value.map((entry) => {
		if (!isRecord(entry) || typeof entry.px !== "string" || typeof entry.sz !== "string") {
			throw new L2BookStreamError("invalid_level");
		}
		validateDecimal(entry.px, false);
		validateDecimal(entry.sz, false);
		if (entry.n !== undefined && (!Number.isSafeInteger(entry.n) || Number(entry.n) < 0)) {
			throw new L2BookStreamError("invalid_level");
		}
		return {
			px: entry.px,
			sz: entry.sz,
			...(entry.n === undefined ? {} : { n: Number(entry.n) }),
		};
	});
	validateSide(levels, side);
	return levels;
}

function parseUpserts(value: unknown): L2BookUpsert[] {
	if (!Array.isArray(value) || value.length > L2_BOOK_MAX_LEVELS) {
		throw new L2BookStreamError("invalid_level_count");
	}
	return value.map((entry) => {
		if (!isRecord(entry) || typeof entry.p !== "string" || typeof entry.s !== "string") {
			throw new L2BookStreamError("invalid_level");
		}
		validateDecimal(entry.p, false);
		validateDecimal(entry.s, false);
		return { p: entry.p, s: entry.s };
	});
}

function parseRemovalIndexes(value: unknown): number[] {
	if (!Array.isArray(value) || value.length > L2_BOOK_MAX_LEVELS) {
		throw new L2BookStreamError("invalid_level_count");
	}
	return value.map((entry) => {
		if (!Number.isSafeInteger(entry) || Number(entry) < 0) {
			throw new L2BookStreamError("invalid_removal_index");
		}
		return Number(entry);
	});
}

function validateSide(levels: readonly L2BookLevel[], side: L2BookSide) {
	if (levels.length > L2_BOOK_MAX_LEVELS) {
		throw new L2BookStreamError("invalid_level_count");
	}

	for (let index = 0; index < levels.length; index += 1) {
		const level = levels[index];
		if (!level) throw new L2BookStreamError("invalid_level");
		validateDecimal(level.px, false);
		validateDecimal(level.sz, false);
		if (level.n !== undefined && (!Number.isSafeInteger(level.n) || level.n < 0)) {
			throw new L2BookStreamError("invalid_level");
		}

		const previous = levels[index - 1];
		if (!previous) continue;
		const comparison = Number(previous.px) - Number(level.px);
		if ((side === "bids" && comparison <= 0) || (side === "asks" && comparison >= 0)) {
			throw new L2BookStreamError("invalid_sort_order");
		}
	}
}

function validateBook(levels: L2BookLevels) {
	validateSide(levels[0], "bids");
	validateSide(levels[1], "asks");
	for (const side of levels) {
		if (side.length > 0 && side.length < L2_BOOK_MIN_RENDERABLE_LEVELS) {
			throw new L2BookStreamError("invalid_level_count");
		}
	}
	const bestBid = levels[0][0];
	const bestAsk = levels[1][0];
	if (bestBid && bestAsk && Number(bestBid.px) > Number(bestAsk.px)) {
		throw new L2BookStreamError("invalid_sort_order");
	}
}

function validateDecimal(value: string, allowZero: boolean) {
	if (!DECIMAL_PATTERN.test(value)) throw new L2BookStreamError("invalid_level");
	const numeric = Number(value);
	if (!Number.isFinite(numeric) || (allowZero ? numeric < 0 : numeric <= 0)) {
		throw new L2BookStreamError("invalid_level");
	}
}

function isTimestamp(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPair(value: unknown): value is [unknown, unknown] {
	return Array.isArray(value) && value.length === 2;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
	if (value.length === 0 || !BASE64_PATTERN.test(value) || typeof globalThis.atob !== "function") {
		throw new L2BookStreamError("invalid_base64");
	}

	let binary: string;
	try {
		binary = globalThis.atob(value);
	} catch (error) {
		throw new L2BookStreamError("invalid_base64", { cause: error });
	}
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
	return bytes;
}

async function readBoundedStream(stream: ReadableStream<Uint8Array>, maximumBytes: number): Promise<Uint8Array> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;

	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		if (!value) continue;
		totalBytes += value.byteLength;
		if (totalBytes > maximumBytes) {
			await reader.cancel().catch(() => {});
			throw new L2BookStreamError("decompressed_payload_too_large");
		}
		chunks.push(value);
	}

	const output = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return output;
}

function asL2BookStreamError(error: unknown): L2BookStreamError {
	return error instanceof L2BookStreamError ? error : new L2BookStreamError("invalid_frame", { cause: error });
}

function getErrorMessage(code: L2BookStreamErrorCode): string {
	return `Incremental L2 order book failure: ${code}`;
}
