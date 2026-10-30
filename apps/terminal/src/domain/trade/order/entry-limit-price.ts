import type { OrderType } from "@/config/trade";
import { getScaleAveragePrice, getScaleOrderNotional } from "@/domain/trade/orders";
import { toNumberOrZero } from "@/lib/trade/numbers";
import { isScaleOrderType, usesLimitPrice } from "@/lib/trade/order-types";

export interface OrderEntryLimitPxInput {
	orderType: OrderType;
	assetId: number | null;
	szDecimals: number;
	limitPriceInput: string;
	scaleStartPriceInput: string;
	scaleEndPriceInput: string;
	scaleLevelsNum: number | null;
	scaleSkewInput: string;
}

/**
 * The price an entry order's quote size, value and fees are computed at: the limit price, or for a
 * scale order the size-weighted average of its levels. Undefined falls back to the mark price.
 */
/**
 * For a scale order, what its levels cost for a total size once that size is split into lots, so the
 * order value, fees and balance checks match the orders that are sent. Undefined for other order
 * types and while the scale range is incomplete.
 */
export function getOrderEntryValueForSize(input: OrderEntryLimitPxInput, size: string): number | undefined {
	if (!isScaleOrderType(input.orderType) || input.assetId === null) return undefined;
	const notional = getScaleOrderNotional({
		assetId: input.assetId,
		szDecimals: input.szDecimals,
		sizeValue: size,
		scaleStartPriceInput: input.scaleStartPriceInput,
		scaleEndPriceInput: input.scaleEndPriceInput,
		scaleLevelsNum: input.scaleLevelsNum,
		scaleSkew: input.scaleSkewInput,
	});
	return notional === null ? undefined : notional.toNumber();
}

export function getOrderEntryLimitPx(input: OrderEntryLimitPxInput): number | undefined {
	if (usesLimitPrice(input.orderType)) return toNumberOrZero(input.limitPriceInput);
	if (!isScaleOrderType(input.orderType) || input.assetId === null) return undefined;
	return (
		getScaleAveragePrice({
			assetId: input.assetId,
			szDecimals: input.szDecimals,
			scaleStartPriceInput: input.scaleStartPriceInput,
			scaleEndPriceInput: input.scaleEndPriceInput,
			scaleLevelsNum: input.scaleLevelsNum,
			scaleSkew: input.scaleSkewInput,
		}) ?? undefined
	);
}
