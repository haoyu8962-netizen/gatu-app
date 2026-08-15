import { TWAP_SUBORDER_INTERVAL_SECONDS } from "@/config/trade";
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

export function getTwapRuntimeMinutes(minutes: number | null): number {
	return Math.max(0, Math.round(minutes ?? 0));
}

export function getTwapSuborderCount(minutes: number | null): number {
	const runtime = getTwapRuntimeMinutes(minutes);
	return runtime > 0 ? Math.floor((runtime * 60) / TWAP_SUBORDER_INTERVAL_SECONDS) + 1 : 0;
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
	if (!direction) throw new Error("Trigger price is not valid against the live mark price");
	return { t: { p: triggerPx, a: direction === "above" }, s: stopPx };
}
