import Big from "big.js";
import { ORDER_MIN_NOTIONAL_USD, TWAP_SUBORDER_INTERVAL_SECONDS } from "@/config/trade";
import { formatPriceForOrder } from "@/domain/trade/orders";
import { type Numeric, toBig } from "@/lib/trade/numbers";

export type TwapTriggerDirection = "above" | "below";

export interface TwapOrderDetails {
	t: { p: string; a: boolean } | null;
	s: string | null;
}

export interface TwapPriceFormat {
	assetId: number | undefined;
	szDecimals: number;
}

export class TwapOrderDetailsError extends Error {
	constructor() {
		super("Trigger price is not valid against the live mark price");
		this.name = "TwapOrderDetailsError";
	}
}

interface BuildTwapOrderDetailsInput {
	triggerPx: string | null;
	stopPx: string | null;
	markPx: Numeric;
}

export function formatTwapPriceInput(input: string, { assetId, szDecimals }: TwapPriceFormat): string | null {
	const raw = toBig(input);
	if (!raw) return null;
	return formatPriceForOrder(raw, assetId === undefined ? undefined : { assetId, szDecimals });
}

export function resolveTwapPriceInputs(
	advancedEnabled: boolean,
	triggerInput: string,
	stopInput: string,
	format: TwapPriceFormat,
) {
	return {
		triggerPx: advancedEnabled ? formatTwapPriceInput(triggerInput, format) : null,
		stopPx: advancedEnabled ? formatTwapPriceInput(stopInput, format) : null,
	};
}

export function getTwapRuntimeMinutes(minutes: number | null): number {
	return Math.max(0, Math.round(minutes ?? 0));
}

/**
 * The size of each TWAP suborder as the official terminal estimates it: one suborder every 30 seconds
 * of the runtime plus the first, each at least the minimum order value at the reference price and
 * never more than the whole order. The exchange spaces suborders by size and runtime, with intervals of
 * at least 30 seconds, so a small order runs fewer, larger suborders; null while an input is missing.
 */
export function getTwapSuborderSize(totalSize: Numeric, minutes: number | null, referencePx: Numeric): Big | null {
	const size = toBig(totalSize);
	const runtime = getTwapRuntimeMinutes(minutes);
	if (!size?.gt(0) || runtime <= 0) return null;
	const suborders = Math.floor((runtime * 60) / TWAP_SUBORDER_INTERVAL_SECONDS) + 1;
	const evenSplit = size.div(suborders);
	const price = toBig(referencePx);
	const minimumSize = price?.gt(0) ? Big(ORDER_MIN_NOTIONAL_USD).div(price) : Big(0);
	const suborderSize = evenSplit.gt(minimumSize) ? evenSplit : minimumSize;
	return suborderSize.gt(size) ? size : suborderSize;
}

export function getTwapTriggerDirection(triggerPx: Numeric, markPx: Numeric): TwapTriggerDirection | null {
	const trigger = toBig(triggerPx);
	const mark = toBig(markPx);
	if (!trigger || !mark || trigger.lte(0) || mark.lte(0) || trigger.eq(mark)) return null;
	return trigger.gt(mark) ? "above" : "below";
}

export function buildTwapOrderDetails({
	triggerPx,
	stopPx,
	markPx,
}: BuildTwapOrderDetailsInput): TwapOrderDetails | undefined {
	if (triggerPx === null && stopPx === null) return undefined;
	if (triggerPx === null) return { t: null, s: stopPx };
	const direction = getTwapTriggerDirection(triggerPx, markPx);
	if (!direction) throw new TwapOrderDetailsError();
	return { t: { p: triggerPx, a: direction === "above" }, s: stopPx };
}
