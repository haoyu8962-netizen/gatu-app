import type { OrderType } from "@/config/trade";
import { getScaleAveragePrice } from "@/domain/trade/orders";
import { toNumberOrZero } from "@/lib/trade/numbers";
import { isScaleOrderType, usesLimitPrice } from "@/lib/trade/order-types";

interface OrderEntryLimitPxInput {
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
