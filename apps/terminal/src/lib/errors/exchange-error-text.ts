import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { Translate } from "@/lib/translate";

/**
 * One exchange rejection text. `index` is the zero-based position of the rejected item in a
 * batch when the exchange (or our order tracking) reported one.
 */
export interface ExchangeErrorEntry {
	index?: number;
	text: string;
}

/** Context the order form can add to an insufficient-margin rejection, as the official terminal does. */
export type InsufficientMarginHint = { kind: "reduce-only" } | { kind: "cancel-orders"; market: string };

interface ExchangeErrorRule {
	pattern: RegExp;
	describe: (match: RegExpMatchArray, hint?: InsufficientMarginHint) => MessageDescriptor;
}

const INSUFFICIENT_MARGIN = /^Insufficient margin to place order\.?$/i;

/**
 * Known Hyperliquid rejection texts. The documented order and cancel errors come from
 * https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/error-responses; the others
 * were observed from the exchange or are mapped by the official terminal. Unknown texts are shown
 * unchanged, so only add a rule for an exact text that has been seen or documented.
 */
const RULES: readonly ExchangeErrorRule[] = [
	{
		pattern: /^Price must be divisible by tick size\.?$/i,
		describe: () => msg`Price must be a multiple of the tick size.`,
	},
	{
		pattern: /^Order must have minimum value of \$(\S+?)\.?$/i,
		describe: (match) => {
			const amount = match[1];
			return msg`Order value must be at least $${amount}.`;
		},
	},
	{
		pattern: /^Order must have minimum value of (\S+) (\S+?)\.?$/i,
		describe: (match) => {
			const amount = match[1];
			const token = match[2];
			return msg`Order value must be at least ${amount} ${token}.`;
		},
	},
	{
		pattern: INSUFFICIENT_MARGIN,
		describe: (_match, hint) => {
			if (hint?.kind === "reduce-only") return msg`Insufficient margin to place order. Try using Reduce Only.`;
			if (hint?.kind === "cancel-orders") {
				const market = hint.market;
				return msg`Insufficient margin to place order. Try canceling open ${market} orders.`;
			}
			return msg`Insufficient margin to place order.`;
		},
	},
	{
		pattern: /^Reduce only order would increase position\.?$/i,
		describe: () => msg`A Reduce Only order cannot increase the position.`,
	},
	{
		pattern: /^Post only order would have immediately matched, bbo was (.+?)\.?$/i,
		describe: (match) => {
			const bbo = match[1];
			return msg`A Post Only order would have matched immediately. Best bid and offer: ${bbo}.`;
		},
	},
	{
		pattern: /^Order could not immediately match against any resting orders\.?$/i,
		describe: () => msg`The order could not immediately match any resting orders.`,
	},
	{
		pattern: /^Invalid TP\/SL price\.?$/i,
		describe: () => msg`Invalid TP/SL price.`,
	},
	{
		pattern: /^No liquidity available for market order\.?$/i,
		describe: () => msg`No liquidity is available for this market order.`,
	},
	{
		pattern: /^Order would increase open interest while open interest is capped\.?$/i,
		describe: () => msg`This market is at its open interest cap, so the order cannot increase open interest.`,
	},
	{
		pattern: /^Order rejected due to price more aggressive than oracle while at open interest cap\.?$/i,
		describe: () =>
			msg`While this market is at its open interest cap, the price cannot be more aggressive than the oracle price.`,
	},
	{
		pattern: /^Order would increase open interest too quickly\.?$/i,
		describe: () => msg`The order would increase open interest too quickly.`,
	},
	{
		pattern: /^(?:\(Spot-only\) )?Order has insufficient spot balance to trade\.?$/i,
		describe: () => msg`Insufficient spot balance for this order.`,
	},
	{
		pattern: /^Order price too far from oracle\.?$/i,
		describe: () => msg`The order price is too far from the oracle price.`,
	},
	{
		pattern: /^Order would cause position to exceed margin tier limit at current leverage\.?$/i,
		describe: () => msg`The order would exceed the maximum position size at the current leverage.`,
	},
	{
		pattern: /^Order was never placed, already canceled, or filled\.?$/i,
		describe: () => msg`The order was never placed, was already canceled, or has filled.`,
	},
	{
		pattern:
			/^Cross position does not have sufficient margin available to decrease leverage\. To decrease leverage, deposit more collateral\.?$/i,
		describe: () =>
			msg`Cross positions do not have enough available margin to lower the leverage. Deposit more collateral to lower it.`,
	},
	{
		pattern: /^Action already expired\.?$/i,
		describe: () => msg`The request expired before the exchange processed it. Try again.`,
	},
	{
		pattern: /^Too many extra agents for cumulative volume traded\. Current limit is (\d+)\.?$/i,
		describe: (match) => {
			const limit = match[1];
			return msg`This account already has the ${limit} named API wallets its trading volume allows. Remove one on the API Wallet page before approving another.`;
		},
	},
	{
		pattern: /^Must deposit before performing actions\.?(?: User: (0x[0-9a-f]{40})\.?)?$/i,
		describe: (match) => {
			const user = match[1];
			if (!user) return msg`No balance on Hyperliquid. Deposit first.`;
			return msg`Account ${user} has no balance on Hyperliquid. Deposit first.`;
		},
	},
];

const OUR_BATCH_ENTRY = /^Order (\d+): (.+)$/s;
const OUR_BATCH_SEPARATOR = /; (?=Order \d+: )/;
const SDK_BATCH_ENTRY = /^[A-Za-z]+ (\d+): (.+)$/s;
const SDK_BATCH_SEPARATOR = /, (?=[A-Za-z]+ \d+: )/;

/** Finds the translatable description of one exchange rejection text, or null when it is unknown. */
export function describeExchangeErrorText(text: string, hint?: InsufficientMarginHint): MessageDescriptor | null {
	const trimmed = text.trim();
	for (const rule of RULES) {
		const match = trimmed.match(rule.pattern);
		if (match) return rule.describe(match, hint);
	}
	return null;
}

export function isInsufficientMarginText(text: string): boolean {
	return INSUFFICIENT_MARGIN.test(text.trim());
}

/**
 * Splits a combined rejection message into entries. Understands our order tracking format
 * ("Order 2: …" joined by "; ") and the SDK batch format ("order 1: …" joined by ", "). It splits
 * only where the next entry's prefix starts, so a separator inside an exchange text stays part of
 * that text. Prefer the structured entries of a response; this is for a message that lost them.
 */
export function parseExchangeErrorText(text: string): ExchangeErrorEntry[] {
	const ours = text.split(OUR_BATCH_SEPARATOR);
	if (ours.every((part) => OUR_BATCH_ENTRY.test(part))) {
		return ours.map((part) => {
			const match = part.match(OUR_BATCH_ENTRY) as RegExpMatchArray;
			return { index: Number(match[1]) - 1, text: match[2] };
		});
	}
	const sdkParts = text.split(SDK_BATCH_SEPARATOR);
	if (sdkParts.every((part) => SDK_BATCH_ENTRY.test(part))) {
		return sdkParts.map((part) => {
			const match = part.match(SDK_BATCH_ENTRY) as RegExpMatchArray;
			return { index: Number(match[1]), text: match[2] };
		});
	}
	return [{ text }];
}

/**
 * Renders exchange rejection entries in the active language. Known texts are translated; unknown
 * texts stay exactly as the exchange sent them, without truncation.
 */
export function formatExchangeErrorEntries(
	entries: readonly ExchangeErrorEntry[],
	translate: Translate,
	hint?: InsufficientMarginHint,
): string {
	const lines = entries.map((entry) => {
		const descriptor = describeExchangeErrorText(entry.text, hint);
		return descriptor ? translate(descriptor) : entry.text;
	});
	if (entries.length === 1) return lines[0] ?? "";
	return entries
		.map((entry, position) => {
			const line = lines[position];
			if (entry.index === undefined) return line;
			const order = entry.index + 1;
			return translate(msg`Order ${order}: ${line}`);
		})
		.join("; ");
}

/** Renders one rejection text exactly as the exchange sent it, translated when it is known. */
export function formatExchangeErrorText(text: string, translate: Translate, hint?: InsufficientMarginHint): string {
	return formatExchangeErrorEntries([{ text }], translate, hint);
}
