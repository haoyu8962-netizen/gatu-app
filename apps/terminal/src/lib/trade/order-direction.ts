export type OrderDirection = "buy" | "sell" | "closeLong" | "closeShort";

/**
 * Derives only the direction that is guaranteed by the exchange payload.
 *
 * A non-reduce-only bid/ask can open, add, close, or flip a position, so it
 * must remain Buy/Sell. Reduce-only makes the affected position side
 * unambiguous: a bid closes a short and an ask closes a long.
 */
export function getOrderDirection(side: unknown, reduceOnly: unknown): OrderDirection | null {
	if (typeof reduceOnly !== "boolean") return null;
	if (side === "B") return reduceOnly ? "closeShort" : "buy";
	if (side === "A") return reduceOnly ? "closeLong" : "sell";
	return null;
}
