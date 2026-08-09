import type {
	HistoricalOrdersResponse,
	TradesWsEvent,
	TwapHistoryResponse,
	UserTwapSliceFillsResponse,
} from "@nktkas/hyperliquid";
import type { RingBufferOptions } from "../internal/circular-buffer/ring-buffer";
import type { SubMethod } from "../types/clients";
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

function defineAccumulator<TEvent, TItem>(config: AccumulateConfig<TEvent, TItem>): AccumulateConfig {
	return config as AccumulateConfig;
}

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
	l2Book: 16,
};

export function getAccumulateConfig(method: SubMethod): AccumulateConfig | null {
	return ACCUMULATING_SUBS[method] ?? null;
}

export function getDefaultThrottle(method: SubMethod): number | undefined {
	return DEFAULT_THROTTLE[method];
}
