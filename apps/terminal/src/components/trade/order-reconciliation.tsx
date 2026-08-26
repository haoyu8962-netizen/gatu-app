import { t } from "@lingui/core/macro";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { HL_ALL_DEXS } from "@/config/app";
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
import { getPositionMarketCloseActions, getPositionMarketCloseModal } from "@/stores/use-global-modal-store";
import { hasOrderQueueItem, updateOrderQueueItem } from "@/stores/use-order-queue-store";
import {
	getPendingOrderActions,
	isOrderStatusFinalForSubmission,
	isPendingOrderSubmissionActive,
	type PendingOrderSubmission,
	usePendingOrderActiveSubmissionIds,
	usePendingOrderSubmissions,
} from "@/stores/use-pending-order-store";
import {
	getPendingTradingActionActions,
	getPendingTradingActionToastId,
	TRADING_ACTION_CONFIRMATION_TIMEOUT_MS,
	usePendingOrderCancellations,
	usePendingOrderModifications,
} from "@/stores/use-pending-trading-action-store";

const RECONCILIATION_TICK_MS = 3_000;

interface OrderReconciliationIdentity {
	env: "Mainnet" | "Testnet";
	mounted: boolean;
	owner: string | null;
}

export function OrderReconciliation() {
	const { clientKey, env, info } = useHyperliquid();
	const address = clientKey === "disconnected" ? undefined : (clientKey as `0x${string}`);
	const submissions = usePendingOrderSubmissions();
	const activeSubmissionIds = usePendingOrderActiveSubmissionIds();
	const modifications = usePendingOrderModifications();
	const cancellations = usePendingOrderCancellations();
	const pollingRef = useRef(false);
	const normalizedAddress = address?.toLowerCase();
	const identityRef = useRef<OrderReconciliationIdentity>({
		env,
		mounted: true,
		owner: normalizedAddress ?? null,
	});
	identityRef.current.env = env;
	identityRef.current.owner = normalizedAddress ?? null;
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
		lastMessageAt: openOrdersLastMessageAt,
	} = useSubscription(
		"openOrders",
		{ user: address ?? "0x0000000000000000000000000000000000000000", dex: HL_ALL_DEXS },
		{ enabled: hasCurrentTradingAction },
	);

	useEffect(() => {
		identityRef.current.mounted = true;
		return () => {
			identityRef.current.mounted = false;
		};
	}, []);

	useEffect(() => {
		const awaiting = [...modifications, ...cancellations].filter(
			(action) => action.phase === "awaiting" && action.confirmationStartedAt !== null,
		);
		const now = Date.now();
		markExpiredTradingActions(awaiting, now, () => identityRef.current);
		const nextDeadline = Math.min(
			...awaiting
				.map((action) => (action.confirmationStartedAt ?? now) + TRADING_ACTION_CONFIRMATION_TIMEOUT_MS)
				.filter((deadline) => deadline > now),
		);
		if (!Number.isFinite(nextDeadline)) return;

		const timer = window.setTimeout(
			() => markExpiredTradingActions(awaiting, Date.now(), () => identityRef.current),
			nextDeadline - now,
		);
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
			if (
				typeof openOrdersLastMessageAt !== "number" ||
				cancellation.requestStartedAt === null ||
				openOrdersLastMessageAt <= cancellation.requestStartedAt
			) {
				continue;
			}
			if (stillOpen) {
				if (
					cancellation.phase !== "unconfirmed" ||
					cancellation.unconfirmedAt === null ||
					openOrdersLastMessageAt <= cancellation.unconfirmedAt
				) {
					for (const oid of cancellation.oids) activeCancellationOids.add(oid);
					continue;
				}
				getPendingTradingActionActions().releaseOrderCancellation(cancellation.id);
				toast.info(t`The cancellation was not confirmed. Review open orders before retrying.`, {
					id: getPendingTradingActionToastId(cancellation.id),
				});
				continue;
			}
			for (const oid of cancellation.oids) completedCancellationOids.add(oid);
			getPendingTradingActionActions().confirmOrderCancellation(cancellation.id);
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
			if (
				typeof openOrdersLastMessageAt !== "number" ||
				modification.requestStartedAt === null ||
				openOrdersLastMessageAt <= modification.requestStartedAt
			) {
				continue;
			}
			const matches = openOrders.filter((order) => order.oid === modification.oid);
			if (matches.length === 0) {
				getPendingTradingActionActions().resolveModification(modification.id);
				toast.info(t`The modified order is no longer open.`, {
					id: getPendingTradingActionToastId(modification.id),
				});
				continue;
			}
			if (matches.length !== 1) continue;
			const latest = matches[0];
			if (!latest) continue;
			if (matchesExpectedModification(modification, latest)) {
				getPendingTradingActionActions().resolveModification(modification.id);
				toast.success(t`Order modification confirmed.`, {
					id: getPendingTradingActionToastId(modification.id),
				});
				continue;
			}
			if (hasModificationTargetChanged(modification, latest)) {
				const negativeConclusionStartedAt =
					modification.phase === "unconfirmed" ? modification.unconfirmedAt : modification.confirmationStartedAt;
				if (negativeConclusionStartedAt === null || openOrdersLastMessageAt <= negativeConclusionStartedAt) {
					continue;
				}
				getPendingTradingActionActions().resolveModification(modification.id);
				toast.error(
					t`The order changed before the requested modification was confirmed. Review the latest order before retrying.`,
					{ id: getPendingTradingActionToastId(modification.id) },
				);
				continue;
			}
			if (modification.phase === "unconfirmed") {
				if (modification.unconfirmedAt === null || openOrdersLastMessageAt <= modification.unconfirmedAt) {
					continue;
				}
				getPendingTradingActionActions().resolveModification(modification.id);
				toast.info(t`The modification was not confirmed. Review the order before retrying.`, {
					id: getPendingTradingActionToastId(modification.id),
				});
			}
		}
	}, [
		address,
		cancellations,
		env,
		modifications,
		openOrdersEvent,
		openOrdersLastMessageAt,
		openOrdersStale,
		openOrdersStatus,
	]);

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

function markExpiredTradingActions(
	actions: AwaitingTradingAction[],
	now: number,
	getIdentity: () => OrderReconciliationIdentity,
): void {
	for (const action of actions) {
		if ("oid" in action) {
			if (!getPendingTradingActionActions().expireModificationAwaiting(action.id, now)) continue;
			const identity = getIdentity();
			if (!identity.mounted || identity.env !== action.env || identity.owner !== action.owner) continue;
			toast.error(
				t`The order update was not confirmed by live data. Refresh before retrying; cancellation remains available.`,
				{ id: getPendingTradingActionToastId(action.id) },
			);
			continue;
		}
		if (!getPendingTradingActionActions().expireOrderCancellationAwaiting(action.id, now)) continue;
		const identity = getIdentity();
		if (!identity.mounted || identity.env !== action.env || identity.owner !== action.owner) continue;
		toast.warning(t`The cancellation response could not be confirmed. Refresh open orders before retrying.`, {
			id: getPendingTradingActionToastId(action.id),
		});
	}
}

function matchesExpectedModification(
	modification: ReturnType<typeof usePendingOrderModifications>[number],
	order: { sz: string; triggerPx: string },
): boolean {
	return (
		(modification.expectedSize === null || decimalsEqual(order.sz, modification.expectedSize)) &&
		(modification.expectedTriggerPx === null || decimalsEqual(order.triggerPx, modification.expectedTriggerPx))
	);
}

function hasModificationTargetChanged(
	modification: ReturnType<typeof usePendingOrderModifications>[number],
	order: { sz: string; triggerPx: string },
): boolean {
	return (
		(modification.expectedSize !== null && !decimalsEqual(order.sz, modification.originalSize)) ||
		(modification.expectedTriggerPx !== null && !decimalsEqual(order.triggerPx, modification.originalTriggerPx))
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
	const message = t`The exchange did not return a final order status. Review open orders and positions before retrying.`;
	updatePositionMarketCloseReconciliation(submission, "unconfirmed", message);
	const queueVisible = submission.queueId ? hasOrderQueueItem(submission.queueId) : false;

	if (submission.queueId && queueVisible) {
		updateOrderQueueItem(submission.queueId, { status: "unconfirmed", error: message });
		return;
	}

	toast.warning(message);
}

function completeReconciliation(submission: PendingOrderSubmission): void {
	releaseSubmissionAssetReservations(submission);
	const statuses = submission.children.map((child) => child.status).filter((status) => status !== undefined);
	const acceptedCount = statuses.filter(isAcceptedOrderStatus).length;
	const canceledCount = statuses.filter(isCanceledOrderStatus).length;
	const allAccepted = acceptedCount === submission.children.length;
	const allCanceled = canceledCount === submission.children.length;
	const partiallyAccepted = acceptedCount > 0 && !allAccepted;
	const hasCanceled = canceledCount > 0;
	const queueVisible = submission.queueId ? hasOrderQueueItem(submission.queueId) : false;
	const canceledMessage = `${t`Canceled`}. ${t`Some orders were accepted. Review open orders before retrying.`}`;
	let marketCloseOutcome: "canceled" | "filled" | "rejected" = "rejected";
	if (allAccepted && statuses.every((status) => status === "filled")) marketCloseOutcome = "filled";
	else if (hasCanceled) marketCloseOutcome = "canceled";
	let marketCloseMessage: string | undefined;
	if (hasCanceled) marketCloseMessage = canceledMessage;
	else if (!allAccepted) marketCloseMessage = t`The exchange did not accept the order.`;
	updatePositionMarketCloseReconciliation(submission, marketCloseOutcome, marketCloseMessage);

	if (submission.queueId && queueVisible) {
		if (allAccepted) {
			updateOrderQueueItem(submission.queueId, { status: "success", outcome: getReconciledOutcome(statuses) });
		} else if (allCanceled) {
			updateOrderQueueItem(submission.queueId, { status: "canceled", error: canceledMessage });
		} else if (hasCanceled) {
			updateOrderQueueItem(submission.queueId, { status: "partial", error: canceledMessage });
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
	else if (hasCanceled) toast.warning(canceledMessage);
	else if (partiallyAccepted) toast.warning(t`Some orders were accepted. Review open orders before retrying.`);
	else toast.error(t`The exchange did not accept the order.`);
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

function updatePositionMarketCloseReconciliation(
	submission: PendingOrderSubmission,
	outcome: "canceled" | "filled" | "rejected" | "unconfirmed",
	message?: string,
): void {
	if (submission.origin?.type !== "positionMarketClose") return;
	const session = getPositionMarketCloseModal();
	if (!session || session.sessionId !== submission.origin.sessionId) return;
	const actions = getPositionMarketCloseActions();
	if (outcome === "filled") {
		actions.updatePhase(session.sessionId, "idle");
		actions.close(session.sessionId);
		return;
	}
	if (outcome === "canceled" || outcome === "rejected") actions.updatePhase(session.sessionId, "idle");
	actions.setError(session.sessionId, message ?? t`The exchange did not accept the order.`);
}

function getReconciledOutcome(statuses: OrderProcessingStatus[]) {
	if (statuses.every((status) => status === "filled")) return "filled" as const;
	if (statuses.some((status) => status === "triggered")) return "triggerSet" as const;
	return "resting" as const;
}
