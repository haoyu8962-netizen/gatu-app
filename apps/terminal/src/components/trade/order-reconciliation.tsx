import { t } from "@lingui/core/macro";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
	isAcceptedOrderStatus,
	ORDER_RECONCILIATION_CONFIRMATION_WINDOW_MS,
	ORDER_RECONCILIATION_POLL_LIMIT,
	type OrderProcessingStatus,
} from "@/domain/trade/order-tracking";
import { useHyperliquid, useSubscription } from "@/lib/hyperliquid";
import { hasOrderQueueItem, updateOrderQueueItem } from "@/stores/use-order-queue-store";
import {
	getPendingOrderActions,
	isPendingOrderSubmissionActive,
	type PendingOrderSubmission,
	usePendingOrderActiveSubmissionIds,
	usePendingOrderSubmissions,
} from "@/stores/use-pending-order-store";

const RECONCILIATION_TICK_MS = 3_000;

export function OrderReconciliation() {
	const { clientKey, env, info } = useHyperliquid();
	const address = clientKey === "disconnected" ? undefined : (clientKey as `0x${string}`);
	const submissions = usePendingOrderSubmissions();
	const activeSubmissionIds = usePendingOrderActiveSubmissionIds();
	const pollingRef = useRef(false);
	const { data: orderUpdates } = useSubscription(
		"orderUpdates",
		{ user: address ?? "0x0000000000000000000000000000000000000000" },
		{ enabled: !!address },
	);

	useEffect(() => {
		const eligible = submissions.filter(
			(submission) => submission.unconfirmedAt === undefined && !activeSubmissionIds.has(submission.id),
		);
		const now = Date.now();
		markExpiredSubmissions(eligible, now);
		getPendingOrderActions().prune(now);

		const nextDeadline = Math.min(
			...eligible
				.map((submission) => submission.createdAt + ORDER_RECONCILIATION_CONFIRMATION_WINDOW_MS)
				.filter((deadline) => deadline > now),
		);
		if (!Number.isFinite(nextDeadline)) return;

		const timer = window.setTimeout(() => {
			const checkedAt = Date.now();
			markExpiredSubmissions(eligible, checkedAt);
			getPendingOrderActions().prune(checkedAt);
		}, nextDeadline - now);
		return () => window.clearTimeout(timer);
	}, [activeSubmissionIds, submissions]);

	useEffect(() => {
		if (!address || !orderUpdates) return;
		for (const update of orderUpdates) {
			if (!update.order.cloid) continue;
			const matchingSubmission = submissions.find(
				(submission) =>
					submission.env === env &&
					submission.user === address.toLowerCase() &&
					submission.children.some((child) => child.cloid.toLowerCase() === update.order.cloid?.toLowerCase()),
			);
			if (!matchingSubmission || isPendingOrderSubmissionActive(matchingSubmission.id)) continue;
			const completed = getPendingOrderActions().resolve(env, address, update.order.cloid, update.status);
			if (completed) completeReconciliation(completed);
		}
	}, [address, env, orderUpdates, submissions]);

	useEffect(() => {
		if (!address) return;
		const user = address;

		async function pollDueOrders() {
			if (pollingRef.current) return;
			const now = Date.now();
			const due = submissions
				.filter(
					(submission) =>
						submission.env === env &&
						submission.user === user.toLowerCase() &&
						submission.unconfirmedAt === undefined &&
						now - submission.createdAt < ORDER_RECONCILIATION_CONFIRMATION_WINDOW_MS &&
						!activeSubmissionIds.has(submission.id),
				)
				.flatMap((submission) => submission.children.filter((child) => !child.status && child.nextCheckAt <= now))
				.slice(0, ORDER_RECONCILIATION_POLL_LIMIT);
			if (due.length === 0) return;

			pollingRef.current = true;
			try {
				await Promise.all(
					due.map(async (child) => {
						getPendingOrderActions().markChecked(child.cloid, now);
						try {
							const result = await info.orderStatus({ user, oid: child.cloid });
							if (result.status !== "order") return;
							const completed = getPendingOrderActions().resolve(env, user, child.cloid, result.order.status);
							if (completed) completeReconciliation(completed);
						} catch {
							return;
						}
					}),
				);
			} finally {
				pollingRef.current = false;
			}
		}

		void pollDueOrders();
		const timer = window.setInterval(() => void pollDueOrders(), RECONCILIATION_TICK_MS);
		return () => window.clearInterval(timer);
	}, [activeSubmissionIds, address, env, info, submissions]);

	return null;
}

function markExpiredSubmissions(submissions: PendingOrderSubmission[], now: number): void {
	for (const submission of submissions) {
		if (now - submission.createdAt < ORDER_RECONCILIATION_CONFIRMATION_WINDOW_MS) continue;
		const unconfirmed = getPendingOrderActions().markUnconfirmed(submission.id, now);
		if (unconfirmed) completeUnconfirmedReconciliation(unconfirmed);
	}
}

function completeUnconfirmedReconciliation(submission: PendingOrderSubmission): void {
	const message = t`The exchange did not return a final order status. Review open orders and positions before retrying.`;
	const queueVisible = submission.queueId ? hasOrderQueueItem(submission.queueId) : false;

	if (submission.queueId && queueVisible) {
		updateOrderQueueItem(submission.queueId, { status: "unconfirmed", error: message });
		return;
	}

	toast.warning(message);
}

function completeReconciliation(submission: PendingOrderSubmission): void {
	const statuses = submission.children.map((child) => child.status).filter((status) => status !== undefined);
	const acceptedCount = statuses.filter(isAcceptedOrderStatus).length;
	const allAccepted = acceptedCount === submission.children.length;
	const partiallyAccepted = acceptedCount > 0 && !allAccepted;
	const queueVisible = submission.queueId ? hasOrderQueueItem(submission.queueId) : false;

	if (submission.queueId && queueVisible) {
		if (allAccepted) {
			updateOrderQueueItem(submission.queueId, { status: "success", outcome: getReconciledOutcome(statuses) });
		} else if (partiallyAccepted) {
			updateOrderQueueItem(submission.queueId, {
				status: "partial",
				acceptedCount,
				totalCount: submission.children.length,
				error: t`The exchange did not accept every order.`,
			});
		} else {
			updateOrderQueueItem(submission.queueId, {
				status: "failed",
				error: t`The exchange did not accept the order.`,
			});
		}
		return;
	}

	if (allAccepted) toast.success(t`Order confirmed by the exchange.`);
	else if (partiallyAccepted) toast.warning(t`Some orders were accepted. Review open orders before retrying.`);
	else toast.error(t`The exchange did not accept the order.`);
}

function getReconciledOutcome(statuses: OrderProcessingStatus[]) {
	if (statuses.every((status) => status === "filled")) return "filled" as const;
	if (statuses.some((status) => status === "triggered")) return "triggerSet" as const;
	return "resting" as const;
}
