import { toBig } from "@/lib/trade/numbers";

export const LIVE_MARK_MAX_STALE_MS = 10_000;
export const LIVE_EXECUTION_PRICE_MAX_AGE_MS = 10_000;

export type MarkPriceStatus = "idle" | "loading" | "success" | "stale" | "error";

type SubscriptionStatus = "idle" | "subscribing" | "active" | "error";

export interface FastMarketPrice {
	markPx?: string;
	midPx?: string | null;
}

interface ResolveFastMarketPriceInput {
	coin: string;
	enabled: boolean;
	data: Readonly<Record<string, FastMarketPrice>> | undefined;
	subscriptionStatus: SubscriptionStatus;
	isStale: boolean;
	markReceivedAt: number | undefined;
	midReceivedAt: number | undefined;
	now?: number;
}

interface ActiveMarketPriceEvent {
	coin: string;
	ctx: FastMarketPrice;
}

interface ResolveActiveMarketPriceInput {
	coin: string;
	enabled: boolean;
	data: ActiveMarketPriceEvent | undefined;
	subscriptionStatus: SubscriptionStatus;
	isStale: boolean;
	lastMessageAt: number | undefined;
}

export interface LiveMarketPriceSnapshot {
	markPx: string | undefined;
	midPx: string | null | undefined;
	status: MarkPriceStatus;
	receivedAt: number | undefined;
	midReceivedAt: number | undefined;
}

function getPositivePrice(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	return toBig(value)?.gt(0) ? value : undefined;
}

export function resolveFastMarketPrice({
	coin,
	enabled,
	data,
	subscriptionStatus,
	isStale,
	markReceivedAt,
	midReceivedAt,
	now = Date.now(),
}: ResolveFastMarketPriceInput): LiveMarketPriceSnapshot {
	const fastPrice = data?.[coin];
	const markPx = getPositivePrice(fastPrice?.markPx);
	const rawMidPx = fastPrice?.midPx === null ? null : getPositivePrice(fastPrice?.midPx);
	const midAge = midReceivedAt === undefined ? null : now - midReceivedAt;
	const midPx = midAge !== null && midAge >= 0 && midAge <= LIVE_MARK_MAX_STALE_MS ? rawMidPx : undefined;

	if (!enabled) return { markPx, midPx, status: "idle", receivedAt: markReceivedAt, midReceivedAt };
	if (subscriptionStatus === "error") {
		return { markPx, midPx, status: "error", receivedAt: markReceivedAt, midReceivedAt };
	}
	if (subscriptionStatus !== "active" || !data) {
		return { markPx, midPx, status: "loading", receivedAt: markReceivedAt, midReceivedAt };
	}
	if (!markPx) return { markPx, midPx, status: "error", receivedAt: markReceivedAt, midReceivedAt };
	if (markReceivedAt === undefined) {
		return { markPx, midPx, status: "loading", receivedAt: markReceivedAt, midReceivedAt };
	}
	const markAge = now - markReceivedAt;
	const isMarkStale = markAge < 0 || markAge > LIVE_MARK_MAX_STALE_MS;

	return {
		markPx,
		midPx,
		status: isStale || isMarkStale ? "stale" : "success",
		receivedAt: markReceivedAt,
		midReceivedAt,
	};
}

export function resolveActiveMarketPrice({
	coin,
	enabled,
	data,
	subscriptionStatus,
	isStale,
	lastMessageAt,
}: ResolveActiveMarketPriceInput): LiveMarketPriceSnapshot {
	const matchesCoin = data?.coin === coin;
	const markPx = matchesCoin ? getPositivePrice(data.ctx.markPx) : undefined;
	const midPx = matchesCoin ? (data.ctx.midPx === null ? null : getPositivePrice(data.ctx.midPx)) : undefined;

	const midReceivedAt = midPx !== undefined ? lastMessageAt : undefined;
	if (!enabled) return { markPx, midPx, status: "idle", receivedAt: lastMessageAt, midReceivedAt };
	if (subscriptionStatus === "error") {
		return { markPx, midPx, status: "error", receivedAt: lastMessageAt, midReceivedAt };
	}
	if (subscriptionStatus !== "active" || !data || !matchesCoin) {
		return { markPx, midPx, status: "loading", receivedAt: lastMessageAt, midReceivedAt };
	}
	if (!markPx) return { markPx, midPx, status: "error", receivedAt: lastMessageAt, midReceivedAt };

	return {
		markPx,
		midPx,
		status: isStale ? "stale" : "success",
		receivedAt: lastMessageAt,
		midReceivedAt,
	};
}

export function isLiveMarkPriceReady(
	status: MarkPriceStatus,
	markPx: string | undefined,
	receivedAt: number | undefined,
	now = Date.now(),
): boolean {
	if (status !== "success" || !getPositivePrice(markPx) || receivedAt === undefined) return false;
	const age = now - receivedAt;
	return age >= 0 && age <= LIVE_MARK_MAX_STALE_MS;
}

export function isLiveExecutionPriceReceiptFresh(receivedAt: number | undefined, now = performance.now()): boolean {
	if (receivedAt === undefined || !Number.isFinite(receivedAt) || !Number.isFinite(now)) return false;
	const age = now - receivedAt;
	return age >= 0 && age <= LIVE_EXECUTION_PRICE_MAX_AGE_MS;
}
