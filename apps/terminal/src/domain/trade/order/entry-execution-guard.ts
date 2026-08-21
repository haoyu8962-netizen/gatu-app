import type { OrderParameters, TwapOrderParameters } from "@nktkas/hyperliquid";
import Big from "big.js";
import {
	MARKET_ORDER_SLIPPAGE_MAX_PERCENT,
	TWAP_MIN_NOTIONAL_USD,
	TWAP_MINUTES_MAX,
	TWAP_MINUTES_MIN,
} from "@/config/trade";
import { isLiveMarkPriceReady, type MarkPriceStatus } from "@/domain/trade/market-price";
import { formatPriceForOrder } from "@/domain/trade/orders";
import type { AssetAvailabilityStatus } from "./availability";

export interface EntryOrderExecutionState {
	active: boolean;
	assetId: number | undefined;
	szDecimals: number | undefined;
	availabilityStatus: AssetAvailabilityStatus;
	availabilityReceivedAt: number | undefined;
	availabilityMaxAgeMs: number;
	availability: EntryOrderExecutionAvailability;
	markPriceStatus: MarkPriceStatus;
	markPx: string | undefined;
	markPriceReceivedAt: number | undefined;
	executionReferencePx: string | undefined;
	executionPriceReceivedAt: number | undefined;
	slippageBps: number;
}

export type EntryOrderExecutionAvailability =
	| { kind: "perp"; maxBaseBySide: { buy: string | undefined; sell: string | undefined } }
	| { kind: "spot"; baseAvailable: string; quoteAvailable: string };

function isFrontendMarketOrder(order: OrderParameters["orders"][number]): boolean {
	return "limit" in order.t && order.t.limit.tif === "FrontendMarket";
}

function isEntryTriggerOrder(params: OrderParameters): boolean {
	return params.grouping === "na" && params.orders.length === 1 && "trigger" in params.orders[0].t;
}

function assertMarketCapStillSafe(
	order: OrderParameters["orders"][number],
	state: EntryOrderExecutionState,
	now: number,
): void {
	if (typeof state.assetId !== "number" || !Number.isSafeInteger(state.assetId)) {
		throw new Error("Order no longer matches the selected market");
	}
	if (!isLiveMarkPriceReady(state.markPriceStatus, state.executionReferencePx, state.executionPriceReceivedAt, now)) {
		throw new Error("Live execution price is unavailable");
	}
	const reference = state.executionReferencePx ? new Big(state.executionReferencePx) : null;
	const submitted = new Big(order.p);
	if (!reference?.gt(0) || !submitted.gt(0)) throw new Error("Live execution price is unavailable");
	if (
		!Number.isFinite(state.slippageBps) ||
		state.slippageBps < 0 ||
		state.slippageBps > MARKET_ORDER_SLIPPAGE_MAX_PERCENT * 100
	) {
		throw new Error("Market slippage setting is invalid");
	}

	const multiplier = order.b
		? Big(1).plus(Big(state.slippageBps).div(10_000))
		: Big(1).minus(Big(state.slippageBps).div(10_000));
	const currentLimit = new Big(
		formatPriceForOrder(reference.times(multiplier), {
			assetId: state.assetId,
			szDecimals: state.szDecimals ?? 0,
		}),
	);
	const safe = order.b ? submitted.lte(currentLimit) : submitted.gte(currentLimit);
	if (!safe) throw new Error("Market price moved beyond the confirmed slippage limit");
}

function assertTriggerOrderDirection(order: OrderParameters["orders"][number], referencePx: string | undefined): void {
	if (!("trigger" in order.t)) return;
	const mark = referencePx ? new Big(referencePx) : null;
	const trigger = new Big(order.t.trigger.triggerPx);
	if (!mark?.gt(0) || !trigger.gt(0)) throw new Error("Live mark price is unavailable");

	const isTakeProfit = order.t.trigger.tpsl === "tp";
	const directionValid = isTakeProfit
		? order.b
			? trigger.lt(mark)
			: trigger.gt(mark)
		: order.b
			? trigger.gt(mark)
			: trigger.lt(mark);
	if (!directionValid) throw new Error("Trigger price is no longer valid against the live mark price");
}

function assertAttachedTriggerDirections(params: OrderParameters, state: EntryOrderExecutionState): void {
	if (params.grouping !== "normalTpsl") return;
	if (params.orders.length < 2 || params.orders.length > 3) {
		throw new Error("Attached TP/SL order structure is invalid");
	}
	const parent = params.orders[0];
	if (!("limit" in parent.t)) throw new Error("Attached TP/SL parent order is invalid");
	const referencePx = isFrontendMarketOrder(parent) ? state.markPx : String(parent.p);
	const seenTypes = new Set<"tp" | "sl">();
	for (const order of params.orders.slice(1)) {
		if (
			!("trigger" in order.t) ||
			order.t.trigger.isMarket !== true ||
			order.b === parent.b ||
			order.r !== true ||
			!new Big(order.s).eq(parent.s) ||
			seenTypes.has(order.t.trigger.tpsl)
		) {
			throw new Error("Attached TP/SL order structure is invalid");
		}
		seenTypes.add(order.t.trigger.tpsl);
		assertTriggerOrderDirection(order, referencePx);
	}
}

function getPrimaryOrders(params: OrderParameters): OrderParameters["orders"] {
	if (params.grouping === "positionTpsl") throw new Error("Order entry grouping is invalid");
	return params.grouping === "normalTpsl" ? params.orders.slice(0, 1) : params.orders;
}

function assertOrderSizesWithinCurrentAvailability(params: OrderParameters, state: EntryOrderExecutionState): void {
	const totals = { buy: Big(0), sell: Big(0) };
	const quoteTotals = { buy: Big(0), sell: Big(0) };
	for (const order of getPrimaryOrders(params)) {
		const size = new Big(order.s);
		const price = new Big(order.p);
		if (!size.gt(0) || !price.gt(0)) throw new Error("Order size is invalid");
		const side = order.b ? "buy" : "sell";
		totals[side] = totals[side].plus(size);
		quoteTotals[side] = quoteTotals[side].plus(size.times(price));
	}
	if (state.availability.kind === "spot") {
		if (
			new Big(state.availability.quoteAvailable).lt(quoteTotals.buy) ||
			new Big(state.availability.baseAvailable).lt(totals.sell)
		) {
			throw new Error("Trading availability changed before submission");
		}
		return;
	}
	for (const side of ["buy", "sell"] as const) {
		if (totals[side].eq(0)) continue;
		const available = state.availability.maxBaseBySide[side];
		if (available === undefined || new Big(available).lt(totals[side])) {
			throw new Error("Trading availability changed before submission");
		}
	}
}

export function assertEntryOrderExecutionAllowed(
	params: OrderParameters,
	state: EntryOrderExecutionState,
	now = Date.now(),
): void {
	if (!state.active) throw new Error("Order entry is no longer active");
	if (
		typeof state.assetId !== "number" ||
		!Number.isSafeInteger(state.assetId) ||
		params.orders.length === 0 ||
		params.orders.some((order) => order.a !== state.assetId)
	) {
		throw new Error("Order no longer matches the selected market");
	}
	const availabilityAge =
		state.availabilityReceivedAt === undefined ? Number.POSITIVE_INFINITY : now - state.availabilityReceivedAt;
	if (
		state.availabilityStatus !== "success" ||
		!Number.isFinite(state.availabilityMaxAgeMs) ||
		state.availabilityMaxAgeMs <= 0 ||
		availabilityAge < 0 ||
		availabilityAge > state.availabilityMaxAgeMs
	) {
		throw new Error("Trading availability data is unavailable");
	}
	assertOrderSizesWithinCurrentAvailability(params, state);

	const marketOrders = params.orders.filter(isFrontendMarketOrder);
	const entryTrigger = isEntryTriggerOrder(params);
	const hasAttachedTriggers = params.grouping === "normalTpsl";
	if (marketOrders.length === 0 && !entryTrigger && !hasAttachedTriggers) return;
	if (
		(marketOrders.length > 0 || entryTrigger) &&
		!isLiveMarkPriceReady(state.markPriceStatus, state.markPx, state.markPriceReceivedAt, now)
	) {
		throw new Error("Live mark price is unavailable");
	}

	for (const order of marketOrders) assertMarketCapStillSafe(order, state, now);
	if (entryTrigger) assertTriggerOrderDirection(params.orders[0], state.markPx);
	assertAttachedTriggerDirections(params, state);
}

function assertTwapDetailsStillValid(params: TwapOrderParameters, state: EntryOrderExecutionState, now: number): void {
	const details = params.details;
	if (!details || (details.t === null && details.s === null)) return;
	if (!isLiveMarkPriceReady(state.markPriceStatus, state.markPx, state.markPriceReceivedAt, now) || !state.markPx) {
		throw new Error("Live mark price is unavailable");
	}
	const mark = new Big(state.markPx);
	if (details.t !== null) {
		const trigger = new Big(details.t.p);
		if (!trigger.gt(0) || trigger.eq(mark) || trigger.gt(mark) !== details.t.a) {
			throw new Error("Trigger price is no longer valid against the live mark price");
		}
	}
	if (details.s !== null) {
		const stop = new Big(details.s);
		const stopValid = params.twap.b ? stop.gt(mark) : stop.lt(mark);
		if (!stopValid) throw new Error("Stop price is no longer valid against the live mark price");
	}
}

function assertTwapSizeWithinCurrentAvailability(
	params: TwapOrderParameters,
	state: EntryOrderExecutionState,
	markPx: Big,
): void {
	const size = new Big(params.twap.s);
	if (!size.gt(0)) throw new Error("Trading availability changed before submission");

	const side = params.twap.b ? "buy" : "sell";
	if (state.availability.kind === "perp") {
		const available = state.availability.maxBaseBySide[side];
		if (available === undefined || new Big(available).lt(size)) {
			throw new Error("Trading availability changed before submission");
		}
		return;
	}

	if (!params.twap.b) {
		if (new Big(state.availability.baseAvailable).lt(size)) {
			throw new Error("Trading availability changed before submission");
		}
		return;
	}

	if (new Big(state.availability.quoteAvailable).lt(size.times(markPx))) {
		throw new Error("Trading availability changed before submission");
	}
}

function getFreshTwapMark(state: EntryOrderExecutionState, now: number): Big {
	if (!isLiveMarkPriceReady(state.markPriceStatus, state.markPx, state.markPriceReceivedAt, now) || !state.markPx) {
		throw new Error("Live mark price is unavailable");
	}
	const mark = new Big(state.markPx);
	if (!mark.gt(0)) throw new Error("Live mark price is unavailable");
	return mark;
}

function assertTwapProtocolLimits(params: TwapOrderParameters, markPx: Big): void {
	const minutes = Number(params.twap.m);
	if (!Number.isSafeInteger(minutes) || minutes < TWAP_MINUTES_MIN || minutes > TWAP_MINUTES_MAX) {
		throw new Error(`TWAP duration must be ${TWAP_MINUTES_MIN}-${TWAP_MINUTES_MAX} minutes`);
	}
	const size = new Big(params.twap.s);
	if (!size.gt(0) || size.times(markPx).lt(TWAP_MIN_NOTIONAL_USD)) {
		throw new Error(`TWAP order value must be at least $${TWAP_MIN_NOTIONAL_USD}`);
	}
}

export function assertEntryTwapExecutionAllowed(
	params: TwapOrderParameters,
	state: EntryOrderExecutionState,
	now = Date.now(),
): void {
	if (!state.active || typeof state.assetId !== "number" || Number(params.twap.a) !== state.assetId) {
		throw new Error("TWAP no longer matches the selected market");
	}
	const availabilityAge =
		state.availabilityReceivedAt === undefined ? Number.POSITIVE_INFINITY : now - state.availabilityReceivedAt;
	if (
		state.availabilityStatus !== "success" ||
		!Number.isFinite(state.availabilityMaxAgeMs) ||
		state.availabilityMaxAgeMs <= 0 ||
		availabilityAge < 0 ||
		availabilityAge > state.availabilityMaxAgeMs
	) {
		throw new Error("Trading availability data is unavailable");
	}
	const markPx = getFreshTwapMark(state, now);
	assertTwapProtocolLimits(params, markPx);
	assertTwapSizeWithinCurrentAvailability(params, state, markPx);
	assertTwapDetailsStillValid(params, state, now);
}
