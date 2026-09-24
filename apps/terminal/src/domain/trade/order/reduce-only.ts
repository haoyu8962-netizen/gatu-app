import Big from "big.js";
import { toBig } from "@/lib/trade/numbers";
import type { Side } from "@/lib/trade/types";

export const ENTRY_POSITION_MAX_AGE_MS = 60_000;
export interface EntryPositionSnapshot {
	ready: boolean;
	receivedAt: number | undefined;
	/** Zero is explicit and only comes from a complete, current account snapshot. */
	signedSize: string | undefined;
}
export interface ReduceOnlyCapacity {
	status: "ordinary" | "unavailable" | "no-position" | "wrong-direction" | "ready";
	maxBase: string;
}
export function getReduceOnlyCapacity(
	reduceOnly: boolean,
	side: Side,
	position: EntryPositionSnapshot | undefined,
	szDecimals: number,
	now = Date.now(),
): ReduceOnlyCapacity {
	if (!reduceOnly) return { status: "ordinary", maxBase: "0" };
	const age = position?.receivedAt === undefined ? Infinity : now - position.receivedAt;
	const size =
		position?.signedSize !== undefined && /^-?\d+(?:\.\d+)?$/.test(position.signedSize)
			? toBig(position.signedSize)
			: null;
	if (
		!position?.ready ||
		!Number.isFinite(age) ||
		age < 0 ||
		age > ENTRY_POSITION_MAX_AGE_MS ||
		!size ||
		!Number.isInteger(szDecimals) ||
		szDecimals < 0 ||
		szDecimals > 8
	)
		return { status: "unavailable", maxBase: "0" };
	if (size.eq(0)) return { status: "no-position", maxBase: "0" };
	if (side === "buy" ? size.gt(0) : size.lt(0)) return { status: "wrong-direction", maxBase: "0" };
	return { status: "ready", maxBase: size.abs().round(szDecimals, Big.roundDown).toFixed() };
}
