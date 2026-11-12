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
	type PendingOrderCancellationPartialResult,
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
	action: TradingActionFeedbackIdentity & {
		phase: PendingTradingActionPhase;
		partialResult?: PendingOrderCancellationPartialResult;
	},
	kind: TradingActionKind,
): void {
	if (kind === "cancel" && action.partialResult) {
		syncPartialCancellationFeedback({ ...action, partialResult: action.partialResult });
		return;
	}
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
 * Settles a task on a neutral result. An unconfirmed task learns no new fact from it, so only the
 * message changes and a notification the user hid stays hidden; any other task becomes unconfirmed.
 */
export function settleUnconfirmedTradingActionFeedback(
	action: TradingActionFeedbackIdentity,
	kind: TradingActionKind,
	message: NonNullable<OrderQueueItem["message"]>,
): void {
	const id = ensurePendingTradingActionFeedback(action, kind);
	updateOrderQueueItem(
		id,
		getOrderQueueItem(id)?.status === "unconfirmed" ? { message } : { status: "unconfirmed", message },
	);
}

/** The counts and rejections of a partly accepted cancel batch, as its notification shows them. */
export function getPartialCancellationFeedback(
	partialResult: PendingOrderCancellationPartialResult,
): Pick<OrderQueueItem, "acceptedCount" | "countMode" | "error" | "totalCount"> {
	return {
		acceptedCount: partialResult.acceptedCount,
		totalCount: partialResult.totalCount,
		countMode: "canceled",
		error: exchangeActionFailure(partialResult.errors),
	};
}

/**
 * A partly accepted cancel batch keeps its counts and rejections in every phase: partial while the
 * canceled orders await live confirmation, unconfirmed with the same facts once that confirmation
 * times out. Nothing is reopened while the phase is unchanged.
 */
function syncPartialCancellationFeedback(
	action: TradingActionFeedbackIdentity & {
		phase: PendingTradingActionPhase;
		partialResult: PendingOrderCancellationPartialResult;
	},
): void {
	if (action.phase !== "unconfirmed") return;
	const id = ensurePendingTradingActionFeedback(action, "cancel");
	if (getOrderQueueItem(id)?.status === "unconfirmed") return;
	updateOrderQueueItem(id, {
		status: "unconfirmed",
		message: unconfirmedMessages.cancel,
		...getPartialCancellationFeedback(action.partialResult),
	});
}

/**
 * Restores the partial result of a cancel batch once live data confirms its canceled orders. A
 * partial notification the user already dismissed, or that already left the screen, is not reopened:
 * the result was reported when the exchange answered, and confirmation adds nothing new to it.
 */
export function confirmPartialCancellationFeedback(
	action: TradingActionFeedbackIdentity & { partialResult: PendingOrderCancellationPartialResult },
): void {
	const current = getOrderQueueItem(getPendingTradingActionToastId(action.id));
	if (!current || current.status === "partial") return;
	updateOrderQueueItem(current.id, { status: "partial", ...getPartialCancellationFeedback(action.partialResult) });
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
	const partialResult = {
		acceptedCount: canceledOids.length,
		totalCount: resolution.totalCount,
		errors: resolution.errors,
	};
	const actions = getPendingTradingActionActions();
	actions.narrowOrderCancellation(action.id, canceledOids, partialResult);
	actions.markOrderCancellationAccepted(action.id);
	updatePendingTradingActionFeedback(action, "cancel", {
		status: "partial",
		...getPartialCancellationFeedback(partialResult),
	});
	return canceledOids;
}
