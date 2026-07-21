import Big from "big.js";
import type { ExchangeOrder, LimitTif, OrderType } from "@/config/trade";
import { getExecutedPrice, getTriggerMarketExecutionPrice } from "@/domain/trade/order/price";
import { buildOrders, formatPriceForOrder, formatSizeForOrder } from "@/domain/trade/orders";
import { isPositive, toBig } from "@/lib/trade/numbers";
import { isScaleOrderType, isStopOrderType, isTriggerOrderType, usesLimitPrice } from "@/lib/trade/order-types";
import type { Side } from "@/lib/trade/types";

export type OrderPlan = {
	orders: ExchangeOrder[];
	grouping: "na" | "normalTpsl" | "positionTpsl";
	errors: string[];
	warnings: string[];
};

export type EntryOrderIntent = {
	kind: "entry";
	assetId: number;
	side: Side;
	orderType: OrderType;
	sizeValue: number;
	szDecimals: number;
	markPx: number;
	price: number;
	slippageBps: number;
	reduceOnly: boolean;
	tif: LimitTif;
	limitPriceInput: string;
	triggerPriceInput: string;
	scaleStartPriceInput: string;
	scaleEndPriceInput: string;
	scaleLevelsNum: number | null;
	tpSlEnabled: boolean;
	canUseTpSl: boolean;
	tpPriceNum: number | null;
	slPriceNum: number | null;
};

export type PositionTpSlIntent = {
	kind: "positionTpsl";
	assetId: number;
	szDecimals: number;
	isLong: boolean;
	tpPriceNum: number | null;
	slPriceNum: number | null;
};

export type PositionTpSlUpdateIntent = PositionTpSlIntent & {
	existingTpPrice?: number;
	existingSlPrice?: number;
	existingTpOrderId?: number;
	existingSlOrderId?: number;
};

export type PositionTpSlUpdatePlan = {
	orders: ExchangeOrder[];
	modifies: Array<{ oid: number; order: ExchangeOrder }>;
	cancels: Array<{ a: number; o: number }>;
	hasChanges: boolean;
};

export function hasPositionTpSlTriggerMutation(plan: PositionTpSlUpdatePlan, tpsl: "tp" | "sl"): boolean {
	const changedOrders = [...plan.orders, ...plan.modifies.map((modify) => modify.order)];
	return changedOrders.some((order) => "trigger" in order.t && order.t.trigger.tpsl === tpsl);
}

export type MarketCloseIntent = {
	kind: "marketClose";
	assetId: number;
	size: number;
	szDecimals: number;
	isLong: boolean;
	markPx: number;
	slippageBps: number;
};

export type LimitCloseIntent = {
	kind: "limitClose";
	assetId: number;
	size: number;
	szDecimals: number;
	isLong: boolean;
	price: number;
};

export type ReverseIntent = {
	kind: "reverse";
	assetId: number;
	size: number;
	szDecimals: number;
	isLong: boolean;
	markPx: number;
	slippageBps: number;
};

export type OrderIntent = EntryOrderIntent | PositionTpSlIntent | MarketCloseIntent | LimitCloseIntent | ReverseIntent;

export function buildOrderPlan(intent: OrderIntent): OrderPlan {
	switch (intent.kind) {
		case "entry":
			return buildEntryPlan(intent);
		case "positionTpsl":
			return buildPositionTpSlPlan(intent);
		case "marketClose":
			return buildMarketClosePlan(intent);
		case "limitClose":
			return buildLimitClosePlan(intent);
		case "reverse":
			return buildReversePlan(intent);
		default:
			return assertNever(intent);
	}
}

function getCloseSide(isLong: boolean): Side {
	return isLong ? "sell" : "buy";
}

function buildEntryPlan(intent: EntryOrderIntent): OrderPlan {
	const orderType = intent.orderType;

	if (isTriggerOrderType(orderType) && !isPositive(toBig(intent.triggerPriceInput)?.toNumber() ?? null)) {
		return { orders: [], grouping: "na", errors: ["Enter trigger price"], warnings: [] };
	}

	try {
		const { orders, grouping } = buildOrders({
			assetId: intent.assetId,
			side: intent.side,
			orderType,
			sizeValue: intent.sizeValue,
			szDecimals: intent.szDecimals,
			markPx: intent.markPx,
			price: intent.price,
			slippageBps: intent.slippageBps,
			reduceOnly: intent.reduceOnly,
			tif: intent.tif,
			limitPriceInput: intent.limitPriceInput,
			triggerPriceInput: intent.triggerPriceInput,
			scaleStartPriceInput: intent.scaleStartPriceInput,
			scaleEndPriceInput: intent.scaleEndPriceInput,
			scaleLevelsNum: intent.scaleLevelsNum,
			tpSlEnabled: intent.tpSlEnabled,
			canUseTpSl: intent.canUseTpSl,
			tpPriceNum: intent.tpPriceNum,
			slPriceNum: intent.slPriceNum,
			isStopOrder: isStopOrderType(orderType),
			isTriggerOrder: isTriggerOrderType(orderType),
			isScaleOrder: isScaleOrderType(orderType),
			usesLimitPriceForOrder: usesLimitPrice(orderType),
		});

		return { orders, grouping, errors: [], warnings: [] };
	} catch (error) {
		return {
			orders: [],
			grouping: "na",
			errors: [error instanceof Error ? error.message : "Unable to build order"],
			warnings: [],
		};
	}
}

function buildPositionTpSlPlan(intent: PositionTpSlIntent): OrderPlan {
	const orders: ExchangeOrder[] = [];
	const isBuy = !intent.isLong;

	if (intent.tpPriceNum && isPositive(intent.tpPriceNum)) {
		orders.push(buildPositionTpSlOrder(intent.assetId, intent.szDecimals, isBuy, intent.tpPriceNum, "tp"));
	}

	if (intent.slPriceNum && isPositive(intent.slPriceNum)) {
		orders.push(buildPositionTpSlOrder(intent.assetId, intent.szDecimals, isBuy, intent.slPriceNum, "sl"));
	}

	return {
		orders,
		grouping: "positionTpsl",
		errors: orders.length === 0 ? ["No TP/SL provided"] : [],
		warnings: [],
	};
}

export function buildPositionTpSlUpdatePlan(intent: PositionTpSlUpdateIntent): PositionTpSlUpdatePlan {
	const isBuy = !intent.isLong;
	const tpOrder =
		intent.tpPriceNum && isPositive(intent.tpPriceNum)
			? buildPositionTpSlOrder(intent.assetId, intent.szDecimals, isBuy, intent.tpPriceNum, "tp")
			: null;
	const slOrder =
		intent.slPriceNum && isPositive(intent.slPriceNum)
			? buildPositionTpSlOrder(intent.assetId, intent.szDecimals, isBuy, intent.slPriceNum, "sl")
			: null;

	const orders: ExchangeOrder[] = [];
	const modifies: Array<{ oid: number; order: ExchangeOrder }> = [];
	const cancels: Array<{ a: number; o: number }> = [];

	reconcilePositionTpSlOrder({
		assetId: intent.assetId,
		desiredOrder: tpOrder,
		existingOrderId: intent.existingTpOrderId,
		existingPrice: intent.existingTpPrice,
		orders,
		modifies,
		cancels,
	});
	reconcilePositionTpSlOrder({
		assetId: intent.assetId,
		desiredOrder: slOrder,
		existingOrderId: intent.existingSlOrderId,
		existingPrice: intent.existingSlPrice,
		orders,
		modifies,
		cancels,
	});

	return {
		orders,
		modifies,
		cancels,
		hasChanges: orders.length > 0 || modifies.length > 0 || cancels.length > 0,
	};
}

interface ReconcilePositionTpSlParams {
	assetId: number;
	desiredOrder: ExchangeOrder | null;
	existingOrderId?: number;
	existingPrice?: number;
	orders: ExchangeOrder[];
	modifies: Array<{ oid: number; order: ExchangeOrder }>;
	cancels: Array<{ a: number; o: number }>;
}

function reconcilePositionTpSlOrder(params: ReconcilePositionTpSlParams): void {
	if (params.existingOrderId === undefined) {
		if (params.desiredOrder) params.orders.push(params.desiredOrder);
		return;
	}

	if (!params.desiredOrder) {
		params.cancels.push({ a: params.assetId, o: params.existingOrderId });
		return;
	}

	if (!hasSameTriggerPrice(params.desiredOrder, params.existingPrice)) {
		params.modifies.push({ oid: params.existingOrderId, order: params.desiredOrder });
	}
}

function hasSameTriggerPrice(order: ExchangeOrder, existingPrice: number | undefined): boolean {
	if (existingPrice === undefined || !("trigger" in order.t)) return false;
	const existing = toBig(existingPrice);
	const desired = toBig(order.t.trigger.triggerPx);
	return existing !== null && desired !== null && existing.eq(desired);
}

function buildMarketClosePlan({
	assetId,
	size,
	szDecimals,
	isLong,
	markPx,
	slippageBps,
}: MarketCloseIntent): OrderPlan {
	const side = getCloseSide(isLong);
	const orderPrice = getExecutedPrice("market", side, markPx, slippageBps, markPx);

	return {
		orders: [
			{
				a: assetId,
				b: side === "buy",
				p: formatPriceForOrder(orderPrice, { assetId, szDecimals }),
				s: formatSizeForOrder(size, szDecimals),
				r: true,
				t: { limit: { tif: "FrontendMarket" } },
			},
		],
		grouping: "na",
		errors: [],
		warnings: [],
	};
}

function buildLimitClosePlan({ assetId, size, szDecimals, isLong, price }: LimitCloseIntent): OrderPlan {
	const side = getCloseSide(isLong);

	return {
		orders: [
			{
				a: assetId,
				b: side === "buy",
				p: formatPriceForOrder(price, { assetId, szDecimals }),
				s: formatSizeForOrder(size, szDecimals),
				r: true,
				t: { limit: { tif: "Gtc" } },
			},
		],
		grouping: "na",
		errors: [],
		warnings: [],
	};
}

function buildReversePlan({ assetId, size, szDecimals, isLong, markPx, slippageBps }: ReverseIntent): OrderPlan {
	const side = getCloseSide(isLong);
	const orderPrice = getExecutedPrice("market", side, markPx, slippageBps, markPx);

	return {
		orders: [
			{
				a: assetId,
				b: side === "buy",
				p: formatPriceForOrder(orderPrice, { assetId, szDecimals }),
				s: formatSizeForOrder(Big(size).times(2).toNumber(), szDecimals),
				r: false,
				t: { limit: { tif: "FrontendMarket" } },
			},
		],
		grouping: "na",
		errors: [],
		warnings: [],
	};
}

function buildPositionTpSlOrder(
	assetId: number,
	szDecimals: number,
	isBuy: boolean,
	triggerPrice: number,
	tpsl: "tp" | "sl",
): ExchangeOrder {
	const triggerPx = formatPriceForOrder(triggerPrice, { assetId, szDecimals });
	const orderPx = formatPriceForOrder(getTriggerMarketExecutionPrice(isBuy ? "buy" : "sell", triggerPrice), {
		assetId,
		szDecimals,
	});
	return {
		a: assetId,
		b: isBuy,
		p: orderPx,
		s: "0",
		r: true,
		t: { trigger: { isMarket: true, triggerPx, tpsl } },
	};
}

function assertNever(value: never): never {
	throw new Error(`Unhandled order intent: ${String(value)}`);
}
