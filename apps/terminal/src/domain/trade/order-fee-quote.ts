import Big from "big.js";
import type { LimitTif, OrderType } from "@/config/trade";
import type { NumberFormatters } from "@/lib/format";
import type { Numeric } from "@/lib/trade/numbers";
import { toBig } from "@/lib/trade/numbers";
import type { Side } from "@/lib/trade/types";

const TENTHS_OF_BASIS_POINT_DIVISOR = 100_000;

export type OrderFeeExecution = "order" | "twap";
export type OrderFeeMarketKind = "perp" | "spot";

export interface OrderFeeQuote {
	orderValue: string;
	protocolRate: string;
	builderRate: string;
	totalRate: string;
	protocolAmount: string;
	builderAmount: string;
	totalAmount: string;
	builderApplies: boolean;
}

interface BuildOrderFeeQuoteInput {
	orderValue: Numeric;
	protocolRate: Numeric;
	builderFeeTenthsBps: Numeric;
	marketKind: OrderFeeMarketKind;
	side: Side;
	execution: OrderFeeExecution;
}

interface ResolveEstimatedProtocolRateInput {
	orderType: OrderType;
	tif: LimitTif;
	takerRate: Numeric;
	makerRate: Numeric;
}

/**
 * Hyperliquid builder fee units are tenths of a basis point: f=10 is 1 bp.
 * Builder codes are part of `order` actions, apply to both perp sides, and only
 * the sell side of spot. The exchange's `twapOrder` action has no builder field.
 */
export function buildOrderFeeQuote(input: BuildOrderFeeQuoteInput): OrderFeeQuote {
	const orderValue = getNonNegative(input.orderValue);
	const protocolRate = toBig(input.protocolRate) ?? Big(0);
	const configuredBuilderRate = builderFeeTenthsBpsToRate(input.builderFeeTenthsBps);
	const builderApplies =
		configuredBuilderRate.gt(0) &&
		input.execution === "order" &&
		(input.marketKind === "perp" || input.side === "sell");
	const builderRate = builderApplies ? configuredBuilderRate : Big(0);
	const totalRate = protocolRate.plus(builderRate);
	const protocolAmount = orderValue.times(protocolRate);
	const builderAmount = orderValue.times(builderRate);

	return {
		orderValue: orderValue.toString(),
		protocolRate: protocolRate.toString(),
		builderRate: builderRate.toString(),
		totalRate: totalRate.toString(),
		protocolAmount: protocolAmount.toString(),
		builderAmount: builderAmount.toString(),
		totalAmount: protocolAmount.plus(builderAmount).toString(),
		builderApplies,
	};
}

/**
 * Only post-only orders are guaranteed maker pricing. A GTC limit can cross
 * the book immediately, so every other execution path uses the conservative
 * taker rate for summaries, confirmations, and liquidation-risk estimates.
 */
export function resolveEstimatedProtocolRate(input: ResolveEstimatedProtocolRateInput): Numeric {
	const canBePostOnly = input.orderType === "limit" || input.orderType === "scale";
	return canBePostOnly && input.tif === "Alo" ? input.makerRate : input.takerRate;
}

export function builderFeeTenthsBpsToRate(builderFeeTenthsBps: Numeric): Big {
	return getNonNegative(builderFeeTenthsBps).div(TENTHS_OF_BASIS_POINT_DIVISOR);
}

export function formatOrderFeeRatePercent(rate: Numeric, numberFormat: NumberFormatters): string {
	return `${numberFormat.formatDecimalString((toBig(rate) ?? Big(0)).times(100).toFixed(4))}%`;
}

function getNonNegative(value: Numeric): Big {
	const parsed = toBig(value);
	return parsed?.gte(0) ? parsed : Big(0);
}
