import { isSpotAssetId } from "@gatu/hl-react";
import Big from "big.js";
import {
	type ExchangeOrder,
	HL_PERP_PRICE_MAX_DECIMALS,
	HL_PRICE_MAX_DECIMALS,
	type LimitTif,
	MARKET_ORDER_SLIPPAGE_MAX_PERCENT,
	type OrderType,
} from "@/config/trade";
import { getTriggerMarketExecutionPrice } from "@/domain/trade/order/price";
import { buildFrontendMarketOrder, buildOrders, formatPriceForOrder, formatSizeForOrder } from "@/domain/trade/orders";
import { resolvePositionMarketCloseSize } from "@/domain/trade/position-market-close";
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
	signedPositionSize: string;
	closeSize: string;
	szDecimals: number;
	referencePx: string;
	slippageBps: string;
};

export type LimitCloseIntent = {
	kind: "limitClose";
	assetId: number;
	size: string;
	szDecimals: number;
	isLong: boolean;
	price: string;
};

export type OrderIntent = EntryOrderIntent | PositionTpSlIntent | MarketCloseIntent | LimitCloseIntent;

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

function buildMarketClosePlan(intent: MarketCloseIntent): OrderPlan {
	const resolution = resolvePositionMarketCloseSize(intent);
	const errors = [...resolution.errors];

	if (!Number.isSafeInteger(intent.assetId) || intent.assetId < 0) {
		errors.push("Asset id must be a non-negative integer");
	}

	const referencePx = toBig(intent.referencePx);
	if (!referencePx || referencePx.lte(0)) errors.push("Market reference price must be greater than zero");

	const slippageBps = toBig(intent.slippageBps);
	const maxSlippageBps = Big(MARKET_ORDER_SLIPPAGE_MAX_PERCENT).times(100);
	if (!slippageBps || slippageBps.lt(0) || slippageBps.gt(maxSlippageBps)) {
		errors.push(`Slippage must be between 0 and ${maxSlippageBps.toString()} basis points`);
	}

	if (errors.length > 0 || resolution.side === null) {
		return { orders: [], grouping: "na", errors, warnings: [] };
	}

	const order = buildFrontendMarketOrder({
		assetId: intent.assetId,
		side: resolution.side,
		size: resolution.normalizedSize,
		szDecimals: intent.szDecimals,
		markPx: intent.referencePx,
		slippageBps: intent.slippageBps,
		reduceOnly: true,
	});

	if (order.s === "0") errors.push("Close size is below market precision");
	if (order.p === "0") errors.push("Market close price is invalid");

	return {
		orders: errors.length === 0 ? [order] : [],
		grouping: "na",
		errors,
		warnings: [],
	};
}

function buildLimitClosePlan({ assetId, size, szDecimals, isLong, price }: LimitCloseIntent): OrderPlan {
	const errors: string[] = [];

	if (!Number.isSafeInteger(assetId) || assetId < 0) {
		errors.push("Asset id must be a non-negative integer");
	}

	const maxSizeDecimals = isSpotAssetId(assetId) ? HL_PRICE_MAX_DECIMALS : HL_PERP_PRICE_MAX_DECIMALS;
	if (!Number.isSafeInteger(szDecimals) || szDecimals < 0 || szDecimals > maxSizeDecimals) {
		errors.push(`Size decimals must be an integer between 0 and ${maxSizeDecimals}`);
	}

	const priceValue = toBig(price);
	if (!priceValue || priceValue.lte(0)) errors.push("Limit price must be greater than zero");

	const sizeValue = toBig(size);
	if (!sizeValue || sizeValue.lte(0)) errors.push("Close size must be greater than zero");

	if (errors.length > 0) {
		return { orders: [], grouping: "na", errors, warnings: [] };
	}

	const formattedPrice = formatPriceForOrder(priceValue, { assetId, szDecimals });
	const formattedSize = formatSizeForOrder(sizeValue, szDecimals);

	if (formattedPrice === "0") errors.push("Limit price is below market precision");
	if (formattedSize === "0") errors.push("Close size is below market precision");

	if (errors.length > 0) {
		return { orders: [], grouping: "na", errors, warnings: [] };
	}

	const side = getCloseSide(isLong);

	return {
		orders: [
			{
				a: assetId,
				b: side === "buy",
				p: formattedPrice,
				s: formattedSize,
				r: true,
				t: { limit: { tif: "Gtc" } },
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
