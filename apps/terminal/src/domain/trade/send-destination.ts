import { toBig } from "@/lib/trade/numbers";

/**
 * What a Send does after `preTransferCheck`, as on the official terminal: a sanctioned destination
 * is refused; an activation fee, or a destination that has never sent a transaction on
 * Hyperliquid, needs an explicit confirmation; anything else sends at once. A response that does
 * not have the documented shape sends nothing.
 */
export type SendDestinationVerdict =
	| { kind: "send" }
	| { kind: "review"; fee: string; feeDue: boolean; destinationHasSentTx: boolean }
	| { kind: "sanctioned" }
	| { kind: "unavailable" };

export function getSendDestinationVerdict(check: unknown): SendDestinationVerdict {
	if (!check || typeof check !== "object") return { kind: "unavailable" };
	const { fee, isSanctioned, userHasSentTx } = check as Record<string, unknown>;
	const feeValue = typeof fee === "string" && /^\d+(\.\d+)?$/.test(fee) ? toBig(fee) : null;
	if (!feeValue || typeof isSanctioned !== "boolean" || typeof userHasSentTx !== "boolean") {
		return { kind: "unavailable" };
	}
	if (isSanctioned) return { kind: "sanctioned" };
	const feeDue = feeValue.gt(0);
	if (!feeDue && userHasSentTx) return { kind: "send" };
	return { kind: "review", fee: fee as string, feeDue, destinationHasSentTx: userHasSentTx };
}
