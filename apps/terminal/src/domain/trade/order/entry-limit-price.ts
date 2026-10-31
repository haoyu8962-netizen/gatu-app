import type { OrderType } from "@/config/trade";
import { getRestingMarginPrice } from "@/domain/trade/order/size";
import { getScaleAveragePrice, getScaleOrderMarginNotional, getScaleOrderNotional } from "@/domain/trade/orders";
import { toBig, toNumberOrZero } from "@/lib/trade/numbers";
import { isScaleOrderType, usesLimitPrice } from "@/lib/trade/order-types";
import type { Side } from "@/lib/trade/types";

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
 * For a scale order, what its levels cost for a total size once that size is split into lots, so the
 * order value, fees, margin and balance checks match the orders that are sent. Undefined for other
 * order types and while the scale range is incomplete.
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

/**
 * What a perp entry order of a total size reserves margin on, as the official terminal sizes its
 * maximum: a limit-priced order at `getRestingMarginPrice` of its limit, a scale order level by level.
 * Undefined for orders that execute at mark and while the price or scale range is incomplete.
 */
export function getOrderEntryMarginNotionalForSize(
	input: OrderEntryLimitPxInput,
	size: string,
	side: Side,
	markPx: number,
): number | undefined {
	const mark = toBig(markPx);
	const sizeValue = toBig(size);
	if (!mark?.gt(0) || !sizeValue?.gt(0)) return undefined;
	if (usesLimitPrice(input.orderType)) {
		const limit = toBig(input.limitPriceInput);
		if (!limit?.gt(0)) return undefined;
		return getRestingMarginPrice(side, mark, limit).times(sizeValue).toNumber();
	}
	if (!isScaleOrderType(input.orderType) || input.assetId === null) return undefined;
	const notional = getScaleOrderMarginNotional(
		{
			assetId: input.assetId,
			szDecimals: input.szDecimals,
			sizeValue: size,
			scaleStartPriceInput: input.scaleStartPriceInput,
			scaleEndPriceInput: input.scaleEndPriceInput,
			scaleLevelsNum: input.scaleLevelsNum,
			scaleSkew: input.scaleSkewInput,
		},
		(price) => getRestingMarginPrice(side, mark, price),
	);
	return notional === null ? undefined : notional.toNumber();
}

/**
 * The price an entry order's quote size, value and fees are computed at: the limit price, or for a
 * scale order the size-weighted average of its levels. Undefined falls back to the mark price.
 */
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
