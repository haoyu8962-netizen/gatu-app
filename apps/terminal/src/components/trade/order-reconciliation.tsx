import { msg } from "@lingui/core/macro";
import { useEffect, useRef } from "react";
import { HL_ALL_DEXS } from "@/config/app";
import { isPartialIocExecutionForOrder } from "@/domain/trade/order-execution-summary";
import {
	isAcceptedOrderStatus,
	isCanceledOrderStatus,
	ORDER_RECONCILIATION_CONFIRMATION_WINDOW_MS,
	ORDER_RECONCILIATION_POLL_LIMIT,
	type OrderProcessingStatus,
} from "@/domain/trade/order-tracking";
import { useHyperliquid, useSubscription } from "@/lib/hyperliquid";
import { toBig } from "@/lib/trade/numbers";
import { releaseOrderAssetReservations } from "@/lib/trade/order-asset-lock";
import { orderReconciliationError } from "@/lib/trade/order-reconciliation-feedback";
import {
	syncPendingTradingActionFeedback,
	updatePendingTradingActionFeedback,
} from "@/lib/trade/pending-trading-action-feedback";
import { getPositionMarketCloseActions, getPositionMarketCloseModal } from "@/stores/use-global-modal-store";
import {
	addOrderQueueItem,
	getOrderQueueItem,
	type OrderQueueItem,
	updateOrderQueueItem,
} from "@/stores/use-order-queue-store";
import {
	getPendingOrderActions,
	isOrderStatusFinalForSubmission,
	isPendingOrderSubmissionActive,
	type PendingOrderSubmission,
	usePendingOrderActiveSubmissionIds,
	usePendingOrderSubmissions,
} from "@/stores/use-pending-order-store";
import {
	getNextTradingActionExpiryDelayMs,
	getPendingTradingActionActions,
	usePendingOrderCancellations,
	usePendingOrderModifications,
	wasReceivedAfter,
} from "@/stores/use-pending-trading-action-store";

const RECONCILIATION_TICK_MS = 3_000;

export function OrderReconciliation() {
	const { clientKey, env, info } = useHyperliquid();
	const address = clientKey === "disconnected" ? undefined : (clientKey as `0x${string}`);
	const submissions = usePendingOrderSubmissions();
	const activeSubmissionIds = usePendingOrderActiveSubmissionIds();
	const modifications = usePendingOrderModifications();
	const cancellations = usePendingOrderCancellations();
	const pollingRef = useRef(false);
	const normalizedAddress = address?.toLowerCase();
	const hasCurrentTradingAction =
		!!normalizedAddress &&
		[...modifications, ...cancellations].some((action) => action.env === env && action.owner === normalizedAddress);
	const { data: orderUpdates } = useSubscription(
		"orderUpdates",
		{ user: address ?? "0x0000000000000000000000000000000000000000" },
		{ enabled: !!address },
	);
	const {
		data: openOrdersEvent,
		status: openOrdersStatus,
		isStale: openOrdersStale,
		monotonicLastMessageAt: openOrdersReceivedAt,
	} = useSubscription(
		"openOrders",
		{ user: address ?? "0x0000000000000000000000000000000000000000", dex: HL_ALL_DEXS },
		{ enabled: hasCurrentTradingAction },
	);

	useEffect(() => {
		for (const modification of modifications) syncPendingTradingActionFeedback(modification, "modify");
		for (const cancellation of cancellations) syncPendingTradingActionFeedback(cancellation, "cancel");
	}, [cancellations, modifications]);

	useEffect(() => {
		const awaiting = [...modifications, ...cancellations].filter(
			(action) => action.phase === "awaiting" && action.confirmationStartedAt !== null,
		);
		let timer: number | undefined;
		function expireDueActions() {
			const now = Date.now();
			const monotonicNow = performance.now();
			markExpiredTradingActions(awaiting, now, monotonicNow);
			const delay = getNextTradingActionExpiryDelayMs(awaiting, now, monotonicNow);
			if (delay !== undefined) timer = window.setTimeout(expireDueActions, delay);
		}
		expireDueActions();
		return () => window.clearTimeout(timer);
	}, [cancellations, modifications]);

	useEffect(() => {
		if (!address || openOrdersStatus !== "active" || openOrdersStale || !openOrdersEvent) return;
		const owner = address.toLowerCase();
		const openOrders = openOrdersEvent.orders;
		const completedCancellationOids = new Set<number>();
		const activeCancellationOids = new Set<number>();
		for (const cancellation of cancellations) {
			const stillOpen = cancellation.oids.some((oid) => openOrders.some((order) => order.oid === oid));
			if (cancellation.env !== env || cancellation.owner !== owner || cancellation.phase === "submitting") {
				continue;
			}
			if (!wasReceivedAfter(openOrdersReceivedAt, cancellation.monotonicRequestStartedAt)) continue;
			if (stillOpen) {
				if (
					cancellation.phase !== "unconfirmed" ||
					!wasReceivedAfter(openOrdersReceivedAt, cancellation.monotonicUnconfirmedAt)
				) {
					for (const oid of cancellation.oids) activeCancellationOids.add(oid);
					continue;
				}
				getPendingTradingActionActions().releaseOrderCancellation(cancellation.id);
				updatePendingTradingActionFeedback(cancellation, "cancel", {
					status: "unconfirmed",
					message: msg`The cancellation was not confirmed. Review open orders before retrying.`,
				});
				continue;
			}
			for (const oid of cancellation.oids) completedCancellationOids.add(oid);
			getPendingTradingActionActions().confirmOrderCancellation(cancellation.id);
			for (const modification of modifications) {
				if (
					modification.env === cancellation.env &&
					modification.owner === cancellation.owner &&
					cancellation.oids.includes(modification.oid)
				) {
					updatePendingTradingActionFeedback(modification, "modify", {
						status: "canceled",
						message: msg`The modified order was canceled.`,
					});
				}
			}
			updatePendingTradingActionFeedback(cancellation, "cancel", {
				status: "success",
				message: msg`Canceled`,
			});
		}

		for (const modification of modifications) {
			if (
				modification.env !== env ||
				modification.owner !== owner ||
				modification.phase === "submitting" ||
				completedCancellationOids.has(modification.oid) ||
				activeCancellationOids.has(modification.oid)
			) {
				continue;
			}
			if (!wasReceivedAfter(openOrdersReceivedAt, modification.monotonicRequestStartedAt)) continue;
			const matches = openOrders.filter((order) => order.oid === modification.oid);
			if (matches.length === 0) {
				getPendingTradingActionActions().resolveModification(modification.id);
				updatePendingTradingActionFeedback(modification, "modify", {
					status: "unconfirmed",
					message: msg`The modified order is no longer open.`,
				});
				continue;
			}
			if (matches.length !== 1) continue;
			const latest = matches[0];
			if (!latest) continue;
			if (matchesExpectedModification(modification, latest)) {
				getPendingTradingActionActions().resolveModification(modification.id);
				updatePendingTradingActionFeedback(modification, "modify", {
					status: "success",
					message: msg`Modified`,
				});
				continue;
			}
			if (hasModificationTargetChanged(modification, latest)) {
				const negativeConclusionStartedAt =
					modification.phase === "unconfirmed"
						? modification.monotonicUnconfirmedAt
						: modification.monotonicConfirmationStartedAt;
				if (!wasReceivedAfter(openOrdersReceivedAt, negativeConclusionStartedAt)) continue;
				getPendingTradingActionActions().resolveModification(modification.id);
				updatePendingTradingActionFeedback(modification, "modify", {
					status: "failed",
					message: msg`The order changed before the requested modification was confirmed. Review the latest order before retrying.`,
				});
				continue;
			}
			if (modification.phase === "unconfirmed") {
				if (!wasReceivedAfter(openOrdersReceivedAt, modification.monotonicUnconfirmedAt)) continue;
				getPendingTradingActionActions().resolveModification(modification.id);
				updatePendingTradingActionFeedback(modification, "modify", {
					status: "unconfirmed",
					message: msg`The modification was not confirmed. Review the order before retrying.`,
				});
			}
		}
	}, [
		address,
		cancellations,
		env,
		modifications,
		openOrdersEvent,
		openOrdersReceivedAt,
		openOrdersStale,
		openOrdersStatus,
	]);

	useEffect(() => {
		for (const submission of submissions) {
			if (!activeSubmissionIds.has(submission.id)) syncSubmissionQueue(submission);
		}
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
				.flatMap((submission) =>
					submission.children.filter(
						(child) => !isOrderStatusFinalForSubmission(submission, child.status) && child.nextCheckAt <= now,
					),
				)
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

type AwaitingTradingAction =
	| ReturnType<typeof usePendingOrderModifications>[number]
	| ReturnType<typeof usePendingOrderCancellations>[number];

function markExpiredTradingActions(actions: AwaitingTradingAction[], now: number, monotonicNow: number): void {
	for (const action of actions) {
		if ("oid" in action) {
			if (!getPendingTradingActionActions().expireModificationAwaiting(action.id, now, monotonicNow)) continue;
			syncPendingTradingActionFeedback({ ...action, phase: "unconfirmed" }, "modify");
			continue;
		}
		if (!getPendingTradingActionActions().expireOrderCancellationAwaiting(action.id, now, monotonicNow)) continue;
		syncPendingTradingActionFeedback({ ...action, phase: "unconfirmed" }, "cancel");
	}
}

function matchesExpectedModification(
	modification: ReturnType<typeof usePendingOrderModifications>[number],
	order: { sz: string; triggerPx: string; limitPx: string },
): boolean {
	return (
		(modification.expectedSize === null || decimalsEqual(order.sz, modification.expectedSize)) &&
		(modification.expectedTriggerPx === null || decimalsEqual(order.triggerPx, modification.expectedTriggerPx)) &&
		(modification.expectedLimitPx === null || decimalsEqual(order.limitPx, modification.expectedLimitPx))
	);
}

function hasModificationTargetChanged(
	modification: ReturnType<typeof usePendingOrderModifications>[number],
	order: { sz: string; triggerPx: string; limitPx: string },
): boolean {
	if (mayBeReplacementReducedByFills(modification, order)) return false;
	return (
		(modification.expectedSize !== null && !decimalsEqual(order.sz, modification.originalSize)) ||
		(modification.expectedTriggerPx !== null && !decimalsEqual(order.triggerPx, modification.originalTriggerPx)) ||
		(modification.expectedLimitPx !== null && !decimalsEqual(order.limitPx, modification.originalLimitPx))
	);
}

function mayBeReplacementReducedByFills(
	modification: ReturnType<typeof usePendingOrderModifications>[number],
	order: { sz: string; triggerPx: string; limitPx: string },
): boolean {
	if (modification.expectedSize === null) return false;
	if (modification.expectedTriggerPx === null && modification.expectedLimitPx === null) return false;
	const size = toBig(order.sz);
	const expectedSize = toBig(modification.expectedSize);
	return (
		(modification.expectedTriggerPx === null || decimalsEqual(order.triggerPx, modification.expectedTriggerPx)) &&
		(modification.expectedLimitPx === null || decimalsEqual(order.limitPx, modification.expectedLimitPx)) &&
		!!size &&
		!!expectedSize &&
		size.lt(expectedSize)
	);
}

function decimalsEqual(left: string, right: string): boolean {
	const leftValue = toBig(left);
	const rightValue = toBig(right);
	return !!leftValue && !!rightValue && leftValue.eq(rightValue);
}

function markExpiredSubmissions(submissions: PendingOrderSubmission[], now: number): void {
	for (const submission of submissions) {
		if (now - submission.createdAt < ORDER_RECONCILIATION_CONFIRMATION_WINDOW_MS) continue;
		const unconfirmed = getPendingOrderActions().markUnconfirmed(submission.id, now);
		if (unconfirmed) completeUnconfirmedReconciliation(unconfirmed);
	}
}

function completeUnconfirmedReconciliation(submission: PendingOrderSubmission): void {
	releaseSubmissionAssetReservations(submission);
	const error = orderReconciliationError("status-unconfirmed");
	releasePositionMarketCloseSession(submission);
	const queueId = ensureSubmissionQueue(submission);
	updateOrderQueueItem(queueId, {
		status: "unconfirmed",
		error,
		children: getSubmissionQueueChildren(submission),
	});
}

function completeReconciliation(submission: PendingOrderSubmission): void {
	releaseSubmissionAssetReservations(submission);
	const statuses = submission.children.map((child) => child.status).filter((status) => status !== undefined);
	const children = getSubmissionQueueChildren(submission);
	const queueItem = getOrderQueueItem(getSubmissionQueueId(submission));
	const acceptedScale =
		(queueItem?.orderType ?? submission.feedback?.orderType) === "scale" && submission.confirmationMode !== "filled";
	const acceptedCount = children.filter((child) =>
		submission.confirmationMode === "filled"
			? child.status === "filled"
			: child.status === "filled" ||
				child.status === "filled-unverified" ||
				child.status === "partial" ||
				child.status === "accepted",
	).length;
	const canceledCount = children.filter((child) => child.status === "canceled").length;
	const allAccepted = children.every(
		(child) => child.status === "filled" || child.status === "filled-unverified" || child.status === "accepted",
	);
	const allCanceled = canceledCount === submission.children.length;
	const partiallyAccepted =
		children.some(
			(child) => child.status === "filled" || child.status === "filled-unverified" || child.status === "accepted",
		) && !allAccepted;
	const execution = queueItem?.execution ?? submission.feedback?.execution;
	const partiallyFilled = children.some((child) => child.status === "partial") || execution?.completeness === "partial";
	const hasUnverifiedFillSize =
		submission.confirmationMode === "filled" && children.some((child) => child.status === "filled-unverified");
	const hasRejected = children.some((child) => child.status === "rejected");
	const canceledPartialIoc =
		execution &&
		submission.children.find(
			(child) => child.status === "canceled" && isPartialIocExecutionForOrder(execution, child.cloid),
		);
	const expectedCanceledCloids = new Set(
		canceledPartialIoc
			? [canceledPartialIoc.cloid, ...(execution?.partialIoc?.attachedCloids ?? [])].map((cloid) => cloid.toLowerCase())
			: [],
	);
	const hasUnexpectedCanceled = submission.children.some(
		(child) =>
			child.status !== undefined &&
			isCanceledOrderStatus(child.status) &&
			!(child.status === "canceled" && expectedCanceledCloids.has(child.cloid.toLowerCase())),
	);
	const canceledError = orderReconciliationError("accepted-orders-canceled");
	releasePositionMarketCloseSession(submission);
	const queueId = ensureSubmissionQueue(submission);
	const detail = {
		children,
		countMode: submission.confirmationMode === "filled" ? ("filled" as const) : ("accepted" as const),
		positionsClosed: false,
	};
	if (allAccepted && (!partiallyFilled || acceptedScale)) {
		updateOrderQueueItem(queueId, { ...detail, status: "success", outcome: getReconciledOutcome(statuses) });
	} else if (allCanceled && !partiallyFilled) {
		updateOrderQueueItem(queueId, { ...detail, status: "canceled", error: canceledError });
	} else if (hasUnexpectedCanceled || partiallyAccepted || partiallyFilled) {
		let error: OrderQueueItem["error"];
		if (hasUnexpectedCanceled) error = canceledError;
		else if (hasRejected) error = orderReconciliationError("batch-rejected");
		updateOrderQueueItem(queueId, {
			...detail,
			status: "partial",
			acceptedCount: hasUnverifiedFillSize ? undefined : acceptedCount,
			totalCount: hasUnverifiedFillSize ? undefined : submission.children.length,
			error,
		});
	} else {
		updateOrderQueueItem(queueId, { ...detail, status: "failed", error: orderReconciliationError("order-rejected") });
	}
}

function getSubmissionQueueId(submission: PendingOrderSubmission): string {
	return submission.queueId ?? `reconcile-${submission.id}`;
}

function ensureSubmissionQueue(submission: PendingOrderSubmission): string {
	const id = getSubmissionQueueId(submission);
	if (getOrderQueueItem(id)) return id;
	return addOrderQueueItem({
		...submission.feedback,
		id,
		owner: submission.user,
		env: submission.env,
		operation:
			submission.feedback?.operation ?? (submission.origin?.type === "positionMarketClose" ? "market-close" : "order"),
		status: submission.unconfirmedAt === undefined ? "confirming" : "unconfirmed",
		error: submission.unconfirmedAt === undefined ? undefined : orderReconciliationError("status-unconfirmed"),
		countMode: submission.confirmationMode === "filled" ? "filled" : "accepted",
		totalCount: submission.children.length,
		children: getSubmissionQueueChildren(submission),
	});
}

function syncSubmissionQueue(submission: PendingOrderSubmission): void {
	const queueId = ensureSubmissionQueue(submission);
	const children = getSubmissionQueueChildren(submission);
	if (JSON.stringify(getOrderQueueItem(queueId)?.children) !== JSON.stringify(children)) {
		updateOrderQueueItem(queueId, { children });
	}
}

function getSubmissionQueueChildren(submission: PendingOrderSubmission): NonNullable<OrderQueueItem["children"]> {
	const queueItem = getOrderQueueItem(getSubmissionQueueId(submission));
	const execution = queueItem?.execution ?? submission.feedback?.execution;
	const existingChildren = queueItem?.children ?? submission.feedback?.children;
	return submission.children.map((child, index) => {
		const previous = existingChildren?.[index];
		const existing = previous?.assetId === child.assetId ? previous : undefined;
		const status = child.status;
		if (status === "canceled" && execution && isPartialIocExecutionForOrder(execution, child.cloid)) {
			return {
				...existing,
				assetId: child.assetId,
				status: "partial",
				size: execution.requestedSize,
				filledSize: execution.filledSize,
				error: undefined,
			};
		}
		if (existing && status === undefined && existing.status !== "pending" && existing.status !== "unknown") {
			return existing;
		}
		if (existing?.status === "partial" && status === "filled") return existing;
		let queueStatus: NonNullable<OrderQueueItem["children"]>[number]["status"] = "rejected";
		if (status === undefined) {
			queueStatus = submission.unconfirmedAt === undefined ? "pending" : "unknown";
		} else if (status === "filled") {
			queueStatus = existing?.status === "filled" ? "filled" : "filled-unverified";
		} else if (isCanceledOrderStatus(status)) {
			queueStatus = "canceled";
		} else if (isAcceptedOrderStatus(status)) {
			queueStatus = "accepted";
		}
		return {
			...existing,
			assetId: child.assetId,
			status: queueStatus,
			error: status && !isAcceptedOrderStatus(status) && !isCanceledOrderStatus(status) ? status : undefined,
		};
	});
}

function releaseSubmissionAssetReservations(submission: PendingOrderSubmission): void {
	void releaseOrderAssetReservations(
		{
			env: submission.env,
			owner: submission.user,
			assetIds: submission.children.map((child) => child.assetId),
		},
		submission.id,
	);
}

function releasePositionMarketCloseSession(submission: PendingOrderSubmission): void {
	if (submission.origin?.type !== "positionMarketClose") return;
	const session = getPositionMarketCloseModal();
	if (!session || session.sessionId !== submission.origin.sessionId) return;
	const actions = getPositionMarketCloseActions();
	actions.updatePhase(session.sessionId, "idle");
	actions.close(session.sessionId);
}

function getReconciledOutcome(statuses: OrderProcessingStatus[]) {
	if (statuses.every((status) => status === "filled")) return "filled" as const;
	if (statuses.some((status) => status === "triggered")) return "triggerSet" as const;
	return "resting" as const;
}
