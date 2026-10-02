import { isSpotAssetId } from "@sairn/hl-react";
import Big from "big.js";
import {
	type ExchangeOrder,
	HL_PERP_PRICE_MAX_DECIMALS,
	HL_PRICE_MAX_DECIMALS,
	type LimitTif,
	MARKET_ORDER_SLIPPAGE_MAX_PERCENT,
	type OrderType,
	TRIGGER_MARKET_SLIPPAGE_BPS,
} from "@/config/trade";
import {
	buildFrontendMarketOrder,
	buildOrders,
	formatPriceForOrder,
	formatSizeForOrder,
	isValidSizeDecimalsForAsset,
} from "@/domain/trade/orders";
import { resolvePositionMarketCloseSize } from "@/domain/trade/position-market-close";
import { isPositive, type Numeric, toBig } from "@/lib/trade/numbers";
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
	sizeValue: Numeric;
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
	scaleSkewInput: string;
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
	tpPriceNum: string | number | null;
	slPriceNum: string | number | null;
	sizeNum?: string | number | null;
	executionMode?: PositionTpSlExecutionMode;
	tpLimitPriceNum?: string | number | null;
	slLimitPriceNum?: string | number | null;
};

export type PositionTpSlExecutionMode = "market" | "limit";

export type PositionTpSlUpdateIntent = PositionTpSlIntent & {
	existingTpPrice?: string | number;
	existingSlPrice?: string | number;
	existingTpOrderId?: number;
	existingSlOrderId?: number;
	existingTpSize?: string | number;
	existingSlSize?: string | number;
	existingTpIsMarket?: boolean;
	existingSlIsMarket?: boolean;
	existingTpLimitPrice?: string | number;
	existingSlLimitPrice?: string | number;
};

export type PositionTpSlUpdatePlan = {
	orders: ExchangeOrder[];
	modifies: Array<{ oid: number; order: ExchangeOrder }>;
	cancels: Array<{ a: number; o: number }>;
	hasChanges: boolean;
	errors: string[];
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
	if (!isValidSizeDecimalsForAsset(intent.assetId, intent.szDecimals)) {
		return { orders: [], grouping: "na", errors: ["Order market precision is invalid"], warnings: [] };
	}

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
			scaleSkewInput: intent.scaleSkewInput,
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
	const { orders, errors } = buildDesiredPositionTpSlOrders(intent);

	return {
		orders: errors.length === 0 ? orders : [],
		grouping: "positionTpsl",
		errors: errors.length > 0 ? errors : orders.length === 0 ? ["No TP/SL provided"] : [],
		warnings: [],
	};
}

export function buildPositionTpSlUpdatePlan(intent: PositionTpSlUpdateIntent): PositionTpSlUpdatePlan {
	const desired = buildDesiredPositionTpSlOrders(intent);
	if (desired.errors.length > 0) {
		return {
			orders: [],
			modifies: [],
			cancels: [],
			hasChanges: false,
			errors: desired.errors,
		};
	}

	const tpOrder = desired.orders.find(isTakeProfitTriggerOrder) ?? null;
	const slOrder = desired.orders.find(isStopLossTriggerOrder) ?? null;

	const orders: ExchangeOrder[] = [];
	const modifies: Array<{ oid: number; order: ExchangeOrder }> = [];
	const cancels: Array<{ a: number; o: number }> = [];

	reconcilePositionTpSlOrder({
		assetId: intent.assetId,
		desiredOrder: tpOrder,
		existingOrderId: intent.existingTpOrderId,
		existingPrice: intent.existingTpPrice,
		existingSize: intent.existingTpSize,
		existingIsMarket: intent.existingTpIsMarket,
		existingLimitPrice: intent.existingTpLimitPrice,
		orders,
		modifies,
		cancels,
	});
	reconcilePositionTpSlOrder({
		assetId: intent.assetId,
		desiredOrder: slOrder,
		existingOrderId: intent.existingSlOrderId,
		existingPrice: intent.existingSlPrice,
		existingSize: intent.existingSlSize,
		existingIsMarket: intent.existingSlIsMarket,
		existingLimitPrice: intent.existingSlLimitPrice,
		orders,
		modifies,
		cancels,
	});

	return {
		orders,
		modifies,
		cancels,
		hasChanges: orders.length > 0 || modifies.length > 0 || cancels.length > 0,
		errors: [],
	};
}

interface ReconcilePositionTpSlParams {
	assetId: number;
	desiredOrder: ExchangeOrder | null;
	existingOrderId?: number;
	existingPrice?: string | number;
	existingSize?: string | number;
	existingIsMarket?: boolean;
	existingLimitPrice?: string | number;
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

	if (!hasSamePositionTpSlOrder(params.desiredOrder, params)) {
		params.modifies.push({ oid: params.existingOrderId, order: params.desiredOrder });
	}
}

function hasSamePositionTpSlOrder(order: ExchangeOrder, existing: ReconcilePositionTpSlParams): boolean {
	if (!("trigger" in order.t) || existing.existingPrice === undefined) return false;
	if (!numericValuesEqual(order.t.trigger.triggerPx, existing.existingPrice)) return false;

	// Older callers only knew dynamic whole-position market TP/SL. Preserve that default while
	// requiring the expanded snapshot for partial-size and trigger-limit reconciliation.
	const existingSize = existing.existingSize ?? "0";
	const existingIsMarket = existing.existingIsMarket ?? true;
	if (!numericValuesEqual(order.s, existingSize) || order.t.trigger.isMarket !== existingIsMarket) return false;
	if (existing.existingLimitPrice !== undefined && !numericValuesEqual(order.p, existing.existingLimitPrice)) {
		return false;
	}
	return true;
}

function numericValuesEqual(left: Numeric, right: Numeric): boolean {
	const leftValue = toBig(left);
	const rightValue = toBig(right);
	return leftValue !== null && rightValue !== null && leftValue.eq(rightValue);
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

interface PositionTpSlOrderSettings {
	size: string;
	executionMode: PositionTpSlExecutionMode;
}

interface BuildPositionTpSlOrderParams extends PositionTpSlOrderSettings {
	assetId: number;
	szDecimals: number;
	isBuy: boolean;
	triggerPrice: Numeric;
	limitPrice: Numeric;
	tpsl: "tp" | "sl";
}

function buildDesiredPositionTpSlOrders(intent: PositionTpSlIntent): { orders: ExchangeOrder[]; errors: string[] } {
	const settings = resolvePositionTpSlOrderSettings(intent);
	if (settings.errors.length > 0 || !settings.value) return { orders: [], errors: settings.errors };

	const orders: ExchangeOrder[] = [];
	const errors: string[] = [];
	const isBuy = !intent.isLong;
	const legs = [
		{ triggerPrice: intent.tpPriceNum, limitPrice: intent.tpLimitPriceNum, tpsl: "tp" as const },
		{ triggerPrice: intent.slPriceNum, limitPrice: intent.slLimitPriceNum, tpsl: "sl" as const },
	];

	for (const leg of legs) {
		const triggerPrice = toBig(leg.triggerPrice);
		if (!triggerPrice?.gt(0)) continue;
		try {
			orders.push(
				buildPositionTpSlOrder({
					assetId: intent.assetId,
					szDecimals: intent.szDecimals,
					isBuy,
					triggerPrice,
					limitPrice: leg.limitPrice,
					tpsl: leg.tpsl,
					...settings.value,
				}),
			);
		} catch (error) {
			errors.push(error instanceof Error ? error.message : "Unable to build position TP/SL order");
		}
	}

	return { orders: errors.length === 0 ? orders : [], errors };
}

function resolvePositionTpSlOrderSettings(intent: PositionTpSlIntent): {
	value: PositionTpSlOrderSettings | null;
	errors: string[];
} {
	const errors: string[] = [];
	const executionMode = intent.executionMode ?? "market";
	if (executionMode !== "market" && executionMode !== "limit") {
		errors.push("Execution mode must be market or limit");
	}

	let size = "0";
	if (intent.sizeNum !== undefined && intent.sizeNum !== null) {
		const sizeValue = toBig(intent.sizeNum);
		if (!sizeValue || sizeValue.lte(0)) {
			errors.push("Partial size must be greater than zero");
		} else {
			size = formatSizeForOrder(sizeValue, intent.szDecimals);
			if (!toBig(size)?.gt(0)) errors.push("Partial size is below market precision");
		}
	}

	return {
		value: errors.length === 0 ? { size, executionMode } : null,
		errors,
	};
}

function buildPositionTpSlOrder({
	assetId,
	szDecimals,
	isBuy,
	triggerPrice,
	limitPrice,
	tpsl,
	size,
	executionMode,
}: BuildPositionTpSlOrderParams): ExchangeOrder {
	const triggerPriceValue = toBig(triggerPrice);
	if (!triggerPriceValue || triggerPriceValue.lte(0)) throw new Error("Trigger price must be greater than zero");
	const priceFormat = { assetId, szDecimals };
	const triggerPx = formatPriceForOrder(triggerPriceValue, priceFormat);
	if (!toBig(triggerPx)?.gt(0)) throw new Error("Trigger price is below market precision");

	let orderPx: string;
	if (executionMode === "limit") {
		const limitPriceValue = toBig(limitPrice);
		const legLabel = tpsl === "tp" ? "Take profit" : "Stop loss";
		if (!limitPriceValue || limitPriceValue.lte(0)) {
			throw new Error(`${legLabel} limit price must be greater than zero`);
		}
		orderPx = formatPriceForOrder(limitPriceValue, priceFormat);
		const normalizedLimitPrice = toBig(orderPx);
		const normalizedTriggerPrice = toBig(triggerPx);
		if (!normalizedLimitPrice?.gt(0)) throw new Error(`${legLabel} limit price is below market precision`);
		if (!normalizedTriggerPrice) throw new Error("Trigger price is below market precision");
		if (isBuy && normalizedLimitPrice.lt(normalizedTriggerPrice)) {
			throw new Error(`${legLabel} buy limit price must be greater than or equal to the trigger price`);
		}
		if (!isBuy && normalizedLimitPrice.gt(normalizedTriggerPrice)) {
			throw new Error(`${legLabel} sell limit price must be less than or equal to the trigger price`);
		}
	} else {
		const slippage = Big(TRIGGER_MARKET_SLIPPAGE_BPS).div(10_000);
		const orderPrice = triggerPriceValue.times(isBuy ? Big(1).plus(slippage) : Big(1).minus(slippage));
		orderPx = formatPriceForOrder(orderPrice, priceFormat);
	}
	const normalizedOrderPrice = toBig(orderPx);
	const normalizedTriggerPrice = toBig(triggerPx);
	if (!normalizedOrderPrice?.gt(0)) throw new Error("Order price is below market precision");
	if (!normalizedTriggerPrice?.gt(0)) throw new Error("Trigger price is below market precision");
	if (isBuy && normalizedOrderPrice.lt(normalizedTriggerPrice)) {
		throw new Error("Buy order price must be greater than or equal to the trigger price");
	}
	if (!isBuy && normalizedOrderPrice.gt(normalizedTriggerPrice)) {
		throw new Error("Sell order price must be less than or equal to the trigger price");
	}

	return {
		a: assetId,
		b: isBuy,
		p: orderPx,
		s: size,
		r: true,
		t: { trigger: { isMarket: executionMode === "market", triggerPx, tpsl } },
	};
}

function isTakeProfitTriggerOrder(order: ExchangeOrder): boolean {
	return "trigger" in order.t && order.t.trigger.tpsl === "tp";
}

function isStopLossTriggerOrder(order: ExchangeOrder): boolean {
	return "trigger" in order.t && order.t.trigger.tpsl === "sl";
}

function assertNever(value: never): never {
	throw new Error(`Unhandled order intent: ${String(value)}`);
}
