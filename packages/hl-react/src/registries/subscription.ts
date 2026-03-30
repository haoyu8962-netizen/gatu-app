import type { TradesWsEvent } from "@nktkas/hyperliquid";
import type { RingBufferOptions } from "../internal/circular-buffer";
import type { SubMethod } from "../types/clients";

type RawTrade = TradesWsEvent[number];

interface AccumulateConfig<TEvent = unknown, TItem = unknown> {
	getItems: (event: TEvent) => TItem[];
	withItems: (event: TEvent, items: TItem[]) => TEvent;
	isSnapshot: (event: TEvent) => boolean;
	buffer: RingBufferOptions<TItem>;
}

// biome-ignore lint/suspicious/noExplicitAny: registry values are typed at usage via SubEvent<M>
const ACCUMULATING_SUBS: Partial<Record<SubMethod, AccumulateConfig<any, any>>> = {
	trades: {
		getItems: (event: unknown[]) => event,
		withItems: (_: unknown, items: unknown[]) => items,
		isSnapshot: () => false,
		buffer: {
			maxSize: 100,
			getKey: (t: RawTrade) => `${t.hash}:${t.tid}`,
			compare: (a: RawTrade, b: RawTrade) => b.time - a.time,
		},
	},
	userFills: {
		getItems: (event: { fills: unknown[] }) => event.fills,
		withItems: (event: { fills: unknown[] }, items: unknown[]) => ({ ...event, fills: items }),
		isSnapshot: (event: { isSnapshot?: boolean }) => event.isSnapshot === true,
		buffer: {
			maxSize: 200,
			getKey: (f: { tid: number }) => String(f.tid),
			compare: (a: { time: number }, b: { time: number }) => b.time - a.time,
		},
	},
	userFundings: {
		getItems: (event: { fundings: unknown[] }) => event.fundings,
		withItems: (event: { fundings: unknown[] }, items: unknown[]) => ({ ...event, fundings: items }),
		isSnapshot: (event: { isSnapshot?: boolean }) => event.isSnapshot === true,
		buffer: {
			maxSize: 500,
			getKey: (f: { time: number; coin: string }) => `${f.time}-${f.coin}`,
			compare: (a: { time: number }, b: { time: number }) => b.time - a.time,
		},
	},
	userHistoricalOrders: {
		getItems: (event: { orderHistory: unknown[] }) => event.orderHistory,
		withItems: (event: { orderHistory: unknown[] }, items: unknown[]) => ({
			...event,
			orderHistory: items,
		}),
		isSnapshot: (event: { isSnapshot?: boolean }) => event.isSnapshot === true,
		buffer: {
			maxSize: 500,
			getKey: (o: { order: { oid: number } }) => String(o.order.oid),
			compare: (a: { statusTimestamp: number }, b: { statusTimestamp: number }) =>
				b.statusTimestamp - a.statusTimestamp,
		},
	},
	userNonFundingLedgerUpdates: {
		getItems: (event: { nonFundingLedgerUpdates: unknown[] }) => event.nonFundingLedgerUpdates,
		withItems: (event: { nonFundingLedgerUpdates: unknown[] }, items: unknown[]) => ({
			...event,
			nonFundingLedgerUpdates: items,
		}),
		isSnapshot: (event: { isSnapshot?: boolean }) => event.isSnapshot === true,
		buffer: {
			maxSize: 500,
			getKey: (u: { hash: string }) => u.hash,
			compare: (a: { time: number }, b: { time: number }) => b.time - a.time,
		},
	},
	userTwapHistory: {
		getItems: (event: { history: unknown[] }) => event.history,
		withItems: (event: { history: unknown[] }, items: unknown[]) => ({ ...event, history: items }),
		isSnapshot: (event: { isSnapshot?: boolean }) => event.isSnapshot === true,
		buffer: {
			maxSize: 200,
			getKey: (h: { twapId?: number | null; time: number; state: { coin: string } }) =>
				h.twapId != null ? String(h.twapId) : `${h.time}-${h.state.coin}`,
			compare: (a: { time: number }, b: { time: number }) => b.time - a.time,
			shouldReplace: (existing: { time: number }, incoming: { time: number }) => incoming.time >= existing.time,
		},
	},
	userTwapSliceFills: {
		getItems: (event: { twapSliceFills: unknown[] }) => event.twapSliceFills,
		withItems: (event: { twapSliceFills: unknown[] }, items: unknown[]) => ({
			...event,
			twapSliceFills: items,
		}),
		isSnapshot: (event: { isSnapshot?: boolean }) => event.isSnapshot === true,
		buffer: {
			maxSize: 200,
			getKey: (f: { fill: { tid: number } }) => String(f.fill.tid),
			compare: (a: { fill: { time: number } }, b: { fill: { time: number } }) => b.fill.time - a.fill.time,
		},
	},
};

const DEFAULT_THROTTLE: Partial<Record<SubMethod, number>> = {
	l2Book: 16,
};

export function getAccumulateConfig(method: SubMethod) {
	return ACCUMULATING_SUBS[method] ?? null;
}

export function getDefaultThrottle(method: SubMethod): number | undefined {
	return DEFAULT_THROTTLE[method];
}
