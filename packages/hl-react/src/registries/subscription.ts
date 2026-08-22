import type {
	FastAssetCtxsWsEvent,
	HistoricalOrdersResponse,
	TradesWsEvent,
	TwapHistoryResponse,
	UserTwapSliceFillsResponse,
} from "@nktkas/hyperliquid";
import type { RingBufferOptions } from "../internal/circular-buffer/ring-buffer";
import type { SubEvent, SubMethod } from "../types/clients";
import { shouldReplaceHistoricalOrder } from "./historical-orders";

type RawTrade = TradesWsEvent[number];
type TwapHistoryItem = TwapHistoryResponse[number];

const MAX_TWAP_HISTORY_ITEMS = 2000;

function getTwapHistoryParentKey(item: TwapHistoryItem): string {
	if (item.twapId !== undefined) return String(item.twapId);
	return `${item.state.user}:${item.state.timestamp}:${item.state.coin}:${item.state.side}:${item.state.sz}`;
}

function getTwapHistoryEventKey(item: TwapHistoryItem): string {
	return `${getTwapHistoryParentKey(item)}:${item.time}:${item.status.status}`;
}

interface AccumulateConfig<TEvent = unknown, TItem = unknown> {
	getItems: (event: TEvent) => TItem[];
	withItems: (event: TEvent, items: TItem[]) => TEvent;
	isSnapshot: (event: TEvent) => boolean;
	buffer: RingBufferOptions<TItem>;
}

export interface SubscriptionEventAccumulator<TEvent> {
	add: (event: TEvent) => TEvent;
}

type FastAssetCtxPriceField = "markPx" | "midPx";

const fastAssetCtxFieldReceivedAt = new WeakMap<
	object,
	ReadonlyMap<string, Readonly<Partial<Record<FastAssetCtxPriceField, number>>>>
>();

function defineAccumulator<TEvent, TItem>(config: AccumulateConfig<TEvent, TItem>): AccumulateConfig {
	return config as AccumulateConfig;
}

function createFastAssetCtxsAccumulator(): SubscriptionEventAccumulator<FastAssetCtxsWsEvent> {
	let accumulated = new Map<string, FastAssetCtxsWsEvent[string]>();
	let fieldTimestamps = new Map<string, Readonly<Partial<Record<FastAssetCtxPriceField, number>>>>();

	return {
		add: (event) => {
			const receivedAt = Date.now();
			const next = new Map(accumulated);
			const nextFieldTimestamps = new Map(fieldTimestamps);
			for (const [coin, update] of Object.entries(event)) {
				next.set(coin, { ...next.get(coin), ...update });
				const currentTimestamps = nextFieldTimestamps.get(coin);
				nextFieldTimestamps.set(coin, {
					...(currentTimestamps ?? {}),
					...(Object.hasOwn(update, "markPx") ? { markPx: receivedAt } : null),
					...(Object.hasOwn(update, "midPx") ? { midPx: receivedAt } : null),
				});
			}
			accumulated = next;
			fieldTimestamps = nextFieldTimestamps;
			const snapshot = Object.fromEntries(next);
			fastAssetCtxFieldReceivedAt.set(snapshot, nextFieldTimestamps);
			return snapshot;
		},
	};
}

export function getFastAssetCtxFieldReceivedAt(
	snapshot: FastAssetCtxsWsEvent | undefined,
	coin: string,
	field: FastAssetCtxPriceField,
): number | undefined {
	if (!snapshot) return undefined;
	const receivedAt = fastAssetCtxFieldReceivedAt.get(snapshot)?.get(coin)?.[field];
	return receivedAt;
}

const EVENT_ACCUMULATORS: Partial<Record<SubMethod, () => SubscriptionEventAccumulator<unknown>>> = {
	fastAssetCtxs: createFastAssetCtxsAccumulator as () => SubscriptionEventAccumulator<unknown>,
};

const ACCUMULATING_SUBS: Partial<Record<SubMethod, AccumulateConfig>> = {
	trades: defineAccumulator<unknown[], RawTrade>({
		getItems: (event) => event as RawTrade[],
		withItems: (_, items) => items,
		isSnapshot: () => false,
		buffer: {
			maxSize: 100,
			getKey: (t) => `${t.time}:${t.coin}:${t.tid}`,
			compare: (a, b) => b.time - a.time,
		},
	}),
	userFills: defineAccumulator<{ fills: unknown[]; isSnapshot?: boolean }, { tid: number; time: number }>({
		getItems: (event) => event.fills as { tid: number; time: number }[],
		withItems: (event, items) => ({ ...event, fills: items }),
		isSnapshot: (event) => event.isSnapshot === true,
		buffer: {
			maxSize: 200,
			getKey: (f) => String(f.tid),
			compare: (a, b) => b.time - a.time,
		},
	}),
	userFundings: defineAccumulator<{ fundings: unknown[]; isSnapshot?: boolean }, { time: number; coin: string }>({
		getItems: (event) => event.fundings as { time: number; coin: string }[],
		withItems: (event, items) => ({ ...event, fundings: items }),
		isSnapshot: (event) => event.isSnapshot === true,
		buffer: {
			maxSize: 500,
			getKey: (f) => `${f.time}-${f.coin}`,
			compare: (a, b) => b.time - a.time,
		},
	}),
	userHistoricalOrders: defineAccumulator<
		{ orderHistory: unknown[]; isSnapshot?: boolean },
		HistoricalOrdersResponse[number]
	>({
		getItems: (event) => event.orderHistory as HistoricalOrdersResponse,
		withItems: (event, items) => ({ ...event, orderHistory: items }),
		isSnapshot: (event) => event.isSnapshot === true,
		buffer: {
			maxSize: 500,
			getKey: (o) => String(o.order.oid),
			compare: (a, b) => b.statusTimestamp - a.statusTimestamp,
			shouldReplace: shouldReplaceHistoricalOrder,
		},
	}),
	userNonFundingLedgerUpdates: defineAccumulator<
		{ nonFundingLedgerUpdates: unknown[]; isSnapshot?: boolean },
		{ delta: unknown; hash: string; time: number }
	>({
		getItems: (event) => event.nonFundingLedgerUpdates as { delta: unknown; hash: string; time: number }[],
		withItems: (event, items) => ({ ...event, nonFundingLedgerUpdates: items }),
		isSnapshot: (event) => event.isSnapshot === true,
		buffer: {
			maxSize: 500,
			getKey: (u) => `${u.hash}:${u.time}:${JSON.stringify(u.delta)}`,
			compare: (a, b) => b.time - a.time,
		},
	}),
	userTwapHistory: defineAccumulator<{ history: unknown[]; isSnapshot?: boolean }, TwapHistoryItem>({
		getItems: (event) => event.history as TwapHistoryResponse,
		withItems: (event, items) => ({ ...event, history: items }),
		isSnapshot: (event) => event.isSnapshot === true,
		buffer: {
			maxSize: MAX_TWAP_HISTORY_ITEMS,
			getKey: getTwapHistoryEventKey,
			compare: (a, b) => b.time - a.time,
			shouldReplace: (existing, incoming) => incoming.time >= existing.time,
		},
	}),
	userTwapSliceFills: defineAccumulator<
		{ twapSliceFills: unknown[]; isSnapshot?: boolean },
		UserTwapSliceFillsResponse[number]
	>({
		getItems: (event) => event.twapSliceFills as UserTwapSliceFillsResponse,
		withItems: (event, items) => ({ ...event, twapSliceFills: items }),
		isSnapshot: (event) => event.isSnapshot === true,
		buffer: {
			maxSize: MAX_TWAP_HISTORY_ITEMS,
			getKey: (f) => String(f.fill.tid),
			compare: (a, b) => b.fill.time - a.fill.time,
		},
	}),
};

const DEFAULT_THROTTLE: Partial<Record<SubMethod, number>> = {
	bbo: 16,
	l2Book: 16,
};

export function getAccumulateConfig(method: SubMethod): AccumulateConfig | null {
	return ACCUMULATING_SUBS[method] ?? null;
}

export function createSubscriptionEventAccumulator<M extends SubMethod>(
	method: M,
): SubscriptionEventAccumulator<SubEvent<M>> | null {
	const create = EVENT_ACCUMULATORS[method];
	return create ? (create() as SubscriptionEventAccumulator<SubEvent<M>>) : null;
}

export function getDefaultThrottle(method: SubMethod): number | undefined {
	return DEFAULT_THROTTLE[method];
}

export function shouldAcceptSubscriptionEvent(method: SubMethod, params: unknown, event: unknown): boolean {
	if (method !== "l2Book" && method !== "activeAssetCtx" && method !== "activeSpotAssetCtx") return true;
	if (!isRecord(params) || !isRecord(event)) return false;

	const requestedCoin = params.coin;
	if (typeof requestedCoin !== "string" || event.coin !== requestedCoin) return false;
	if (method !== "l2Book") return true;

	// @nktkas/hyperliquid 0.33.3 routes l2Book listeners by coin only. When a
	// fast and a full-depth subscription overlap, both callbacks can therefore
	// receive both payloads. Filter before the shared store and stale watchdog.
	return (params.fast === true) === (event.fast === true);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
