import { isSpotAssetId } from "@gatu/hl-react";
import Big from "big.js";
import {
	DEFAULT_LEVERAGE_FALLBACK,
	type ExchangeOrder,
	HL_PERP_PRICE_MAX_DECIMALS,
	HL_PRICE_MAX_DECIMALS,
	HL_PRICE_MAX_SIG_FIGS,
	type LimitTif,
	type OrderType,
	SCALE_LEVELS_MAX,
	SCALE_LEVELS_MIN,
} from "@/config/trade";
import { getExecutedPrice } from "@/domain/trade/order/price";
import { clampInt, formatDecimalFloor, isPositive, type Numeric, toBig, toSafeBig } from "@/lib/trade/numbers";
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
				formattedSize,
				triggerPrice: slPriceNum,
				tpsl: "sl",
			});
		}
	}

	return { orders, grouping: hasTp || hasSl ? "normalTpsl" : "na" };
}

interface ScaleOrderParams {
	assetId: number;
	isBuy: boolean;
	sizeValue: number;
	szDecimals: number;
	reduceOnly: boolean;
	tif: LimitTif;
	scaleStartPriceInput: string;
	scaleEndPriceInput: string;
	scaleLevelsNum: number | null;
}

function buildScaleOrders(orders: ExchangeOrder[], params: ScaleOrderParams): void {
	const levels = clampInt(Math.round(params.scaleLevelsNum ?? SCALE_LEVELS_MIN), SCALE_LEVELS_MIN, SCALE_LEVELS_MAX);
	const start = toSafeBig(params.scaleStartPriceInput);
	const end = toSafeBig(params.scaleEndPriceInput);
	const step = levels > 1 ? end.minus(start).div(levels - 1) : start.times(0);
	const perLevelSize = toSafeBig(params.sizeValue).div(levels);

	for (let i = 0; i < levels; i += 1) {
		const levelPrice = start.plus(step.times(i)).toNumber();
		orders.push({
			a: params.assetId,
			b: params.isBuy,
			p: formatPriceForOrder(levelPrice, params),
			s: formatSizeForOrder(perLevelSize.toNumber(), params.szDecimals),
			r: params.reduceOnly,
			t: { limit: { tif: params.tif } },
		});
	}
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

	let orderPx = triggerPx;
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
	formattedSize: string;
	triggerPrice: number;
	tpsl: "tp" | "sl";
}

function buildTpSlOrder(orders: ExchangeOrder[], params: TpSlOrderParams): void {
	const triggerPx = formatPriceForOrder(params.triggerPrice, params);
	orders.push({
		a: params.assetId,
		b: params.isBuy,
		p: triggerPx,
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

	const fixed = price.toFixed(decimals, Big.roundHalfUp);
	if (decimals === 0) return fixed;
	return fixed.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

export function formatSizeForOrder(size: string | number, szDecimals: number): string {
	return formatDecimalFloor(size, szDecimals);
}
