import { toBig } from "@/lib/trade/numbers";

export interface CloseOrderFeedbackTarget {
	assetId: number;
	market?: string;
	size?: string;
}

export interface CloseOrderFeedbackChild extends CloseOrderFeedbackTarget {
	filledSize?: string;
	status: "pending" | "filled" | "filled-unverified" | "partial" | "accepted" | "rejected" | "unknown" | "canceled";
	error?: string;
}

export function getCloseOrderFeedbackTarget(target: {
	assetId: number;
	coin: string;
	signedPositionSize: string;
}): CloseOrderFeedbackTarget {
	return { assetId: target.assetId, market: target.coin, size: toBig(target.signedPositionSize)?.abs().toString() };
}

export function getCloseOrderFeedbackChildren(
	targets: readonly CloseOrderFeedbackTarget[],
	response: unknown,
): CloseOrderFeedbackChild[] {
	const envelope = asRecord(response);
	const batchError =
		envelope?.status === "err" && typeof envelope.response === "string" ? envelope.response : undefined;
	const statuses = asRecord(asRecord(envelope?.response)?.data)?.statuses;
	const items = Array.isArray(statuses) ? statuses : [];
	const sharedError = items.length === 1 && targets.length > 1 ? getStatusError(items[0]) : undefined;
	return targets.map((target, index) => {
		const status = items.length === targets.length ? items[index] : undefined;
		const error = batchError ?? sharedError ?? getStatusError(status);
		if (error) return { ...target, status: "rejected", error };
		const record = asRecord(status);
		const filled = asRecord(record?.filled);
		if (filled) {
			const filledSize = typeof filled.totalSz === "string" ? filled.totalSz : undefined;
			const actual = toBig(filledSize);
			const expected = toBig(target.size);
			if (!actual || actual.lt(0) || !expected?.gt(0) || actual.gt(expected)) {
				return { ...target, status: "unknown" };
			}
			return { ...target, filledSize, status: actual.eq(expected) ? "filled" : "partial" };
		}
		if (record?.resting || status === "success" || status === "waitingForFill" || status === "waitingForTrigger") {
			return { ...target, status: "accepted" };
		}
		return { ...target, status: "unknown" };
	});
}

export function summarizeCloseOrderFeedback(children: readonly CloseOrderFeedbackChild[]) {
	return {
		filledCount: children.filter((child) => child.status === "filled").length,
		totalCount: children.length,
		hasPartialFill: children.some((child) => child.status === "partial"),
		hasUnknown: children.some(
			(child) => child.status === "unknown" || child.status === "accepted" || child.status === "pending",
		),
	};
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function getStatusError(value: unknown): string | undefined {
	const error = asRecord(value)?.error;
	return typeof error === "string" ? error : undefined;
}
