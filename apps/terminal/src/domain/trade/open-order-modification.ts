import { isSpotAssetId } from "@sairn/hl-react";
import Big from "big.js";
import {
	type ExchangeOrder,
	HL_PERP_PRICE_MAX_DECIMALS,
	HL_PRICE_MAX_DECIMALS,
	TRIGGER_MARKET_SLIPPAGE_BPS,
} from "@/config/trade";
import { formatPriceForOrder, formatSizeForOrder } from "@/domain/trade/orders";
import type { ExchangeParams } from "@/lib/hyperliquid";
import { toBig } from "@/lib/trade/numbers";
import type { OpenOrder } from "@/lib/trade/open-orders";

export type OpenOrderModifyField = "size" | "triggerPrice" | "limitPrice";
export type OpenOrderModifyEnvironment = "Mainnet" | "Testnet";
export type OpenOrderModifyMarketKind = "perp" | "spot" | "builderPerp";

export type OpenOrderModifyBlockReason =
	| "ambiguous-order"
	| "grouped-order"
	| "invalid-market-binding"
	| "invalid-order-shape"
	| "invalid-owner"
	| "invalid-price"
	| "invalid-size"
	| "invalid-trigger-direction"
	| "market-binding-changed"
	| "mark-price-unavailable"
	| "no-change"
	| "order-changed"
	| "order-not-open"
	| "position-tpsl"
	| "session-changed"
	| "size-exceeds-remaining"
	| "snapshot-not-ready"
	| "trigger-price-not-applicable"
	| "unsupported-market-order"
	| "unsupported-order-type"
	| "unsupported-system-order"
	| "unsupported-tif";

export interface OpenOrderModifyCapability {
	supported: boolean;
	reason: OpenOrderModifyBlockReason | null;
}

export interface OpenOrderModifyCapabilities {
	size: OpenOrderModifyCapability;
	triggerPrice: OpenOrderModifyCapability;
	limitPrice: OpenOrderModifyCapability;
}

export interface OpenOrderModifyMarketBinding {
	coin: string;
	assetId: number;
	szDecimals: number;
	kind: OpenOrderModifyMarketKind;
	markPx?: string;
}

interface OpenOrderModifyFingerprint {
	oid: number;
	coin: string;
	side: OpenOrder["side"];
	limitPx: string;
	sz: string;
	origSz: string;
	timestamp: number;
	triggerCondition: string;
	isTrigger: boolean;
	triggerPx: string;
	isPositionTpsl: boolean;
	reduceOnly: boolean;
	orderType: OpenOrder["orderType"];
	tif: OpenOrder["tif"];
	cloid: OpenOrder["cloid"];
}

export interface OpenOrderModifyTarget {
	owner: string;
	env: OpenOrderModifyEnvironment;
	field: OpenOrderModifyField;
	assetId: number;
	szDecimals: number;
	marketKind: OpenOrderModifyMarketKind;
	order: OpenOrderModifyFingerprint;
}

export interface CreateOpenOrderModifyTargetParams {
	owner: string;
	env: OpenOrderModifyEnvironment;
	field: OpenOrderModifyField;
	market: OpenOrderModifyMarketBinding;
	order: OpenOrder;
}

export type CreateOpenOrderModifyTargetResult =
	| { status: "ready"; target: OpenOrderModifyTarget }
	| { status: "blocked"; reason: OpenOrderModifyBlockReason };

export interface OpenOrderModifySessionBinding {
	owner: string;
	env: OpenOrderModifyEnvironment;
}

export interface OpenOrderModifySnapshot {
	owner: string;
	env: OpenOrderModifyEnvironment;
	status: "active" | "error" | "idle" | "subscribing";
	orders: readonly OpenOrder[];
}

export interface BuildOpenOrderModifyPlanParams {
	target: OpenOrderModifyTarget;
	session: OpenOrderModifySessionBinding;
	snapshot: OpenOrderModifySnapshot;
	market: OpenOrderModifyMarketBinding;
	value: string;
}

export interface ReadyOpenOrderModifyPlan {
	status: "ready";
	params: ExchangeParams<"batchModify">;
	normalizedValue: string;
}

export type OpenOrderModifyPlan = ReadyOpenOrderModifyPlan | { status: "blocked"; reason: OpenOrderModifyBlockReason };

const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const CLIENT_ORDER_ID_PATTERN = /^0x[a-fA-F0-9]{32}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const LIMIT_TIFS = new Set<OpenOrder["tif"]>(["Gtc", "Alo"]);
const TRIGGER_ORDER_TYPES = new Set<OpenOrder["orderType"]>([
	"Stop Market",
	"Stop Limit",
	"Take Profit Market",
	"Take Profit Limit",
]);
const SYSTEM_ORDER_TYPES = new Set<OpenOrder["orderType"]>(["Twap Slice", "Vault Close", "Spot Dust Conversion"]);

function supported(reason: OpenOrderModifyBlockReason | null = null): OpenOrderModifyCapability {
	return { supported: reason === null, reason };
}

function blocked(reason: OpenOrderModifyBlockReason): OpenOrderModifyPlan {
	return { status: "blocked", reason };
}

function isValidOwner(owner: string): boolean {
	return EVM_ADDRESS_PATTERN.test(owner) && owner.toLowerCase() !== ZERO_ADDRESS;
}

function isSupportedEnvironment(env: string): env is OpenOrderModifyEnvironment {
	return env === "Mainnet" || env === "Testnet";
}

function isSupportedTriggerOrder(order: OpenOrder): boolean {
	return TRIGGER_ORDER_TYPES.has(order.orderType);
}

function isTriggerMarketOrder(order: OpenOrder): boolean {
	return order.orderType === "Stop Market" || order.orderType === "Take Profit Market";
}

function isStopOrder(order: OpenOrder): boolean {
	return order.orderType === "Stop Market" || order.orderType === "Stop Limit";
}

function getOrderShapeBlockReason(order: OpenOrder): OpenOrderModifyBlockReason | null {
	if (order.coin.startsWith("#")) return "invalid-market-binding";
	if (!Array.isArray(order.children) || order.children.length > 0) return "grouped-order";
	if (order.isPositionTpsl || (order.isTrigger && toBig(order.sz)?.eq(0))) return "position-tpsl";
	if (order.cloid !== null && (typeof order.cloid !== "string" || !CLIENT_ORDER_ID_PATTERN.test(order.cloid))) {
		return "invalid-order-shape";
	}
	if (order.orderType === "Market") return "unsupported-market-order";
	if (SYSTEM_ORDER_TYPES.has(order.orderType)) return "unsupported-system-order";
	if (order.orderType !== "Limit" && !isSupportedTriggerOrder(order)) return "unsupported-order-type";
	if (
		!Number.isSafeInteger(order.oid) ||
		order.oid < 0 ||
		typeof order.coin !== "string" ||
		order.coin.length === 0 ||
		(order.side !== "B" && order.side !== "A") ||
		typeof order.reduceOnly !== "boolean" ||
		typeof order.isTrigger !== "boolean" ||
		typeof order.isPositionTpsl !== "boolean" ||
		!Number.isSafeInteger(order.timestamp) ||
		order.timestamp < 0 ||
		typeof order.triggerCondition !== "string"
	) {
		return "invalid-order-shape";
	}

	const limitPx = toBig(order.limitPx);
	const remainingSize = toBig(order.sz);
	const originalSize = toBig(order.origSz);
	const triggerPx = toBig(order.triggerPx);
	if (
		!limitPx?.gt(0) ||
		!remainingSize?.gt(0) ||
		!originalSize?.gt(0) ||
		remainingSize.gt(originalSize) ||
		!triggerPx
	) {
		return "invalid-order-shape";
	}

	if (order.orderType === "Limit") {
		if (order.isTrigger || !triggerPx.eq(0)) return "invalid-order-shape";
		if (!LIMIT_TIFS.has(order.tif)) return "unsupported-tif";
		return null;
	}

	if (!order.isTrigger || !triggerPx.gt(0)) return "invalid-order-shape";
	// A trigger replacement needs batchModify.a=true, which places the replacement even when canceling
	// the original failed (it may have just triggered). Only reduce-only triggers are offered, as the
	// official terminal's always-place modify cannot then open a second position; others are cancelled
	// and placed again.
	if (!order.reduceOnly) return "unsupported-order-type";
	if (order.tif !== null) return "unsupported-tif";
	return null;
}

export function getOpenOrderModifyCapabilities(order: OpenOrder): OpenOrderModifyCapabilities {
	const shapeReason = getOrderShapeBlockReason(order);
	if (shapeReason) {
		return { size: supported(shapeReason), triggerPrice: supported(shapeReason), limitPrice: supported(shapeReason) };
	}
	return {
		size: supported(),
		triggerPrice: order.isTrigger ? supported() : supported("trigger-price-not-applicable"),
		limitPrice: order.orderType === "Limit" ? supported() : supported("unsupported-order-type"),
	};
}

function getMarketBindingBlockReason(market: OpenOrderModifyMarketBinding): OpenOrderModifyBlockReason | null {
	if (
		typeof market.coin !== "string" ||
		market.coin.length === 0 ||
		!Number.isSafeInteger(market.assetId) ||
		market.assetId < 0 ||
		!Number.isSafeInteger(market.szDecimals) ||
		market.szDecimals < 0 ||
		!(["perp", "spot", "builderPerp"] as const).includes(market.kind)
	) {
		return "invalid-market-binding";
	}

	const maxDecimals = market.kind === "spot" ? HL_PRICE_MAX_DECIMALS : HL_PERP_PRICE_MAX_DECIMALS;
	if (market.szDecimals > maxDecimals) return "invalid-market-binding";
	if (isSpotAssetId(market.assetId) !== (market.kind === "spot")) return "invalid-market-binding";
	return null;
}

function createFingerprint(order: OpenOrder): OpenOrderModifyFingerprint {
	return {
		oid: order.oid,
		coin: order.coin,
		side: order.side,
		limitPx: order.limitPx,
		sz: order.sz,
		origSz: order.origSz,
		timestamp: order.timestamp,
		triggerCondition: order.triggerCondition,
		isTrigger: order.isTrigger,
		triggerPx: order.triggerPx,
		isPositionTpsl: order.isPositionTpsl,
		reduceOnly: order.reduceOnly,
		orderType: order.orderType,
		tif: order.tif,
		cloid: order.cloid,
	};
}

export function createOpenOrderModifyTarget(
	params: CreateOpenOrderModifyTargetParams,
): CreateOpenOrderModifyTargetResult {
	if (!isValidOwner(params.owner)) return { status: "blocked", reason: "invalid-owner" };
	if (!isSupportedEnvironment(params.env)) return { status: "blocked", reason: "session-changed" };

	const marketReason = getMarketBindingBlockReason(params.market);
	if (marketReason || params.market.coin !== params.order.coin) {
		return { status: "blocked", reason: marketReason ?? "invalid-market-binding" };
	}

	const capability = getOpenOrderModifyCapabilities(params.order)[params.field];
	if (!capability.supported || capability.reason) {
		return { status: "blocked", reason: capability.reason ?? "invalid-order-shape" };
	}

	return {
		status: "ready",
		target: {
			owner: params.owner.toLowerCase(),
			env: params.env,
			field: params.field,
			assetId: params.market.assetId,
			szDecimals: params.market.szDecimals,
			marketKind: params.market.kind,
			order: createFingerprint(params.order),
		},
	};
}

function numericValuesEqual(left: string, right: string): boolean {
	const leftValue = toBig(left);
	const rightValue = toBig(right);
	return leftValue !== null && rightValue !== null && leftValue.eq(rightValue);
}

function orderMatchesTarget(order: OpenOrder, target: OpenOrderModifyTarget): boolean {
	const opened = target.order;
	return (
		order.oid === opened.oid &&
		order.coin === opened.coin &&
		order.side === opened.side &&
		numericValuesEqual(order.limitPx, opened.limitPx) &&
		numericValuesEqual(order.sz, opened.sz) &&
		numericValuesEqual(order.origSz, opened.origSz) &&
		order.timestamp === opened.timestamp &&
		order.triggerCondition === opened.triggerCondition &&
		order.isTrigger === opened.isTrigger &&
		numericValuesEqual(order.triggerPx, opened.triggerPx) &&
		order.isPositionTpsl === opened.isPositionTpsl &&
		order.reduceOnly === opened.reduceOnly &&
		order.orderType === opened.orderType &&
		order.tif === opened.tif &&
		order.cloid === opened.cloid &&
		Array.isArray(order.children) &&
		order.children.length === 0
	);
}

function normalizeSizeExactly(value: string, szDecimals: number): string | null {
	const input = toBig(value);
	if (!input?.gt(0)) return null;
	const normalized = formatSizeForOrder(input, szDecimals);
	const normalizedValue = toBig(normalized);
	return normalizedValue?.gt(0) && normalizedValue.eq(input) ? normalized : null;
}

function normalizePriceExactly(value: string, market: OpenOrderModifyMarketBinding): string | null {
	const input = toBig(value);
	if (!input?.gt(0)) return null;
	const normalized = formatPriceForOrder(input, market);
	const normalizedValue = toBig(normalized);
	return normalizedValue?.gt(0) && normalizedValue.eq(input) ? normalized : null;
}

function triggerPriceIsValid(order: OpenOrder, triggerPx: Big, markPx: Big): boolean {
	if (isStopOrder(order)) return order.side === "B" ? triggerPx.gt(markPx) : triggerPx.lt(markPx);
	return order.side === "B" ? triggerPx.lt(markPx) : triggerPx.gt(markPx);
}

function getTriggerMarketOrderPrice(
	order: OpenOrder,
	triggerPx: string,
	market: OpenOrderModifyMarketBinding,
): string | null {
	const trigger = toBig(triggerPx);
	if (!trigger?.gt(0)) return null;
	const slippage = Big(TRIGGER_MARKET_SLIPPAGE_BPS).div(10_000);
	const multiplier = order.side === "B" ? Big(1).plus(slippage) : Big(1).minus(slippage);
	const normalized = formatPriceForOrder(trigger.times(multiplier), market);
	return toBig(normalized)?.gt(0) ? normalized : null;
}

function getTriggerType(order: OpenOrder, triggerPx: string): ExchangeOrder["t"] {
	return {
		trigger: {
			isMarket: isTriggerMarketOrder(order),
			triggerPx,
			tpsl: isStopOrder(order) ? "sl" : "tp",
		},
	};
}

function buildExchangeOrder(
	target: OpenOrderModifyTarget,
	latest: OpenOrder,
	market: OpenOrderModifyMarketBinding,
	value: string,
): OpenOrderModifyPlan {
	const latestSize = normalizeSizeExactly(latest.sz, target.szDecimals);
	const latestPrice = normalizePriceExactly(latest.limitPx, market);
	if (!latestSize || !latestPrice) return blocked("invalid-order-shape");

	let size = latestSize;
	let triggerPx = latest.isTrigger ? normalizePriceExactly(latest.triggerPx, market) : null;
	let orderPrice = latestPrice;
	let normalizedValue: string;

	if (target.field === "size") {
		const requestedSize = normalizeSizeExactly(value, target.szDecimals);
		if (!requestedSize) return blocked("invalid-size");
		const requested = toBig(requestedSize);
		const remaining = toBig(latestSize);
		if (!requested || !remaining) return blocked("invalid-size");
		if (requested.gt(remaining)) return blocked("size-exceeds-remaining");
		if (requested.eq(remaining)) return blocked("no-change");
		size = requestedSize;
		normalizedValue = requestedSize;
	} else if (target.field === "limitPrice") {
		if (latest.orderType !== "Limit") return blocked("unsupported-order-type");
		const requestedPrice = normalizePriceExactly(value, market);
		if (!requestedPrice) return blocked("invalid-price");
		if (numericValuesEqual(requestedPrice, latestPrice)) return blocked("no-change");
		orderPrice = requestedPrice;
		normalizedValue = requestedPrice;
	} else {
		if (!latest.isTrigger || !triggerPx) return blocked("trigger-price-not-applicable");
		const requestedTrigger = normalizePriceExactly(value, market);
		if (!requestedTrigger) return blocked("invalid-price");
		if (numericValuesEqual(requestedTrigger, triggerPx)) return blocked("no-change");
		const markPx = toBig(market.markPx);
		if (!markPx?.gt(0)) return blocked("mark-price-unavailable");
		const requestedTriggerValue = toBig(requestedTrigger);
		if (!requestedTriggerValue || !triggerPriceIsValid(latest, requestedTriggerValue, markPx)) {
			return blocked("invalid-trigger-direction");
		}
		triggerPx = requestedTrigger;
		if (isTriggerMarketOrder(latest)) {
			const nextOrderPrice = getTriggerMarketOrderPrice(latest, requestedTrigger, market);
			if (!nextOrderPrice) return blocked("invalid-price");
			orderPrice = nextOrderPrice;
		}
		normalizedValue = requestedTrigger;
	}

	let orderType: ExchangeOrder["t"];
	if (latest.orderType === "Limit") {
		if (
			!LIMIT_TIFS.has(latest.tif) ||
			latest.tif === null ||
			latest.tif === "FrontendMarket" ||
			latest.tif === "LiquidationMarket"
		) {
			return blocked("unsupported-tif");
		}
		orderType = { limit: { tif: latest.tif } };
	} else {
		if (!triggerPx) return blocked("invalid-order-shape");
		orderType = getTriggerType(latest, triggerPx);
	}

	const order: ExchangeOrder = {
		a: target.assetId,
		b: latest.side === "B",
		p: orderPrice,
		s: size,
		r: latest.reduceOnly,
		t: orderType,
	};

	const modifies = [{ oid: latest.oid, order }];
	return {
		status: "ready",
		normalizedValue,
		params: latest.isTrigger ? { modifies, a: true } : { modifies },
	};
}

export function buildOpenOrderModifyPlan(params: BuildOpenOrderModifyPlanParams): OpenOrderModifyPlan {
	const { target, session, snapshot, market } = params;
	if (
		!isValidOwner(session.owner) ||
		!isSupportedEnvironment(session.env) ||
		session.owner.toLowerCase() !== target.owner ||
		session.env !== target.env
	) {
		return blocked("session-changed");
	}
	if (snapshot.status !== "active") return blocked("snapshot-not-ready");
	if (!isValidOwner(snapshot.owner) || snapshot.owner.toLowerCase() !== target.owner || snapshot.env !== target.env) {
		return blocked("session-changed");
	}

	const marketReason = getMarketBindingBlockReason(market);
	if (marketReason) return blocked("market-binding-changed");
	if (
		market.coin !== target.order.coin ||
		market.assetId !== target.assetId ||
		market.szDecimals !== target.szDecimals ||
		market.kind !== target.marketKind
	) {
		return blocked("market-binding-changed");
	}

	const matches = snapshot.orders.filter((order) => order.oid === target.order.oid);
	if (matches.length === 0) return blocked("order-not-open");
	if (matches.length !== 1) return blocked("ambiguous-order");
	const latest = matches[0];
	if (!latest || latest.coin !== target.order.coin) return blocked("order-changed");

	const capability = getOpenOrderModifyCapabilities(latest)[target.field];
	if (!capability.supported || capability.reason) {
		return blocked(capability.reason ?? "invalid-order-shape");
	}
	if (!orderMatchesTarget(latest, target)) return blocked("order-changed");

	return buildExchangeOrder(target, latest, market, params.value);
}

function exchangeOrdersEqual(left: ExchangeOrder, right: ExchangeOrder): boolean {
	if (
		left.a !== right.a ||
		left.b !== right.b ||
		!numericValuesEqual(String(left.p), String(right.p)) ||
		!numericValuesEqual(String(left.s), String(right.s)) ||
		left.r !== right.r ||
		left.c !== right.c
	) {
		return false;
	}
	if ("limit" in left.t && "limit" in right.t) return left.t.limit.tif === right.t.limit.tif;
	if (!("trigger" in left.t) || !("trigger" in right.t)) return false;
	return (
		left.t.trigger.isMarket === right.t.trigger.isMarket &&
		left.t.trigger.tpsl === right.t.trigger.tpsl &&
		numericValuesEqual(String(left.t.trigger.triggerPx), String(right.t.trigger.triggerPx))
	);
}

export function openOrderModifyParamsEqual(
	left: ExchangeParams<"batchModify">,
	right: ExchangeParams<"batchModify">,
): boolean {
	if (left.a !== right.a || left.modifies.length !== 1 || right.modifies.length !== 1) return false;
	const leftModify = left.modifies[0];
	const rightModify = right.modifies[0];
	return (
		leftModify !== undefined &&
		rightModify !== undefined &&
		leftModify.oid === rightModify.oid &&
		exchangeOrdersEqual(leftModify.order, rightModify.order)
	);
}
