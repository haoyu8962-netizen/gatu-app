import type { HistoricalOrdersResponse, TwapHistoryResponse } from "@nktkas/hyperliquid";
import Big from "big.js";
import { isCanceledOrderStatus } from "@/domain/trade/order-tracking";

const MILLISECONDS_PER_SECOND = 1000;

type HistoricalOrder = HistoricalOrdersResponse[number];
export type TwapHistoryEntry = TwapHistoryResponse[number];
export type TwapHistoryStatus = TwapHistoryEntry["status"]["status"];
export type OrderHistoryStatusCategory = "open" | "filled" | "triggered" | "canceled" | "rejected" | "other";

interface OrderHistoryEntryBase {
	coin: string;
	createdAt: number;
	key: string;
	reduceOnly: boolean;
	side: "A" | "B";
	size: string;
	updatedAt: number;
}

export type OrderHistoryEntry =
	| (OrderHistoryEntryBase & {
			kind: "order";
			order: HistoricalOrder;
			type: HistoricalOrder["order"]["orderType"];
	  })
	| (OrderHistoryEntryBase & {
			kind: "twap";
			twap: TwapHistoryEntry;
			type: "twap";
	  });

const TWAP_HISTORY_STATUSES: ReadonlySet<TwapHistoryStatus> = new Set([
	"activated",
	"error",
	"finished",
	"stopped",
	"terminated",
	"waitingForTrigger",
]);

export function isValidTwapHistoryItem(item: unknown): item is TwapHistoryEntry {
	if (!isRecord(item) || !isRecord(item.state) || !isRecord(item.status)) return false;
	const { state, status } = item;
	return (
		isSafeNonNegativeInteger(item.time) &&
		Number.isSafeInteger(item.time * MILLISECONDS_PER_SECOND) &&
		(item.twapId === undefined || isSafeNonNegativeInteger(item.twapId)) &&
		typeof state.coin === "string" &&
		state.coin.length > 0 &&
		typeof state.executedNtl === "string" &&
		typeof state.executedSz === "string" &&
		typeof state.minutes === "number" &&
		Number.isSafeInteger(state.minutes) &&
		state.minutes > 0 &&
		typeof state.randomize === "boolean" &&
		typeof state.reduceOnly === "boolean" &&
		(state.side === "A" || state.side === "B") &&
		(state.stopPx === null || typeof state.stopPx === "string") &&
		typeof state.sz === "string" &&
		isSafeNonNegativeInteger(state.timestamp) &&
		(state.trigger === null ||
			(isRecord(state.trigger) && typeof state.trigger.px === "string" && typeof state.trigger.above === "boolean")) &&
		typeof state.user === "string" &&
		typeof status.status === "string" &&
		TWAP_HISTORY_STATUSES.has(status.status as TwapHistoryStatus) &&
		(status.status !== "error" || typeof status.description === "string")
	);
}

export function getTwapHistoryKey(entry: TwapHistoryEntry): string {
	return entry.twapId === undefined
		? `${entry.state.timestamp}:${entry.state.coin}:${entry.state.side}:${entry.state.sz}`
		: String(entry.twapId);
}

export function mergeTwapHistorySources(
	...sources: ReadonlyArray<TwapHistoryResponse | undefined>
): TwapHistoryResponse {
	const historyById = new Map<string, TwapHistoryEntry>();

	for (const source of sources) {
		for (const incoming of source ?? []) {
			const key = getTwapHistoryKey(incoming);
			const existing = historyById.get(key);
			if (!existing || incoming.time >= existing.time) historyById.set(key, incoming);
		}
	}

	return [...historyById.values()].sort((left, right) => right.time - left.time);
}

export function mergeTwapHistoryEventSources(
	...sources: ReadonlyArray<TwapHistoryResponse | undefined>
): TwapHistoryResponse {
	const historyByEvent = new Map<string, TwapHistoryEntry>();

	for (const source of sources) {
		for (const incoming of source ?? []) {
			const key = `${getTwapHistoryKey(incoming)}:${incoming.time}:${incoming.status.status}`;
			historyByEvent.set(key, incoming);
		}
	}

	return [...historyByEvent.values()].sort((left, right) => right.time - left.time);
}

export function buildOrderHistoryEntries(
	orders: HistoricalOrdersResponse,
	twaps: TwapHistoryResponse,
): OrderHistoryEntry[] {
	const orderEntries: OrderHistoryEntry[] = orders.map((entry) => ({
		kind: "order",
		key: `order:${entry.order.oid}`,
		coin: entry.order.coin,
		createdAt: entry.order.timestamp,
		updatedAt: entry.statusTimestamp,
		reduceOnly: entry.order.reduceOnly,
		side: entry.order.side,
		size: entry.order.origSz,
		type: entry.order.orderType,
		order: entry,
	}));
	const twapEntries: OrderHistoryEntry[] = twaps.map((entry) => ({
		kind: "twap",
		key: `twap:${getTwapHistoryKey(entry)}`,
		coin: entry.state.coin,
		createdAt: entry.state.timestamp,
		updatedAt: getTwapHistoryTimeMs(entry),
		reduceOnly: entry.state.reduceOnly,
		side: entry.state.side,
		size: entry.state.sz,
		type: "twap",
		twap: entry,
	}));

	return [...orderEntries, ...twapEntries].sort((left, right) => right.updatedAt - left.updatedAt);
}

export function getTwapHistoryTimeMs(entry: TwapHistoryEntry): number {
	// The SDK exposes history `time` in Unix seconds, while state timestamps use milliseconds.
	return entry.time * MILLISECONDS_PER_SECOND;
}

export function getTwapAverageFillPrice(entry: TwapHistoryEntry): string | null {
	try {
		const executedSize = new Big(entry.state.executedSz);
		if (executedSize.lte(0)) return null;
		return new Big(entry.state.executedNtl).div(executedSize).toString();
	} catch {
		return null;
	}
}

export function getTwapHistoryDurationMs(entry: TwapHistoryEntry): number {
	if (entry.status.status === "activated" || entry.status.status === "waitingForTrigger") {
		return entry.state.minutes * 60_000;
	}

	return Math.max(0, getTwapHistoryTimeMs(entry) - entry.state.timestamp);
}

export function getOrderHistoryStatusCategory(entry: OrderHistoryEntry): OrderHistoryStatusCategory {
	if (entry.kind === "twap") {
		switch (entry.twap.status.status) {
			case "activated":
			case "waitingForTrigger":
				return "open";
			case "finished":
				return "filled";
			case "stopped":
			case "terminated":
				return "canceled";
			case "error":
				return "rejected";
		}
	}

	const status = entry.order.status;
	if (isCanceledOrderStatus(status)) return "canceled";
	if (status === "open" || status === "filled" || status === "triggered") return status;
	if (status === "rejected" || status.endsWith("Rejected")) return "rejected";
	return "other";
}

export function getOrderHistoryTriggerPrice(entry: OrderHistoryEntry): string | null {
	if (entry.kind === "twap") return entry.twap.state.trigger?.px ?? null;
	const { order } = entry.order;
	return order.isTrigger || order.orderType.startsWith("Stop ") || order.orderType.startsWith("Take Profit ")
		? order.triggerPx
		: null;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
