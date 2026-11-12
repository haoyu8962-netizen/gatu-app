import type { FastAssetCtxsWsEvent, ISubscription, ISubscriptionTransport } from "@nktkas/hyperliquid";
import type { AllDexsAssetCtxsEvent, SpotAssetCtxsEvent } from "@nktkas/hyperliquid/api/subscription";
import type { SubscribeFailureOptions } from "../types";
import { inflateL2CompressedPayload, L2BookStreamError } from "./l2";

type DexAssetCtx = AllDexsAssetCtxsEvent["ctxs"][number][1][number];
type SpotAssetCtx = SpotAssetCtxsEvent[number];

export type CompactPerpAssetCtx = Pick<
	DexAssetCtx,
	"funding" | "openInterest" | "prevDayPx" | "dayNtlVlm" | "oraclePx" | "markPx" | "midPx" | "dayBaseVlm"
>;
export type CompactSpotAssetCtx = Pick<
	SpotAssetCtx,
	"prevDayPx" | "dayNtlVlm" | "markPx" | "midPx" | "dayBaseVlm" | "circulatingSupply"
>;
/** One decoded frame: the first frame after subscribing is complete, later frames carry only changed fields. */
export type CompactPerpAssetCtxsDelta = [dex: string, ctxs: Partial<CompactPerpAssetCtx>[]][];
export type CompactSpotAssetCtxsDelta = Record<string, Partial<CompactSpotAssetCtx>>;
/** The accumulated state handed to consumers; an entry stays undefined until every field arrived. */
export type CompactPerpAssetCtxsEvent = [dex: string, ctxs: (CompactPerpAssetCtx | undefined)[]][];
export type CompactSpotAssetCtxsEvent = Record<string, CompactSpotAssetCtx>;
export type CompactAssetCtxsChannel = "pac" | "sac";
export type CompactAssetCtxsDelta<C extends CompactAssetCtxsChannel> = C extends "pac"
	? CompactPerpAssetCtxsDelta
	: CompactSpotAssetCtxsDelta;
export type CompactAssetCtxsEvent<C extends CompactAssetCtxsChannel> = C extends "pac"
	? CompactPerpAssetCtxsEvent
	: CompactSpotAssetCtxsEvent;
export type CompactAssetCtxsSubscribeOptions = SubscribeFailureOptions & { signal?: AbortSignal };
export type CompactAssetCtxsDisconnectSubscriber = (listener: () => void) => () => void;

export const COMPACT_ASSET_CTXS_CODEC_LIMITS = {
	maximumBase64Characters: 512 * 1024,
	maximumDecompressedBytes: 4 * 1024 * 1024,
} as const;
export const COMPACT_ASSET_CTXS_MAX_PENDING_FRAMES = 64;

const PERP_FIELDS = [
	"funding",
	"openInterest",
	"prevDayPx",
	"dayNtlVlm",
	"oraclePx",
	"markPx",
	"midPx",
	"dayBaseVlm",
] as const;
const SPOT_FIELDS = ["prevDayPx", "dayNtlVlm", "markPx", "midPx", "dayBaseVlm", "circulatingSupply"] as const;
const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDecimalString(value: unknown): value is string {
	return typeof value === "string" && DECIMAL_PATTERN.test(value);
}

function isFieldValue(field: string, value: unknown): boolean {
	return field === "midPx" ? value === null || isDecimalString(value) : isDecimalString(value);
}

function readDelta<T extends object>(value: unknown, fields: readonly (keyof T & string)[]): Partial<T> | undefined {
	if (!isRecord(value)) return undefined;
	const delta: Record<string, unknown> = {};
	for (const field of fields) {
		if (!(field in value)) continue;
		if (!isFieldValue(field, value[field])) return undefined;
		delta[field] = value[field];
	}
	return delta as Partial<T>;
}

function isComplete<T extends object>(ctx: Partial<T>, fields: readonly (keyof T & string)[]): ctx is T {
	return fields.every((field) => field in ctx);
}

export function isCompletePerpAssetCtx(ctx: Partial<CompactPerpAssetCtx>): ctx is CompactPerpAssetCtx {
	return isComplete(ctx, PERP_FIELDS);
}

export function isCompleteSpotAssetCtx(ctx: Partial<CompactSpotAssetCtx>): ctx is CompactSpotAssetCtx {
	return isComplete(ctx, SPOT_FIELDS);
}

/**
 * Perp contexts are addressed by dex order and array index, so one malformed entry invalidates the
 * whole frame; consumers fall back to the plain channel instead of reading shifted values.
 */
export function parseCompactPerpAssetCtxsDelta(value: unknown): CompactPerpAssetCtxsDelta {
	if (!Array.isArray(value)) throw new L2BookStreamError("invalid_frame");
	return value.map((entry) => {
		if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || !Array.isArray(entry[1])) {
			throw new L2BookStreamError("invalid_frame");
		}
		const ctxs = entry[1].map((ctx) => readDelta<CompactPerpAssetCtx>(ctx, PERP_FIELDS));
		if (ctxs.some((ctx) => ctx === undefined)) throw new L2BookStreamError("invalid_frame");
		return [entry[0], ctxs as Partial<CompactPerpAssetCtx>[]];
	});
}

function parseKeyedDelta<T extends object>(value: unknown, fields: readonly (keyof T & string)[]) {
	if (!isRecord(value)) throw new L2BookStreamError("invalid_frame");
	const delta: Record<string, Partial<T>> = {};
	for (const [coin, entry] of Object.entries(value)) {
		const ctx = readDelta<T>(entry, fields);
		if (!ctx) throw new L2BookStreamError("invalid_frame");
		delta[coin] = ctx;
	}
	return delta;
}

/**
 * Spot contexts are addressed by market name. A malformed entry still invalidates the whole frame:
 * dropping it would keep that market's previous values alive across later deltas, which is a silent
 * wrong number rather than a fallback.
 */
export function parseCompactSpotAssetCtxsDelta(value: unknown): CompactSpotAssetCtxsDelta {
	const delta = parseKeyedDelta<CompactSpotAssetCtx>(value, SPOT_FIELDS);
	if (Object.keys(delta).length === 0) throw new L2BookStreamError("invalid_frame");
	return delta;
}

async function decodeCompressedJson<T>(payload: unknown, parse: (value: unknown) => T): Promise<T> {
	if (typeof payload !== "string") throw new L2BookStreamError("invalid_frame");
	const text = await inflateL2CompressedPayload(payload, COMPACT_ASSET_CTXS_CODEC_LIMITS);
	let parsed: unknown;
	try {
		parsed = JSON.parse(text) as unknown;
	} catch (error) {
		throw new L2BookStreamError("invalid_json", { cause: error });
	}
	return parse(parsed);
}

function getCompactParser(
	channel: CompactAssetCtxsChannel,
): (value: unknown) => CompactPerpAssetCtxsDelta | CompactSpotAssetCtxsDelta {
	return channel === "pac" ? parseCompactPerpAssetCtxsDelta : parseCompactSpotAssetCtxsDelta;
}

export function decodeCompactAssetCtxs<C extends CompactAssetCtxsChannel>(
	channel: C,
	payload: unknown,
): Promise<CompactAssetCtxsDelta<C>> {
	return decodeCompressedJson(payload, getCompactParser(channel)) as Promise<CompactAssetCtxsDelta<C>>;
}

export interface CompactAssetCtxsAccumulator<C extends CompactAssetCtxsChannel> {
	add: (delta: CompactAssetCtxsDelta<C>) => CompactAssetCtxsEvent<C>;
	reset: () => void;
}

/**
 * The first frame after subscribing must carry every field of every entry; later frames merge
 * their changed fields into that state. Each `add` returns a fresh view for consumers.
 */
export function createCompactPerpAssetCtxsAccumulator(): CompactAssetCtxsAccumulator<"pac"> {
	let state: Map<string, Partial<CompactPerpAssetCtx>[]> | undefined;
	return {
		add: (delta) => {
			if (!state) {
				if (!delta.every(([, ctxs]) => ctxs.every(isCompletePerpAssetCtx)))
					throw new L2BookStreamError("invalid_frame");
				state = new Map(delta.map(([dex, ctxs]) => [dex, ctxs]));
			} else {
				for (const [dex, ctxs] of delta) {
					const previous = state.get(dex) ?? [];
					const merged: Partial<CompactPerpAssetCtx>[] = [];
					for (let index = 0; index < Math.max(previous.length, ctxs.length); index += 1) {
						merged[index] = { ...previous[index], ...ctxs[index] };
					}
					state.set(dex, merged);
				}
			}
			return [...state].map(([dex, ctxs]) => [dex, ctxs.map((ctx) => (isCompletePerpAssetCtx(ctx) ? ctx : undefined))]);
		},
		reset: () => {
			state = undefined;
		},
	};
}

export function createCompactSpotAssetCtxsAccumulator(): CompactAssetCtxsAccumulator<"sac"> {
	let state: Map<string, Partial<CompactSpotAssetCtx>> | undefined;
	return {
		add: (delta) => {
			if (!state) {
				if (!Object.values(delta).every(isCompleteSpotAssetCtx)) throw new L2BookStreamError("invalid_frame");
				state = new Map(Object.entries(delta));
			} else {
				for (const [coin, ctx] of Object.entries(delta)) state.set(coin, { ...state.get(coin), ...ctx });
			}
			const view: CompactSpotAssetCtxsEvent = {};
			for (const [coin, ctx] of state) if (isCompleteSpotAssetCtx(ctx)) view[coin] = ctx;
			return view;
		},
		reset: () => {
			state = undefined;
		},
	};
}

export function createCompactAssetCtxsAccumulator<C extends CompactAssetCtxsChannel>(
	channel: C,
): CompactAssetCtxsAccumulator<C> {
	return (
		channel === "pac" ? createCompactPerpAssetCtxsAccumulator() : createCompactSpotAssetCtxsAccumulator()
	) as CompactAssetCtxsAccumulator<C>;
}

function toStreamError(error: unknown): L2BookStreamError {
	return error instanceof L2BookStreamError ? error : new L2BookStreamError("decompression_failed", { cause: error });
}

/**
 * `pac` and `sac` carry every perp or spot market context as base64 + raw DEFLATE frames: a complete
 * snapshot first, then only the fields that changed. Frames decode and merge strictly in arrival
 * order (a bounded backlog; falling behind by more than 64 frames ends the stream rather than
 * skipping a delta), the listener receives the accumulated view, and decoding stops once the
 * consumer unsubscribes. A frame that fails to decode ends the subscription: before the server
 * confirmation the returned promise rejects, afterwards `onError` fires once, both like a transport
 * failure. When the socket reconnects the SDK re-sends the subscription and the server answers with
 * a complete snapshot again, so a disconnect clears the accumulated state, the backlog and any
 * decode still in flight; the next frame must be complete like the first one.
 */
export function subscribeCompactAssetCtxs<C extends CompactAssetCtxsChannel>(
	transport: ISubscriptionTransport,
	channel: C,
	listener: (event: CompactAssetCtxsEvent<C>) => void,
	options?: CompactAssetCtxsSubscribeOptions,
	subscribeDisconnect?: CompactAssetCtxsDisconnectSubscriber,
): Promise<ISubscription> {
	return subscribeCompressedChannel(
		transport,
		channel,
		getCompactParser(channel) as (value: unknown) => CompactAssetCtxsDelta<C>,
		createCompactAssetCtxsAccumulator(channel),
		listener,
		options,
		subscribeDisconnect,
	);
}

const failedFastTransports = new WeakSet<ISubscriptionTransport>();

/**
 * The failure that locked `fastAssetCtxs` on its transport, and the rejection of every later subscription
 * there. Only this error means a retry cannot help; a consumer may fall back for good on it, while any
 * other error (a refused or timed-out request, a lost connection) is left to the store's retries.
 */
export class FastAssetCtxsLockedError extends L2BookStreamError {
	override readonly name = "FastAssetCtxsLockedError";
}

/**
 * `fastAssetCtxs` carries every market's mark and mid price compressed like `pac`, a complete snapshot
 * first and then the changed markets, about once a second; the store merges them per market. The
 * SDK's own decoder chains every frame on one promise, so a single frame that fails to decode, or a
 * listener that throws, left the stream silent for good while it still looked subscribed. Here such a
 * frame ends the subscription like any transport failure, and the store subscribes again for a fresh
 * snapshot instead of skipping a delta. A frame that cannot be decoded usually means the format changed
 * or the code is wrong, and the store forgets its retry count whenever a subscription is confirmed, so
 * retries would loop at its shortest delay. The first failure of any kind (decoding, the listener, the
 * backlog) therefore locks the channel on that transport, a conservative choice that one stray listener
 * exception also triggers: later subscriptions on it are rejected without reaching the server, so the
 * store backs off normally and the consumer falls back to another price source. Nothing clears the
 * lock; transports are cached per network and survive an SDK reconnect, so only a reload starts clean.
 */
export function subscribeFastAssetCtxs(
	transport: ISubscriptionTransport,
	listener: (event: FastAssetCtxsWsEvent) => void,
	options?: CompactAssetCtxsSubscribeOptions,
	subscribeDisconnect?: CompactAssetCtxsDisconnectSubscriber,
): Promise<ISubscription> {
	if (failedFastTransports.has(transport)) return Promise.reject(new FastAssetCtxsLockedError("invalid_frame"));
	return subscribeCompressedChannel(
		transport,
		"fastAssetCtxs",
		(value) => parseKeyedDelta<FastAssetCtxsWsEvent[string]>(value, ["markPx", "midPx"]),
		{
			add: (delta) => delta,
			reset: () => {},
			fail: (error) => {
				failedFastTransports.add(transport);
				return new FastAssetCtxsLockedError(error.code, { cause: error });
			},
		},
		listener,
		options,
		subscribeDisconnect,
	);
}

function subscribeCompressedChannel<D, E>(
	transport: ISubscriptionTransport,
	channel: string,
	parse: (value: unknown) => D,
	accumulator: {
		add: (delta: D) => E;
		reset: () => void;
		fail?: (error: L2BookStreamError) => L2BookStreamError;
	},
	listener: (event: E) => void,
	options?: CompactAssetCtxsSubscribeOptions,
	subscribeDisconnect?: CompactAssetCtxsDisconnectSubscriber,
): Promise<ISubscription> {
	const pending: unknown[] = [];
	let raw: ISubscription | undefined;
	let confirmed = false;
	let stopped = false;
	let decoding = false;
	let generation = 0;
	let failure: L2BookStreamError | undefined;
	let detachDisconnect: (() => void) | undefined;

	const stop = () => {
		stopped = true;
		pending.length = 0;
		detachDisconnect?.();
		detachDisconnect = undefined;
	};
	detachDisconnect = subscribeDisconnect?.(() => {
		if (stopped) return;
		generation += 1;
		pending.length = 0;
		accumulator.reset();
	});
	const fail = (error: unknown) => {
		if (stopped) return;
		failure = toStreamError(error);
		failure = accumulator.fail?.(failure) ?? failure;
		stop();
		if (!confirmed) return;
		void raw?.unsubscribe().catch(() => {});
		options?.onError?.(failure);
	};
	const drain = async () => {
		if (decoding) return;
		decoding = true;
		try {
			while (pending.length > 0 && !stopped) {
				const frame = pending.shift();
				const frameGeneration = generation;
				const delta = await decodeCompressedJson(frame, parse);
				if (stopped || frameGeneration !== generation) continue;
				listener(accumulator.add(delta));
			}
		} catch (error) {
			fail(error);
		} finally {
			decoding = false;
		}
	};

	return transport
		.subscribe(
			channel,
			{ type: channel },
			(event: CustomEvent<unknown>) => {
				if (stopped) return;
				if (pending.length >= COMPACT_ASSET_CTXS_MAX_PENDING_FRAMES) {
					fail(new Error("compact market context backlog exceeded"));
					return;
				}
				pending.push(event.detail);
				void drain();
			},
			{
				...options,
				onError: (error) => {
					stop();
					options?.onError?.(error);
				},
			},
		)
		.then(
			(active) => {
				if (failure) {
					void active.unsubscribe().catch(() => {});
					throw failure;
				}
				raw = active;
				confirmed = true;
				return {
					unsubscribe: async () => {
						if (stopped) return;
						stop();
						await active.unsubscribe();
					},
				};
			},
			(error: unknown) => {
				stop();
				throw error;
			},
		);
}
