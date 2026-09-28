import type { InsufficientMarginHint } from "@/lib/errors/exchange-error-text";
import { toBig } from "@/lib/trade/numbers";
import type { Side } from "@/lib/trade/types";

interface ReduceOnlyMarginHintInput {
	side: Side;
	size: string;
	reduceOnly: boolean;
	positionSize: string | undefined;
}

/**
 * Suggests Reduce Only for a perp order the exchange rejected for insufficient margin when the
 * account holds an opposite position and the order is at most twice its size, as the official
 * terminal does. The official terminal otherwise suggests canceling open orders in the market.
 */
export function getReduceOnlyMarginHint({
	side,
	size,
	reduceOnly,
	positionSize,
}: ReduceOnlyMarginHintInput): InsufficientMarginHint | undefined {
	if (reduceOnly) return undefined;
	const position = toBig(positionSize);
	const orderSize = toBig(size);
	if (!position || position.eq(0) || !orderSize?.gt(0)) return undefined;
	const opposite = side === "buy" ? position.lt(0) : position.gt(0);
	return opposite && orderSize.lte(position.abs().times(2)) ? { kind: "reduce-only" } : undefined;
}
