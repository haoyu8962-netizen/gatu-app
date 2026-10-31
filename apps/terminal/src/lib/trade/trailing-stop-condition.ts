import { msg } from "@lingui/core/macro";
import type Big from "big.js";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import type { NumberFormatters } from "@/lib/format";
import { toBig } from "@/lib/trade/numbers";
import { isTrailingStopOrder, type OpenOrder } from "@/lib/trade/open-orders";
import type { Translate } from "@/lib/translate";

export type TrailingStopCondition =
	| { kind: "activation"; price: string | null; retracement: string }
	| { kind: "trigger"; price: string; retracement: string; watermark: string };

export interface TrailingStopConditionLabels {
	label: string;
	watermarkLabel: string | null;
}

interface TrailingStopConditionFormatters {
	translate: Translate;
	formatPrice: (price: string) => string;
	formatDecimalString: NumberFormatters["formatDecimalString"];
}

type TrailingStopOrderFields = Pick<OpenOrder, "side" | "triggerCondition" | "triggerPx">;

const RETRACEMENT_PATTERN = /(?:^|,\s*)retracement\s+([^,]+)/i;
const ACTIVATION_PATTERN = /(?:^|,\s*)activation\s+(?:above|below)\s+([^,]+)/i;
const BEST_PATTERN = /(?:^|,\s*)best\s+([^,]+)/i;

/**
 * Reads a trailing stop's `triggerCondition` with the official terminal's grammar: a `retracement`
 * (a price distance, or a percentage of the best price), an optional `activation above|below` price and
 * the `best` price reached since activation, or `waiting` before it. Before activation the order shows
 * its activation price (the trigger price when the condition names none); after it, the trigger price
 * is the best price minus the retracement for a sell and plus it for a buy. Returns null when the
 * condition does not follow that grammar, so callers show the exchange's text as sent.
 */
export function parseTrailingStopCondition(order: TrailingStopOrderFields): TrailingStopCondition | null {
	const retracement = RETRACEMENT_PATTERN.exec(order.triggerCondition)?.[1]?.trim();
	if (!retracement) return null;

	const best = BEST_PATTERN.exec(order.triggerCondition)?.[1]?.trim();
	if (best === undefined || best.toLowerCase() === "waiting") {
		const activation = ACTIVATION_PATTERN.exec(order.triggerCondition)?.[1]?.trim();
		const triggerPx = toBig(order.triggerPx);
		const fallbackPrice = triggerPx && !triggerPx.eq(0) ? order.triggerPx : null;
		return { kind: "activation", price: activation && toBig(activation) ? activation : fallbackPrice, retracement };
	}

	const watermark = toBig(best);
	if (!watermark) return null;
	const distance = getRetracementDistance(retracement, watermark);
	if (!distance) return null;
	const price = order.side === "A" ? watermark.minus(distance) : watermark.plus(distance);
	return { kind: "trigger", price: price.toString(), retracement, watermark: watermark.toString() };
}

/**
 * The trigger-condition text of a trailing stop, as the official terminal writes it: `Activation: …`
 * before activation and `Trigger: …` after it, each with the retracement, plus the best price reached
 * (`Watermark: …`) once active. Null for any other order or a condition this grammar cannot read.
 */
export function getTrailingStopConditionLabels(
	order: TrailingStopOrderFields & Pick<OpenOrder, "orderType">,
	{ translate, formatPrice, formatDecimalString }: TrailingStopConditionFormatters,
): TrailingStopConditionLabels | null {
	if (!isTrailingStopOrder(order)) return null;
	const condition = parseTrailingStopCondition(order);
	if (!condition) return null;

	const price = condition.price === null ? FALLBACK_VALUE_PLACEHOLDER : formatPrice(condition.price);
	const retracement = formatRetracement(condition.retracement, formatDecimalString);
	if (condition.kind === "activation") {
		return { label: translate(msg`Activation: ${price} / Retracement: ${retracement}`), watermarkLabel: null };
	}
	const watermark = formatPrice(condition.watermark);
	return {
		label: translate(msg`Trigger: ${price} / Retracement: ${retracement}`),
		watermarkLabel: translate(msg`Watermark: ${watermark}`),
	};
}

function getRetracementDistance(retracement: string, watermark: Big): Big | null {
	if (!retracement.endsWith("%")) return toBig(retracement);
	const percent = toBig(retracement.slice(0, -1));
	return percent ? watermark.times(percent).div(100) : null;
}

function formatRetracement(retracement: string, formatDecimalString: NumberFormatters["formatDecimalString"]): string {
	const isPercent = retracement.endsWith("%");
	const formatted = formatDecimalString((isPercent ? retracement.slice(0, -1) : retracement).trim());
	if (formatted === FALLBACK_VALUE_PLACEHOLDER) return retracement;
	return isPercent ? `${formatted}%` : formatted;
}
