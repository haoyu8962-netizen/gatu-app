import { msg } from "@lingui/core/macro";
import type { OpenOrderCancelResolution } from "@/domain/trade/open-order-cancel";
import { exchangeActionFailure } from "@/lib/errors/action-error";
import {
	addOrderQueueItem,
	getOrderQueueItem,
	type OrderQueueItem,
	updateOrderQueueItem,
} from "@/stores/use-order-queue-store";
import {
	getPendingTradingActionActions,
	getPendingTradingActionToastId,
	type PendingTradingActionPhase,
} from "@/stores/use-pending-trading-action-store";

type TradingActionKind = "modify" | "cancel" | "twap-cancel";

interface TradingActionFeedbackIdentity {
	id: string;
	owner: string;
	env: "Mainnet" | "Testnet";
}

const titles = {
	modify: msg`Modify order`,
	cancel: msg`Cancel orders`,
	"twap-cancel": msg`Terminate TWAP`,
};

const unconfirmedMessages = {
	modify: msg`The order update was not confirmed by live data. Refresh before retrying; cancellation remains available.`,
	cancel: msg`The cancellation response could not be confirmed. Refresh open orders before retrying.`,
	"twap-cancel": msg`TWAP termination was submitted, but its status could not be confirmed. Check active TWAPs before retrying.`,
};

export function ensurePendingTradingActionFeedback(
	action: TradingActionFeedbackIdentity,
	kind: TradingActionKind,
): string {
	const id = getPendingTradingActionToastId(action.id);
	if (!getOrderQueueItem(id)) {
		addOrderQueueItem({ id, owner: action.owner, env: action.env, title: titles[kind], status: "pending" });
	}
	return id;
}

export function syncPendingTradingActionFeedback(
	action: TradingActionFeedbackIdentity & { phase: PendingTradingActionPhase },
	kind: TradingActionKind,
): void {
	const id = ensurePendingTradingActionFeedback(action, kind);
	const current = getOrderQueueItem(id);
	if (current && ["success", "failed", "partial", "canceled"].includes(current.status)) return;
	let status: OrderQueueItem["status"] = "unconfirmed";
	let message: OrderQueueItem["message"] = unconfirmedMessages[kind];
	if (action.phase === "submitting") {
		status = "pending";
		message = undefined;
	} else if (action.phase === "awaiting") {
		status = "confirming";
		message = undefined;
	}
	if (current?.status === status) return;
	updateOrderQueueItem(id, { status, message });
}

export function updatePendingTradingActionFeedback(
	action: TradingActionFeedbackIdentity,
	kind: TradingActionKind,
	update: Partial<Omit<OrderQueueItem, "id" | "owner" | "env">>,
): void {
	updateOrderQueueItem(ensurePendingTradingActionFeedback(action, kind), update);
}

/**
 * Reports a confirmed outcome unless the task already holds a partial result: a cancel batch that the
 * exchange answered item by item keeps its counts and rejections once live data confirms the rest.
 */
export function confirmPendingTradingActionFeedback(
	action: TradingActionFeedbackIdentity,
	kind: TradingActionKind,
	update: Partial<Omit<OrderQueueItem, "id" | "owner" | "env">>,
): void {
	if (getOrderQueueItem(getPendingTradingActionToastId(action.id))?.status === "partial") return;
	updatePendingTradingActionFeedback(action, kind, update);
}

/**
 * Settles a cancel batch the exchange accepted only in part, as the official terminal reports it
 * (Canceled {n}/{total} orders plus the rejections): the pending cancellation keeps only the canceled
 * orders until live data confirms them, the rejected ones are released at once, and the task shows the
 * counts with each rejection text. Returns the canceled order IDs.
 */
export function settlePartialOrderCancellation(
	action: TradingActionFeedbackIdentity,
	cancelOids: readonly number[],
	resolution: OpenOrderCancelResolution,
): number[] {
	const canceledOids = resolution.acceptedIndexes.flatMap((index) => {
		const oid = cancelOids[index];
		return oid === undefined ? [] : [oid];
	});
	const actions = getPendingTradingActionActions();
	actions.narrowOrderCancellation(action.id, canceledOids);
	actions.markOrderCancellationAwaiting(action.id);
	updatePendingTradingActionFeedback(action, "cancel", {
		status: "partial",
		acceptedCount: canceledOids.length,
		totalCount: resolution.totalCount,
		countMode: "canceled",
		error: exchangeActionFailure(resolution.errors),
		message: undefined,
	});
	return canceledOids;
}
