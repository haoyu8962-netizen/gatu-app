import Big from "big.js";
import { type ExchangeOrder, HL_PERP_PRICE_MAX_DECIMALS, MARKET_ORDER_SLIPPAGE_MAX_PERCENT } from "@/config/trade";
import { buildFrontendMarketOrder } from "@/domain/trade/orders";
import { toBig } from "@/lib/trade/numbers";
import type { Side } from "@/lib/trade/types";

const SIGNED_DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;
const UNSIGNED_DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

export type PositionReverseOrderError =
	| "invalid-asset-id"
	| "invalid-position-size"
	| "invalid-reference-price"
	| "invalid-size-precision"
	| "invalid-slippage"
	| "position-size-below-precision";

export interface PositionReverseOrderInput {
	assetId: number;
	signedPositionSize: string;
	szDecimals: number;
	referencePx: string;
	slippageBps: string;
}

export interface PositionReverseOrderPlan {
	orders: ExchangeOrder[];
	grouping: "na";
	reverseSize: string;
	side: Side | null;
	errors: PositionReverseOrderError[];
}

/**
 * Builds the single FrontendMarket order used to reverse a perpetual position.
 *
 * Every financial input remains a decimal string. The wire size is derived from
 * the fresh signed position with Big.js and must equal abs(szi) * 2 exactly at
 * the market's size precision; silently truncating a reverse is not allowed.
 */
export function buildPositionReverseOrder(input: PositionReverseOrderInput): PositionReverseOrderPlan {
	const errors: PositionReverseOrderError[] = [];
	if (!Number.isSafeInteger(input.assetId) || input.assetId < 0) errors.push("invalid-asset-id");
	if (
		!Number.isSafeInteger(input.szDecimals) ||
		input.szDecimals < 0 ||
		input.szDecimals > HL_PERP_PRICE_MAX_DECIMALS
	) {
		errors.push("invalid-size-precision");
	}

	const signedPositionSize = SIGNED_DECIMAL_PATTERN.test(input.signedPositionSize)
		? toBig(input.signedPositionSize)
		: null;
	if (!signedPositionSize || signedPositionSize.eq(0)) errors.push("invalid-position-size");

	const referencePx = UNSIGNED_DECIMAL_PATTERN.test(input.referencePx) ? toBig(input.referencePx) : null;
	if (!referencePx || referencePx.lte(0)) errors.push("invalid-reference-price");

	const slippageBps = UNSIGNED_DECIMAL_PATTERN.test(input.slippageBps) ? toBig(input.slippageBps) : null;
	const maxSlippageBps = Big(MARKET_ORDER_SLIPPAGE_MAX_PERCENT).times(100);
	if (!slippageBps || slippageBps.lt(0) || slippageBps.gt(maxSlippageBps)) errors.push("invalid-slippage");

	if (errors.length > 0 || !signedPositionSize) {
		return { orders: [], grouping: "na", reverseSize: "0", side: null, errors };
	}

	const side: Side = signedPositionSize.gt(0) ? "sell" : "buy";
	const exactReverseSize = signedPositionSize.abs().times(2);
	const order = buildFrontendMarketOrder({
		assetId: input.assetId,
		side,
		size: exactReverseSize,
		szDecimals: input.szDecimals,
		markPx: input.referencePx,
		slippageBps: input.slippageBps,
		reduceOnly: false,
	});
	const wireSize = toBig(order.s);
	if (!wireSize || wireSize.lte(0) || !wireSize.eq(exactReverseSize)) {
		return {
			orders: [],
			grouping: "na",
			reverseSize: "0",
			side,
			errors: ["position-size-below-precision"],
		};
	}
	if (!toBig(order.p)?.gt(0)) {
		return {
			orders: [],
			grouping: "na",
			reverseSize: String(order.s),
			side,
			errors: ["invalid-reference-price"],
		};
	}

	return { orders: [order], grouping: "na", reverseSize: String(order.s), side, errors: [] };
}
