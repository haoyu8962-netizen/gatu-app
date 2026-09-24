import { msg } from "@lingui/core/macro";
import {
	addOrderQueueItem,
	getOrderQueueItem,
	type OrderQueueItem,
	updateOrderQueueItem,
} from "@/stores/use-order-queue-store";
import {
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

const awaitingMessages = {
	modify: msg`Order modification submitted. Waiting for the open-orders update.`,
	cancel: msg`Cancellation submitted. Waiting for the open-orders update.`,
	"twap-cancel": msg`TWAP cancellation submitted. Waiting for the active TWAP update.`,
};

const unconfirmedMessages = {
	modify: msg`The order update was not confirmed by live data. Refresh before retrying; cancellation remains available.`,
	cancel: msg`The cancellation response could not be confirmed. Refresh open orders before retrying.`,
	"twap-cancel": msg`TWAP cancellation was submitted, but its status could not be confirmed. Check the active TWAP list before retrying.`,
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
		message = awaitingMessages[kind];
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
