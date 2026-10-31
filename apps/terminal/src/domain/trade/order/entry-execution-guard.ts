import type { OrderParameters, TwapOrderParameters } from "@nktkas/hyperliquid";
import Big from "big.js";
import {
	MARKET_ORDER_SLIPPAGE_MAX_PERCENT,
	TWAP_MIN_NOTIONAL_USD,
	TWAP_MINUTES_MAX,
	TWAP_MINUTES_MIN,
} from "@/config/trade";
import { isLiveMarkPriceReady, type MarkPriceStatus } from "@/domain/trade/market-price";
import { isOpenInterestCapRestrictedOrderRequest } from "@/domain/trade/open-interest-cap";
import { isValidSizeDecimalsForAsset } from "@/domain/trade/orders";
import type { AssetAvailabilityStatus } from "./availability";

import { getReduceOnlyCapacity } from "./reduce-only";
import { getRestingMarginPrice } from "./size";

export { ENTRY_POSITION_MAX_AGE_MS } from "./reduce-only";

export type EntryExecutionErrorReason =
	| "execution-price-unavailable"
	| "inactive"
	| "mark-price-unavailable"
	| "market-context-mismatch"
	| "open-interest-capped"
	| "order-request-invalid"
	| "position-data-unavailable"
	| "reduce-only-position-changed"
	| "slippage-limit-exceeded"
	| "slippage-setting-invalid"
	| "stop-price-invalidated"
	| "trading-availability-changed"
	| "trading-availability-unavailable"
	| "trigger-price-invalidated"
	| "twap-duration-invalid"
	| "twap-notional-too-small";

const ENTRY_EXECUTION_ERROR_MESSAGES: Record<EntryExecutionErrorReason, string> = {
	"execution-price-unavailable": "Live execution price is unavailable",
	inactive: "Order entry is no longer active",
	"mark-price-unavailable": "Live mark price is unavailable",
	"market-context-mismatch": "Order no longer matches the selected market",
	"open-interest-capped":
		"The limit order would be canceled after resting because open interest is capped. Use market orders to close positions.",
	"order-request-invalid": "Order request is invalid",
	"position-data-unavailable": "Live position data is unavailable",
	"reduce-only-position-changed": "Reduce-only order no longer matches the current position",
	"slippage-limit-exceeded": "Market price moved beyond the confirmed slippage limit",
	"slippage-setting-invalid": "Market slippage setting is invalid",
	"stop-price-invalidated": "Stop price is no longer valid against the live mark price",
	"trading-availability-changed": "Trading availability changed before submission",
	"trading-availability-unavailable": "Trading availability data is unavailable",
	"trigger-price-invalidated": "Trigger price is no longer valid against the live mark price",
	"twap-duration-invalid": `TWAP duration must be ${TWAP_MINUTES_MIN}-${TWAP_MINUTES_MAX} minutes`,
	"twap-notional-too-small": `TWAP order value must be at least $${TWAP_MIN_NOTIONAL_USD}`,
};

export class EntryExecutionError extends Error {
	constructor(
		readonly reason: EntryExecutionErrorReason,
		message = ENTRY_EXECUTION_ERROR_MESSAGES[reason],
	) {
		super(message);
		this.name = "EntryExecutionError";
	}
}

function failEntryExecution(reason: EntryExecutionErrorReason, message?: string): never {
	throw new EntryExecutionError(reason, message);
}

function readEntryBig(value: unknown, reason: EntryExecutionErrorReason): Big {
	try {
		return new Big(String(value));
	} catch {
		return failEntryExecution(reason);
	}
}

export interface EntryOrderExecutionState {
	active: boolean;
	assetId: number | undefined;
	szDecimals: number | undefined;
	availabilityStatus: AssetAvailabilityStatus;
	availabilityReceivedAt: number | undefined;
	availabilityMaxAgeMs: number;
	availability: EntryOrderExecutionAvailability;
	positionStateReady: boolean;
	positionReceivedAt: number | undefined;
	positionSignedSize: string | undefined;
	markPriceStatus: MarkPriceStatus;
	markPx: string | undefined;
	markPriceReceivedAt: number | undefined;
	executionReferencePx: string | undefined;
	executionPriceReceivedAt: number | undefined;
	slippageBps: number;
	openInterestCapped: boolean;
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

function assertReduceOnlyPosition(
	orders: readonly { b: boolean; r: boolean; s: string | number }[],
	state: EntryOrderExecutionState,
	now: number,
): void {
	let total = Big(0);
	for (const order of orders) {
		if (!order.r) continue;
		if (state.availability.kind !== "perp") failEntryExecution("order-request-invalid");
		const capacity = getReduceOnlyCapacity(
			true,
			order.b ? "buy" : "sell",
			{
				ready: state.positionStateReady,
				receivedAt: state.positionReceivedAt,
				signedSize: state.positionSignedSize,
			},
			state.szDecimals ?? -1,
			now,
		);
		if (capacity.status === "unavailable") failEntryExecution("position-data-unavailable");
		const size = readEntryBig(order.s, "order-request-invalid");
		if (!size.gt(0) || !size.eq(size.round(state.szDecimals, Big.roundDown)))
			failEntryExecution("order-request-invalid");
		total = total.plus(size);
		if (capacity.status !== "ready" || total.gt(capacity.maxBase)) failEntryExecution("reduce-only-position-changed");
	}
}

function assertMarketCapStillSafe(
	order: OrderParameters["orders"][number],
	state: EntryOrderExecutionState,
	now: number,
): void {
	if (typeof state.assetId !== "number" || !Number.isSafeInteger(state.assetId)) {
		failEntryExecution("market-context-mismatch");
	}
	if (!isLiveMarkPriceReady(state.markPriceStatus, state.executionReferencePx, state.executionPriceReceivedAt, now)) {
		failEntryExecution("execution-price-unavailable");
	}
	const reference = state.executionReferencePx
		? readEntryBig(state.executionReferencePx, "execution-price-unavailable")
		: null;
	const submitted = readEntryBig(order.p, "order-request-invalid");
	if (!reference?.gt(0)) failEntryExecution("execution-price-unavailable");
	if (!submitted.gt(0)) failEntryExecution("order-request-invalid");
	if (!isValidSizeDecimalsForAsset(state.assetId, state.szDecimals ?? 0)) {
		failEntryExecution("market-context-mismatch");
	}
	if (
		!Number.isFinite(state.slippageBps) ||
		state.slippageBps < 0 ||
		state.slippageBps > MARKET_ORDER_SLIPPAGE_MAX_PERCENT * 100
	) {
		failEntryExecution("slippage-setting-invalid");
	}

	const multiplier = order.b
		? Big(1).plus(Big(state.slippageBps).div(10_000))
		: Big(1).minus(Big(state.slippageBps).div(10_000));
	const currentLimit = reference.times(multiplier);
	const safe = order.b ? submitted.lte(currentLimit) : submitted.gte(currentLimit);
	if (!safe) failEntryExecution("slippage-limit-exceeded");
}

function assertTriggerOrderDirection(order: OrderParameters["orders"][number], referencePx: string | undefined): void {
	if (!("trigger" in order.t)) return;
	const mark = referencePx ? readEntryBig(referencePx, "mark-price-unavailable") : null;
	const trigger = readEntryBig(order.t.trigger.triggerPx, "order-request-invalid");
	if (!mark?.gt(0)) failEntryExecution("mark-price-unavailable");
	if (!trigger.gt(0)) failEntryExecution("order-request-invalid");

	const isTakeProfit = order.t.trigger.tpsl === "tp";
	const directionValid = isTakeProfit
		? order.b
			? trigger.lt(mark)
			: trigger.gt(mark)
		: order.b
			? trigger.gt(mark)
			: trigger.lt(mark);
	if (!directionValid) failEntryExecution("trigger-price-invalidated");
}

function assertAttachedTriggerDirections(params: OrderParameters, state: EntryOrderExecutionState): void {
	if (params.grouping !== "normalTpsl") return;
	if (params.orders.length < 2 || params.orders.length > 3) {
		failEntryExecution("order-request-invalid", "Attached TP/SL order structure is invalid");
	}
	const parent = params.orders[0];
	if (!("limit" in parent.t)) failEntryExecution("order-request-invalid", "Attached TP/SL parent order is invalid");
	const referencePx = isFrontendMarketOrder(parent) ? state.executionReferencePx : String(parent.p);
	const seenTypes = new Set<"tp" | "sl">();
	for (const order of params.orders.slice(1)) {
		if (
			!("trigger" in order.t) ||
			order.t.trigger.isMarket !== true ||
			order.b === parent.b ||
			order.r !== true ||
			!readEntryBig(order.s, "order-request-invalid").eq(readEntryBig(parent.s, "order-request-invalid")) ||
			seenTypes.has(order.t.trigger.tpsl)
		) {
			failEntryExecution("order-request-invalid", "Attached TP/SL order structure is invalid");
		}
		seenTypes.add(order.t.trigger.tpsl);
		assertTriggerOrderDirection(order, referencePx);
	}
}

function getPrimaryOrders(params: OrderParameters): OrderParameters["orders"] {
	if (params.grouping === "positionTpsl") failEntryExecution("order-request-invalid");
	return params.grouping === "normalTpsl" ? params.orders.slice(0, 1) : params.orders;
}

/**
 * The live mark a resting perp order's margin is valued at. Without one, sizes are compared with the
 * exchange's maximum at mark, as before: stricter for a buy below mark, and for a sell above mark no
 * stricter than the exchange's own margin check, which still rejects an order that does not fit.
 * Limit orders deliberately need no live mark.
 */
function readLiveMark(state: EntryOrderExecutionState, now: number): Big | null {
	if (!isLiveMarkPriceReady(state.markPriceStatus, state.markPx, state.markPriceReceivedAt, now)) return null;
	const mark = readEntryBig(state.markPx, "mark-price-unavailable");
	return mark.gt(0) ? mark : null;
}

function assertOrderSizesWithinCurrentAvailability(
	params: OrderParameters,
	state: EntryOrderExecutionState,
	now: number,
): void {
	const totals = { buy: Big(0), sell: Big(0) };
	const quoteTotals = { buy: Big(0), sell: Big(0) };
	const marginTotals = { buy: Big(0), sell: Big(0) };
	const mark = state.availability.kind === "perp" ? readLiveMark(state, now) : null;
	for (const order of getPrimaryOrders(params)) {
		const size = readEntryBig(order.s, "order-request-invalid");
		const price = readEntryBig(order.p, "order-request-invalid");
		if (!size.gt(0) || !price.gt(0)) failEntryExecution("order-request-invalid");
		if (order.r && state.availability.kind === "perp") continue;
		const side = order.b ? "buy" : "sell";
		totals[side] = totals[side].plus(size);
		quoteTotals[side] = quoteTotals[side].plus(size.times(price));
		if (mark) {
			const marginPx = isFrontendMarketOrder(order) ? mark : getRestingMarginPrice(side, mark, price);
			marginTotals[side] = marginTotals[side].plus(size.times(marginPx));
		}
	}
	if (state.availability.kind === "spot") {
		if (
			readEntryBig(state.availability.quoteAvailable, "trading-availability-unavailable").lt(quoteTotals.buy) ||
			readEntryBig(state.availability.baseAvailable, "trading-availability-unavailable").lt(totals.sell)
		) {
			failEntryExecution("trading-availability-changed");
		}
		return;
	}
	if (isEntryTriggerOrder(params)) return;
	for (const side of ["buy", "sell"] as const) {
		if (totals[side].eq(0)) continue;
		const available = state.availability.maxBaseBySide[side];
		if (available === undefined) failEntryExecution("trading-availability-changed");
		const maxSize = readEntryBig(available, "trading-availability-unavailable");
		const exceeds = mark ? maxSize.times(mark).lt(marginTotals[side]) : maxSize.lt(totals[side]);
		if (exceeds) failEntryExecution("trading-availability-changed");
	}
}

export function assertEntryOrderExecutionAllowed(
	params: OrderParameters,
	state: EntryOrderExecutionState,
	now = Date.now(),
): void {
	if (!state.active) failEntryExecution("inactive");
	if (
		typeof state.assetId !== "number" ||
		!Number.isSafeInteger(state.assetId) ||
		params.orders.length === 0 ||
		params.orders.some((order) => order.a !== state.assetId)
	) {
		failEntryExecution("market-context-mismatch");
	}
	if (state.openInterestCapped && isOpenInterestCapRestrictedOrderRequest(params)) {
		failEntryExecution("open-interest-capped");
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
		failEntryExecution("trading-availability-unavailable");
	}
	assertReduceOnlyPosition(getPrimaryOrders(params), state, now);
	assertOrderSizesWithinCurrentAvailability(params, state, now);

	const marketOrders = params.orders.filter(isFrontendMarketOrder);
	const entryTrigger = isEntryTriggerOrder(params);
	const hasAttachedTriggers = params.grouping === "normalTpsl";
	if (marketOrders.length === 0 && !entryTrigger && !hasAttachedTriggers) return;
	if (
		(marketOrders.length > 0 || entryTrigger) &&
		!isLiveMarkPriceReady(state.markPriceStatus, state.markPx, state.markPriceReceivedAt, now)
	) {
		failEntryExecution("mark-price-unavailable");
	}

	for (const order of marketOrders) assertMarketCapStillSafe(order, state, now);
	if (entryTrigger) assertTriggerOrderDirection(params.orders[0], state.markPx);
	assertAttachedTriggerDirections(params, state);
}

function assertTwapDetailsStillValid(params: TwapOrderParameters, state: EntryOrderExecutionState, now: number): void {
	const details = params.details;
	if (!details || (details.t === null && details.s === null)) return;
	if (!isLiveMarkPriceReady(state.markPriceStatus, state.markPx, state.markPriceReceivedAt, now) || !state.markPx) {
		failEntryExecution("mark-price-unavailable");
	}
	const mark = readEntryBig(state.markPx, "mark-price-unavailable");
	let stopReference = mark;
	if (details.t !== null) {
		const trigger = readEntryBig(details.t.p, "order-request-invalid");
		if (!trigger.gt(0) || trigger.eq(mark) || trigger.gt(mark) !== details.t.a) {
			failEntryExecution("trigger-price-invalidated");
		}
		stopReference = trigger;
	}
	if (details.s !== null) {
		const stop = readEntryBig(details.s, "order-request-invalid");
		const stopValid = params.twap.b ? stop.gt(stopReference) : stop.lt(stopReference);
		if (!stopValid) failEntryExecution("stop-price-invalidated");
	}
}

function assertTwapSizeWithinCurrentAvailability(
	params: TwapOrderParameters,
	state: EntryOrderExecutionState,
	markPx: Big,
): void {
	const size = readEntryBig(params.twap.s, "order-request-invalid");
	if (!size.gt(0)) failEntryExecution("order-request-invalid");

	const side = params.twap.b ? "buy" : "sell";
	if (state.availability.kind === "perp") {
		const available = state.availability.maxBaseBySide[side];
		if (available === undefined) failEntryExecution("trading-availability-changed");
		if (readEntryBig(available, "trading-availability-unavailable").lt(size)) {
			failEntryExecution("trading-availability-changed");
		}
		return;
	}

	if (!params.twap.b) {
		if (readEntryBig(state.availability.baseAvailable, "trading-availability-unavailable").lt(size)) {
			failEntryExecution("trading-availability-changed");
		}
		return;
	}

	if (readEntryBig(state.availability.quoteAvailable, "trading-availability-unavailable").lt(size.times(markPx))) {
		failEntryExecution("trading-availability-changed");
	}
}

function getFreshTwapMark(state: EntryOrderExecutionState, now: number): Big {
	if (!isLiveMarkPriceReady(state.markPriceStatus, state.markPx, state.markPriceReceivedAt, now) || !state.markPx) {
		failEntryExecution("mark-price-unavailable");
	}
	const mark = readEntryBig(state.markPx, "mark-price-unavailable");
	if (!mark.gt(0)) failEntryExecution("mark-price-unavailable");
	return mark;
}

function assertTwapProtocolLimits(params: TwapOrderParameters, markPx: Big): void {
	const minutes = Number(params.twap.m);
	if (!Number.isSafeInteger(minutes) || minutes < TWAP_MINUTES_MIN || minutes > TWAP_MINUTES_MAX) {
		failEntryExecution("twap-duration-invalid");
	}
	const size = readEntryBig(params.twap.s, "order-request-invalid");
	if (!size.gt(0) || size.times(markPx).lt(TWAP_MIN_NOTIONAL_USD)) {
		failEntryExecution("twap-notional-too-small");
	}
}

export function assertEntryTwapExecutionAllowed(
	params: TwapOrderParameters,
	state: EntryOrderExecutionState,
	now = Date.now(),
): void {
	if (!state.active || typeof state.assetId !== "number" || Number(params.twap.a) !== state.assetId) {
		failEntryExecution("market-context-mismatch");
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
		failEntryExecution("trading-availability-unavailable");
	}
	const markPx = getFreshTwapMark(state, now);
	assertTwapProtocolLimits(params, markPx);
	assertReduceOnlyPosition([params.twap], state, now);
	if (!params.twap.r) assertTwapSizeWithinCurrentAvailability(params, state, markPx);
	assertTwapDetailsStillValid(params, state, now);
}
