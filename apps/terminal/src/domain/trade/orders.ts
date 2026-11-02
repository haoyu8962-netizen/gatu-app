import { isSpotAssetId } from "@sairn/hl-react";
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
	SCALE_SKEW_DEFAULT,
} from "@/config/trade";
import { getTriggerMarketExecutionPrice } from "@/domain/trade/order/price";
import {
	formatDecimalFloor,
	formatPriceAtDisplayDecimals,
	isPositive,
	type Numeric,
	toBig,
	toNumber,
} from "@/lib/trade/numbers";
import type { Side } from "@/lib/trade/types";

export interface OrderBuildParams {
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

export function isValidSizeDecimalsForAsset(assetId: number, szDecimals: number): boolean {
	if (!Number.isSafeInteger(assetId) || assetId < 0 || !Number.isSafeInteger(szDecimals) || szDecimals < 0) {
		return false;
	}
	const maxDecimals = isSpotAssetId(assetId) ? HL_PRICE_MAX_DECIMALS : HL_PERP_PRICE_MAX_DECIMALS;
	return szDecimals <= maxDecimals;
}

/**
 * The price a FrontendMarket order is sent at: the reference price moved by the slippage limit,
 * rounded back toward the reference so the limit the user confirmed is never exceeded.
 */
export function getFrontendMarketOrderPrice(
	params: Pick<FrontendMarketOrderParams, "assetId" | "side" | "szDecimals" | "markPx" | "slippageBps">,
): string {
	const markPx = toBig(params.markPx);
	const slippageBps = toBig(params.slippageBps);
	let orderPrice = Big(0);

	if (markPx?.gt(0) && slippageBps?.gte(0)) {
		const slippage = slippageBps.div(10000);
		const multiplier = params.side === "buy" ? Big(1).plus(slippage) : Big(1).minus(slippage);
		orderPrice = markPx.times(multiplier);
	}
	const roundingMode = params.side === "buy" ? Big.roundDown : Big.roundUp;
	return formatPriceForOrderWithRounding(orderPrice, params, roundingMode);
}

export function buildFrontendMarketOrder(params: FrontendMarketOrderParams): ExchangeOrder {
	return {
		a: params.assetId,
		b: params.side === "buy",
		p: getFrontendMarketOrderPrice(params),
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
		scaleSkewInput,
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
			scaleSkew: scaleSkewInput,
		});
	} else if (isTriggerOrder) {
		buildTriggerOrder(orders, {
			assetId,
			szDecimals,
			isBuy,
			formattedSize,
			reduceOnly,
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
	scaleSkew: Numeric;
}

export type ScaleOrderPlanIssue =
	| "invalid-levels"
	| "invalid-precision"
	| "invalid-price-range"
	| "invalid-skew"
	| "insufficient-size"
	| "insufficient-size-for-skew"
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
	if (!isValidSizeDecimalsForAsset(params.assetId, params.szDecimals)) {
		return { levels: [], issues: ["invalid-precision"] };
	}
	const levels = params.scaleLevelsNum;
	if (levels === null || !Number.isSafeInteger(levels) || levels < SCALE_LEVELS_MIN || levels > SCALE_LEVELS_MAX) {
		return { levels: [], issues: ["invalid-levels"] };
	}

	const start = toBig(params.scaleStartPriceInput);
	const end = toBig(params.scaleEndPriceInput);
	if (!start || !end || start.lte(0) || end.lte(0) || start.eq(end)) {
		return { levels: [], issues: ["invalid-price-range"] };
	}

	const skew = resolveScaleSkew(params.scaleSkew);
	if (!skew) return { levels: [], issues: ["invalid-skew"] };

	const totalSize = toBig(params.sizeValue);
	if (!totalSize || totalSize.lte(0)) return { levels: [], issues: ["insufficient-size"] };

	const sizeFactor = Big(10).pow(params.szDecimals);
	const totalSizeUnits = totalSize.times(sizeFactor).round(0, Big.roundDown);
	if (totalSizeUnits.lt(levels)) return { levels: [], issues: ["insufficient-size"] };

	const unitsByLevel = allocateScaleSizeUnits(totalSizeUnits, levels, skew);
	if (unitsByLevel.some((units) => units.lt(1))) return { levels: [], issues: ["insufficient-size-for-skew"] };

	const priceStep = end.minus(start).div(levels - 1);
	const plannedLevels: ScaleOrderLevel[] = [];
	const formattedPrices = new Set<string>();
	const issues = new Set<ScaleOrderPlanIssue>();

	for (let index = 0; index < levels; index += 1) {
		const price = formatPriceForOrder(start.plus(priceStep.times(index)), params);
		const size = formatDecimalFloor(unitsByLevel[index].div(sizeFactor), params.szDecimals);
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

function resolveScaleSkew(value: Numeric): Big | null {
	if (value == null || value === "") return Big(SCALE_SKEW_DEFAULT);
	const skew = toBig(value);
	if (!skew || skew.lte(0)) return null;
	return skew;
}

export function resolveScaleSkewNumber(input: string): number | null {
	return toNumber(resolveScaleSkew(input));
}

function getScaleLevelWeights(levels: number, skew: Big): Big[] {
	const span = Math.max(levels - 1, 1);
	return Array.from({ length: levels }, (_, index) => skew.minus(1).times(index).plus(span));
}

/**
 * Size-weighted average price of the scale levels, which the official terminal uses as a scale
 * order's price for its quote-size conversion, order value and fees. It uses the exact level
 * weights, so it does not depend on the total size; null while the range is incomplete.
 */
export function getScaleAveragePrice(params: Omit<ScaleOrderPlanParams, "sizeValue">): number | null {
	if (!isValidSizeDecimalsForAsset(params.assetId, params.szDecimals)) return null;
	const levels = params.scaleLevelsNum;
	if (levels === null || !Number.isSafeInteger(levels) || levels < SCALE_LEVELS_MIN || levels > SCALE_LEVELS_MAX) {
		return null;
	}
	const start = toBig(params.scaleStartPriceInput);
	const end = toBig(params.scaleEndPriceInput);
	const skew = resolveScaleSkew(params.scaleSkew);
	if (!start?.gt(0) || !end?.gt(0) || start.eq(end) || !skew) return null;

	const priceStep = end.minus(start).div(levels - 1);
	const weights = getScaleLevelWeights(levels, skew);
	let weightedPrice = Big(0);
	let weightSum = Big(0);
	for (const [index, weight] of weights.entries()) {
		const price = toBig(formatPriceForOrder(start.plus(priceStep.times(index)), params));
		if (!price?.gt(0)) return null;
		weightedPrice = weightedPrice.plus(price.times(weight));
		weightSum = weightSum.plus(weight);
	}
	return weightedPrice.div(weightSum).toNumber();
}

/**
 * What the levels of a scale order cost once its total size is split into lots: the sum of each
 * level's price times its size, which is what the exchange receives. It can differ from the total
 * size times the average price, because whole lots land on unevenly priced levels. Null while the
 * plan has no levels.
 */
export function getScaleOrderNotional(params: ScaleOrderPlanParams): Big | null {
	const plan = createScaleOrderLevelPlan(params);
	if (plan.levels.length === 0) return null;
	return plan.levels.reduce((sum, level) => sum.plus(level.notional), Big(0));
}

/**
 * The margin a perp scale order reserves once its total size is split into lots: each level's size
 * at the price that level rests at (`marginPriceForLevel`). Null while the plan has no levels.
 */
export function getScaleOrderMarginNotional(
	params: ScaleOrderPlanParams,
	marginPriceForLevel: (price: Big) => Big,
): Big | null {
	const plan = createScaleOrderLevelPlan(params);
	if (plan.levels.length === 0) return null;
	return plan.levels.reduce((sum, level) => sum.plus(marginPriceForLevel(Big(level.price)).times(level.size)), Big(0));
}

/**
 * Split integer size units across levels so sizes ramp linearly from the first level to the last
 * with last/first === skew. Weights are kept as exact decimals ((n-1) + (skew-1)*i) and the split
 * uses floor + largest-remainder (lower index wins ties), so the total is preserved exactly and
 * skew === 1 reproduces the plain equal split.
 */
function allocateScaleSizeUnits(totalUnits: Big, levels: number, skew: Big): Big[] {
	const weights = getScaleLevelWeights(levels, skew);
	const weightSum = weights.reduce((sum, weight) => sum.plus(weight), Big(0));
	const remainders = weights.map((weight) => totalUnits.times(weight).mod(weightSum));
	const unitsByLevel = weights.map((weight, index) => totalUnits.times(weight).minus(remainders[index]).div(weightSum));
	const allocated = unitsByLevel.reduce((sum, units) => sum.plus(units), Big(0));
	const leftover = totalUnits.minus(allocated).toNumber();
	const ranked = remainders
		.map((remainder, index) => ({ remainder, index }))
		.sort((a, b) => b.remainder.cmp(a.remainder) || a.index - b.index);

	for (let rank = 0; rank < leftover; rank += 1) {
		const { index } = ranked[rank];
		unitsByLevel[index] = unitsByLevel[index].plus(1);
	}

	return unitsByLevel;
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
		case "invalid-precision":
			return "Order market precision is invalid";
		case "invalid-price-range":
			return "Enter a valid scale price range";
		case "invalid-skew":
			return "Enter a valid scale skew";
		case "insufficient-size":
			return "Scale size is too small for the selected number of orders";
		case "insufficient-size-for-skew":
			return "Size skew is too aggressive for the total size";
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
	reduceOnly: boolean;
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
		orderPx = formatLimitPriceForOrder(limitBig, params, params.isBuy ? "buy" : "sell");
	}

	orders.push({
		a: params.assetId,
		b: params.isBuy,
		p: orderPx,
		s: params.formattedSize,
		r: params.reduceOnly,
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
	if (params.orderType === "market") {
		orders.push(
			buildFrontendMarketOrder({
				assetId: params.assetId,
				side: params.isBuy ? "buy" : "sell",
				size: params.formattedSize,
				szDecimals: params.szDecimals,
				markPx: params.markPx,
				slippageBps: params.slippageBps,
				reduceOnly: params.reduceOnly,
			}),
		);
		return;
	}

	orders.push({
		a: params.assetId,
		b: params.isBuy,
		p: formatLimitPriceForOrder(params.price, params, params.isBuy ? "buy" : "sell"),
		s: params.formattedSize,
		r: params.reduceOnly,
		t: { limit: { tif: params.tif } },
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

/**
 * A price the terminal writes into a price field (Mid, an order book row, an order being edited, an existing TP/SL):
 * the order price with every decimal the official terminal shows for it (five significant figures within the
 * protocol cap), so 85.81 reads 85.810. A missing price fills nothing. Submission still sends the trimmed
 * `formatPriceForOrder` form.
 */
export function formatPriceForInput(value: Numeric, options: PriceFormatOptions): string {
	if (toBig(value) === null) return "";
	const price = formatPriceForOrder(value, options);
	const priceValue = toBig(price);
	if (!priceValue?.gt(0) || !isValidSizeDecimalsForAsset(options.assetId, options.szDecimals)) return price;
	const protocolDecimals = isSpotAssetId(options.assetId) ? HL_PRICE_MAX_DECIMALS : HL_PERP_PRICE_MAX_DECIMALS;
	return formatPriceAtDisplayDecimals(priceValue, protocolDecimals - options.szDecimals);
}

/**
 * A limit price is the user's bound, so any rounding goes toward the side that keeps it: down for
 * a buy, up for a sell. The form already rejects a limit price that is not on the tick.
 */
export function formatLimitPriceForOrder(value: Numeric, options: PriceFormatOptions | undefined, side: Side): string {
	return formatPriceForOrderWithRounding(value, options, side === "buy" ? Big.roundDown : Big.roundUp);
}

/**
 * Returns a valid order price next to `value` when `value` itself is not on the market's tick, or
 * null when it is (or cannot be checked). The example is rounded toward the bound of `side`, or
 * down without a side, as the official terminal does.
 */
export function getOffTickPriceExample(value: Numeric, options: PriceFormatOptions, side?: Side): string | null {
	const price = toBig(value);
	if (!price?.gt(0) || !isValidSizeDecimalsForAsset(options.assetId, options.szDecimals)) return null;
	const example = formatPriceForOrderWithRounding(price, options, side === "sell" ? Big.roundUp : Big.roundDown);
	if (toBig(example)?.eq(price)) return null;
	return example === "0" ? formatPriceForOrderWithRounding(price, options, Big.roundUp) : example;
}

function formatPriceForOrderWithRounding(
	value: Numeric,
	options: PriceFormatOptions | undefined,
	roundingMode: Big.RoundingMode,
): string {
	const price = toBig(value);
	if (!price || price.lte(0)) return "0";
	if (options && !isValidSizeDecimalsForAsset(options.assetId, options.szDecimals)) return "0";

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
	if (!sizeValue || !Number.isSafeInteger(szDecimals) || szDecimals < 0 || szDecimals > HL_PRICE_MAX_DECIMALS) {
		return "0";
	}
	const fixed = sizeValue.round(szDecimals, Big.roundDown).toFixed(szDecimals);
	if (!fixed.includes(".")) return fixed;
	return fixed.replace(/\.?0+$/, "");
}
