import type { ISubscription, ISubscriptionTransport } from "@nktkas/hyperliquid";
import type { AllDexsAssetCtxsEvent, SpotAssetCtxsEvent } from "@nktkas/hyperliquid/api/subscription";
import type { SubscribeFailureOptions } from "../types";
import { inflateL2CompressedPayload, L2BookStreamError } from "./l2";

type DexAssetCtx = AllDexsAssetCtxsEvent["ctxs"][number][1][number];
type SpotAssetCtx = SpotAssetCtxsEvent[number];

export type CompactPerpAssetCtx = Pick<
	DexAssetCtx,
	"funding" | "openInterest" | "prevDayPx" | "dayNtlVlm" | "oraclePx" | "markPx" | "midPx" | "dayBaseVlm"
>;
export type CompactPerpAssetCtxsEvent = [dex: string, ctxs: CompactPerpAssetCtx[]][];
export type CompactSpotAssetCtx = Pick<
	SpotAssetCtx,
	"prevDayPx" | "dayNtlVlm" | "markPx" | "midPx" | "dayBaseVlm" | "circulatingSupply"
>;
export type CompactSpotAssetCtxsEvent = Record<string, CompactSpotAssetCtx>;
export type CompactAssetCtxsChannel = "pac" | "sac";
export type CompactAssetCtxsEvent<C extends CompactAssetCtxsChannel> = C extends "pac"
	? CompactPerpAssetCtxsEvent
	: CompactSpotAssetCtxsEvent;
export type CompactAssetCtxsSubscribeOptions = SubscribeFailureOptions & { signal?: AbortSignal };

export const COMPACT_ASSET_CTXS_CODEC_LIMITS = {
	maximumBase64Characters: 512 * 1024,
	maximumDecompressedBytes: 4 * 1024 * 1024,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePerpAssetCtxs(value: unknown): CompactPerpAssetCtxsEvent {
	const valid =
		Array.isArray(value) &&
		value.every(
			(entry) =>
				Array.isArray(entry) &&
				entry.length === 2 &&
				typeof entry[0] === "string" &&
				Array.isArray(entry[1]) &&
				entry[1].every(isRecord),
		);
	if (!valid) throw new L2BookStreamError("invalid_frame");
	return value as CompactPerpAssetCtxsEvent;
}

function parseSpotAssetCtxs(value: unknown): CompactSpotAssetCtxsEvent {
	if (!isRecord(value) || !Object.values(value).every(isRecord)) throw new L2BookStreamError("invalid_frame");
	return value as CompactSpotAssetCtxsEvent;
}

export async function decodeCompactAssetCtxs<C extends CompactAssetCtxsChannel>(
	channel: C,
	payload: unknown,
): Promise<CompactAssetCtxsEvent<C>> {
	if (typeof payload !== "string") throw new L2BookStreamError("invalid_frame");
	const text = await inflateL2CompressedPayload(payload, COMPACT_ASSET_CTXS_CODEC_LIMITS);
	let parsed: unknown;
	try {
		parsed = JSON.parse(text) as unknown;
	} catch (error) {
		throw new L2BookStreamError("invalid_json", { cause: error });
	}
	return (channel === "pac" ? parsePerpAssetCtxs(parsed) : parseSpotAssetCtxs(parsed)) as CompactAssetCtxsEvent<C>;
}

/**
 * `pac` and `sac` carry every perp or spot market context as one base64 + raw DEFLATE frame, a
 * fraction of the plain `allDexsAssetCtxs`/`spotAssetCtxs` bytes. Frames decode sequentially so the
 * listener observes arrival order; the first frame that fails to decode ends the subscription and
 * reports through `onError`, like a transport failure.
 */
export function subscribeCompactAssetCtxs<C extends CompactAssetCtxsChannel>(
	transport: ISubscriptionTransport,
	channel: C,
	listener: (event: CompactAssetCtxsEvent<C>) => void,
	options?: CompactAssetCtxsSubscribeOptions,
): Promise<ISubscription> {
	let queue: Promise<void> = Promise.resolve();
	let raw: ISubscription | undefined;
	let failed = false;
	const fail = (error: unknown) => {
		if (failed) return;
		failed = true;
		void raw?.unsubscribe().catch(() => {});
		options?.onError?.(
			error instanceof L2BookStreamError ? error : new L2BookStreamError("decompression_failed", { cause: error }),
		);
	};
	const subscription = transport.subscribe(
		channel,
		{ type: channel },
		(event: CustomEvent<unknown>) => {
			if (failed) return;
			const detail = event.detail;
			queue = queue
				.then(async () => {
					if (failed) return;
					listener(await decodeCompactAssetCtxs(channel, detail));
				})
				.catch(fail);
		},
		options,
	);
	void subscription.then(
		(active) => {
			raw = active;
			if (failed) void active.unsubscribe().catch(() => {});
		},
		() => {},
	);
	return subscription;
}
