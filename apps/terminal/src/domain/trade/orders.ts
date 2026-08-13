import { isSpotAssetId } from "@gatu/hl-react";
import Big from "big.js";
import {
	DEFAULT_LEVERAGE_FALLBACK,
	type ExchangeOrder,
	HL_PERP_PRICE_MAX_DECIMALS,
	HL_PRICE_MAX_DECIMALS,
	HL_PRICE_MAX_SIG_FIGS,
	type LimitTif,
	ORDER_MIN_NOTIONAL_USD,
	type OrderType,
	SCALE_LEVELS_MAX,
	SCALE_LEVELS_MIN,
} from "@/config/trade";
import { getExecutedPrice, getTriggerMarketExecutionPrice } from "@/domain/trade/order/price";
import { formatDecimalFloor, isPositive, type Numeric, toBig } from "@/lib/trade/numbers";
import type { Side } from "@/lib/trade/types";

export interface OrderBuildParams {
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
	isStopOrder: boolean;
	isTriggerOrder: boolean;
	isScaleOrder: boolean;
	usesLimitPriceForOrder: boolean;
}

export interface OrderBuildResult {
	orders: ExchangeOrder[];
	grouping: "normalTpsl" | "positionTpsl" | "na";
}

export interface FrontendMarketOrderParams {
	assetId: number;
	side: Side;
	size: Numeric;
	szDecimals: number;
	markPx: Numeric;
	slippageBps: Numeric;
	reduceOnly: boolean;
}

export function buildFrontendMarketOrder(params: FrontendMarketOrderParams): ExchangeOrder {
	const markPx = toBig(params.markPx);
	const slippageBps = toBig(params.slippageBps);
	let orderPrice = Big(0);

	if (markPx?.gt(0) && slippageBps?.gte(0)) {
		const slippage = slippageBps.div(10000);
		const multiplier = params.side === "buy" ? Big(1).plus(slippage) : Big(1).minus(slippage);
		orderPrice = markPx.times(multiplier);
	}

	return {
		a: params.assetId,
		b: params.side === "buy",
		p: formatPriceForOrderWithRounding(orderPrice, params, Big.roundDown),
		s: formatSizeForOrder(params.size, params.szDecimals),
		r: params.reduceOnly,
		t: { limit: { tif: "FrontendMarket" } },
	};
}

export function buildOrders(params: OrderBuildParams): OrderBuildResult {
	const {
		assetId,
		side,
		orderType,
		sizeValue,
		szDecimals,
		markPx,
		price,
		slippageBps,
		reduceOnly,
		tif,
		limitPriceInput,
		triggerPriceInput,
		scaleStartPriceInput,
		scaleEndPriceInput,
		scaleLevelsNum,
		tpSlEnabled,
		canUseTpSl,
		tpPriceNum,
		slPriceNum,
		isStopOrder,
		isTriggerOrder,
		isScaleOrder,
		usesLimitPriceForOrder,
	} = params;

	const orders: ExchangeOrder[] = [];
	const formattedSize = formatSizeForOrder(sizeValue, szDecimals);
	const hasTp = tpSlEnabled && canUseTpSl && isPositive(tpPriceNum);
	const hasSl = tpSlEnabled && canUseTpSl && isPositive(slPriceNum);
	const isBuy = side === "buy";

	if (isScaleOrder) {
		buildScaleOrders(orders, {
			assetId,
			isBuy,
			sizeValue,
			szDecimals,
			reduceOnly,
			tif,
			scaleStartPriceInput,
			scaleEndPriceInput,
			scaleLevelsNum,
		});
	} else if (isTriggerOrder) {
		buildTriggerOrder(orders, {
			assetId,
			szDecimals,
			isBuy,
			formattedSize,
			triggerPriceInput,
			limitPriceInput,
			isStopOrder,
			usesLimitPriceForOrder,
		});
	} else {
		buildStandardOrder(orders, {
			assetId,
			szDecimals,
			isBuy,
			orderType,
			formattedSize,
			markPx,
			price,
			slippageBps,
			reduceOnly,
			tif,
		});

		if (hasTp && tpPriceNum !== null) {
			buildTpSlOrder(orders, {
				assetId,
				szDecimals,
				isBuy: !isBuy,
				entryIsBuy: isBuy,
				entryReferencePrice: price,
				formattedSize,
				triggerPrice: tpPriceNum,
				tpsl: "tp",
			});
		}
		if (hasSl && slPriceNum !== null) {
			buildTpSlOrder(orders, {
				assetId,
				szDecimals,
				isBuy: !isBuy,
				entryIsBuy: isBuy,
				entryReferencePrice: price,
				formattedSize,
				triggerPrice: slPriceNum,
				tpsl: "sl",
			});
		}
	}

	return { orders, grouping: hasTp || hasSl ? "normalTpsl" : "na" };
}

export interface ScaleOrderPlanParams {
	assetId: number;
	sizeValue: Numeric;
	szDecimals: number;
	scaleStartPriceInput: Numeric;
	scaleEndPriceInput: Numeric;
	scaleLevelsNum: number | null;
}

export type ScaleOrderPlanIssue =
	| "invalid-levels"
	| "invalid-price-range"
	| "insufficient-size"
	| "duplicate-price"
	| "min-notional";

export interface ScaleOrderLevel {
	price: string;
	size: string;
	notional: string;
}

export interface ScaleOrderLevelPlan {
	levels: ScaleOrderLevel[];
	issues: ScaleOrderPlanIssue[];
}

interface ScaleOrderParams extends ScaleOrderPlanParams {
	isBuy: boolean;
	reduceOnly: boolean;
	tif: LimitTif;
}

export function createScaleOrderLevelPlan(params: ScaleOrderPlanParams): ScaleOrderLevelPlan {
	const levels = params.scaleLevelsNum;
	if (levels === null || !Number.isSafeInteger(levels) || levels < SCALE_LEVELS_MIN || levels > SCALE_LEVELS_MAX) {
		return { levels: [], issues: ["invalid-levels"] };
	}

	const start = toBig(params.scaleStartPriceInput);
	const end = toBig(params.scaleEndPriceInput);
	if (!start || !end || start.lte(0) || end.lte(0) || start.eq(end)) {
		return { levels: [], issues: ["invalid-price-range"] };
	}

	const totalSize = toBig(params.sizeValue);
	if (!totalSize || totalSize.lte(0)) return { levels: [], issues: ["insufficient-size"] };

	const sizeFactor = Big(10).pow(params.szDecimals);
	const totalSizeUnits = totalSize.times(sizeFactor).round(0, Big.roundDown);
	if (totalSizeUnits.lt(levels)) return { levels: [], issues: ["insufficient-size"] };

	const unitsPerLevel = totalSizeUnits.div(levels).round(0, Big.roundDown);
	const remainderUnits = totalSizeUnits.minus(unitsPerLevel.times(levels)).toNumber();
	const priceStep = end.minus(start).div(levels - 1);
	const plannedLevels: ScaleOrderLevel[] = [];
	const formattedPrices = new Set<string>();
	const issues = new Set<ScaleOrderPlanIssue>();

	for (let index = 0; index < levels; index += 1) {
		const price = formatPriceForOrder(start.plus(priceStep.times(index)), params);
		const sizeUnits = index < remainderUnits ? unitsPerLevel.plus(1) : unitsPerLevel;
		const size = formatDecimalFloor(sizeUnits.div(sizeFactor), params.szDecimals);
		const priceValue = toBig(price);
		const sizeValue = toBig(size);

		if (!priceValue || priceValue.lte(0)) issues.add("invalid-price-range");
		if (!sizeValue || sizeValue.lte(0)) issues.add("insufficient-size");
		if (formattedPrices.has(price)) issues.add("duplicate-price");
		formattedPrices.add(price);

		const notional = priceValue && sizeValue ? priceValue.times(sizeValue) : Big(0);
		if (notional.lt(ORDER_MIN_NOTIONAL_USD)) issues.add("min-notional");
		plannedLevels.push({ price, size, notional: notional.toString() });
	}

	return { levels: plannedLevels, issues: Array.from(issues) };
}

function buildScaleOrders(orders: ExchangeOrder[], params: ScaleOrderParams): void {
	const plan = createScaleOrderLevelPlan(params);
	if (plan.issues.length > 0) throw new Error(getScaleOrderPlanError(plan.issues[0]));

	for (const level of plan.levels) {
		orders.push({
			a: params.assetId,
			b: params.isBuy,
			p: level.price,
			s: level.size,
			r: params.reduceOnly,
			t: { limit: { tif: params.tif } },
		});
	}
}

function getScaleOrderPlanError(issue: ScaleOrderPlanIssue): string {
	switch (issue) {
		case "invalid-levels":
			return `Scale levels must be ${SCALE_LEVELS_MIN}-${SCALE_LEVELS_MAX}`;
		case "invalid-price-range":
			return "Enter a valid scale price range";
		case "insufficient-size":
			return "Scale size is too small for the selected number of orders";
		case "duplicate-price":
			return "Scale prices must resolve to distinct ticks";
		case "min-notional":
			return "Scale level below min notional";
		default:
			return assertNever(issue);
	}
}

function assertNever(value: never): never {
	throw new Error(`Unhandled scale order issue: ${String(value)}`);
}

interface TriggerOrderParams {
	assetId: number;
	szDecimals: number;
	isBuy: boolean;
	formattedSize: string;
	triggerPriceInput: string;
	limitPriceInput: string;
	isStopOrder: boolean;
	usesLimitPriceForOrder: boolean;
}

function buildTriggerOrder(orders: ExchangeOrder[], params: TriggerOrderParams): void {
	const triggerBig = toBig(params.triggerPriceInput);
	if (!triggerBig || triggerBig.lte(0)) {
		throw new Error("Trigger price must be greater than zero");
	}
	const triggerPx = formatPriceForOrder(triggerBig, params);

	let orderPx = formatPriceForOrder(
		getTriggerMarketExecutionPrice(params.isBuy ? "buy" : "sell", triggerBig.toNumber()),
		params,
	);
	if (params.usesLimitPriceForOrder) {
		const limitBig = toBig(params.limitPriceInput);
		if (!limitBig || limitBig.lte(0)) {
			throw new Error("Limit price must be greater than zero");
		}
		orderPx = formatPriceForOrder(limitBig, params);
	}

	orders.push({
		a: params.assetId,
		b: params.isBuy,
		p: orderPx,
		s: params.formattedSize,
		r: true,
		t: {
			trigger: {
				isMarket: !params.usesLimitPriceForOrder,
				triggerPx,
				tpsl: params.isStopOrder ? "sl" : "tp",
			},
		},
	});
}

interface StandardOrderParams {
	assetId: number;
	szDecimals: number;
	isBuy: boolean;
	orderType: OrderType;
	formattedSize: string;
	markPx: number;
	price: number;
	slippageBps: number;
	reduceOnly: boolean;
	tif: LimitTif;
}

function buildStandardOrder(orders: ExchangeOrder[], params: StandardOrderParams): void {
	const orderPrice = getExecutedPrice(
		params.orderType,
		params.isBuy ? "buy" : "sell",
		params.markPx,
		params.slippageBps,
		params.price,
	);
	const formattedPrice = formatPriceForOrder(orderPrice, params);

	orders.push({
		a: params.assetId,
		b: params.isBuy,
		p: formattedPrice,
		s: params.formattedSize,
		r: params.reduceOnly,
		t: params.orderType === "market" ? { limit: { tif: "FrontendMarket" as const } } : { limit: { tif: params.tif } },
	});
}

interface TpSlOrderParams {
	assetId: number;
	szDecimals: number;
	isBuy: boolean;
	entryIsBuy: boolean;
	entryReferencePrice: number;
	formattedSize: string;
	triggerPrice: number;
	tpsl: "tp" | "sl";
}

function buildTpSlOrder(orders: ExchangeOrder[], params: TpSlOrderParams): void {
	const triggerPx = formatPriceForOrder(params.triggerPrice, params);
	const entryPx = formatPriceForOrder(params.entryReferencePrice, params);
	const normalizedTriggerPrice = toBig(triggerPx);
	const normalizedEntryPrice = toBig(entryPx);
	if (!normalizedTriggerPrice?.gt(0)) throw new Error("Trigger price is below market precision");
	if (!normalizedEntryPrice?.gt(0)) throw new Error("Entry price is below market precision");
	const directionValid =
		params.tpsl === "tp"
			? params.entryIsBuy
				? normalizedTriggerPrice.gt(normalizedEntryPrice)
				: normalizedTriggerPrice.lt(normalizedEntryPrice)
			: params.entryIsBuy
				? normalizedTriggerPrice.lt(normalizedEntryPrice)
				: normalizedTriggerPrice.gt(normalizedEntryPrice);
	if (!directionValid) {
		if (params.tpsl === "tp") {
			throw new Error(params.entryIsBuy ? "TP must be above entry" : "TP must be below entry");
		}
		throw new Error(params.entryIsBuy ? "SL must be below entry" : "SL must be above entry");
	}
	const orderPx = formatPriceForOrder(
		getTriggerMarketExecutionPrice(params.isBuy ? "buy" : "sell", normalizedTriggerPrice.toNumber()),
		params,
	);
	orders.push({
		a: params.assetId,
		b: params.isBuy,
		p: orderPx,
		s: params.formattedSize,
		r: true,
		t: { trigger: { isMarket: true, triggerPx, tpsl: params.tpsl } },
	});
}

function extractResponseError(status: unknown): string | null {
	if (status && typeof status === "object" && "error" in status && typeof status.error === "string") {
		return status.error;
	}
	return null;
}

export function throwIfResponseError(status: unknown): void {
	const error = extractResponseError(status);
	if (error) throw new Error(error);
}

export function throwIfAnyResponseError(statuses: unknown[] | undefined): void {
	if (!statuses) return;
	for (const status of statuses) {
		throwIfResponseError(status);
	}
}

export function getDefaultLeverage(maxLeverage: number): number {
	if (maxLeverage <= DEFAULT_LEVERAGE_FALLBACK) return maxLeverage;
	return Math.floor(maxLeverage / 2);
}

/**
 * Format a price to Hyperliquid's tick rules: at most 5 significant figures, capped by the
 * market's `MAX_DECIMALS - szDecimals` rule when metadata is available. Big.js based so the magnitude (via `.e`) and rounding (via
 * `toFixed`) are exact — no `Math.log10`/`Math.round` float error — and it accepts a Big/string
 * directly so callers don't lose precision by converting to a number first.
 */
interface PriceFormatOptions {
	assetId: number;
	szDecimals: number;
}

export function formatPriceForOrder(value: Numeric, options?: PriceFormatOptions): string {
	return formatPriceForOrderWithRounding(value, options, Big.roundHalfUp);
}

function formatPriceForOrderWithRounding(
	value: Numeric,
	options: PriceFormatOptions | undefined,
	roundingMode: Big.RoundingMode,
): string {
	const price = toBig(value);
	if (!price || price.lte(0)) return "0";

	// price.e is the exponent of the most significant digit, so integerDigits = e + 1.
	const integerDigits = price.e + 1;
	let decimals = price.gte(1)
		? Math.max(0, HL_PRICE_MAX_SIG_FIGS - integerDigits)
		: HL_PRICE_MAX_SIG_FIGS - integerDigits;
	const protocolMaxDecimals = options
		? Math.max(
				0,
				(isSpotAssetId(options.assetId) ? HL_PRICE_MAX_DECIMALS : HL_PERP_PRICE_MAX_DECIMALS) - options.szDecimals,
			)
		: HL_PRICE_MAX_DECIMALS;
	decimals = Math.min(decimals, protocolMaxDecimals);

	const fixed = price.toFixed(decimals, roundingMode);
	if (decimals === 0) return fixed;
	return fixed.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

export function formatSizeForOrder(size: Numeric, szDecimals: number): string {
	const sizeValue = toBig(size);
	if (!sizeValue) return "0";
	const fixed = sizeValue.round(szDecimals, Big.roundDown).toFixed(szDecimals);
	if (!fixed.includes(".")) return fixed;
	return fixed.replace(/\.?0+$/, "");
}
