import { msg } from "@lingui/core/macro";
import { useEffect } from "react";
import { HL_ALL_DEXS } from "@/config/app";
import { matchesTwapIntent, TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS, type TwapStateLike } from "@/domain/trade/twap";
import { useHyperliquid, useSubscription } from "@/lib/hyperliquid";
import { orderReconciliationError } from "@/lib/trade/order-reconciliation-feedback";
import {
	syncPendingTradingActionFeedback,
	updatePendingTradingActionFeedback,
} from "@/lib/trade/pending-trading-action-feedback";
import {
	reconcileTwapOrderAssetReservation,
	releaseActiveTwapOrderAssetReservation,
} from "@/lib/trade/twap-order-asset-reservation";
import { addOrderQueueItem, getOrderQueueItem, updateOrderQueueItem } from "@/stores/use-order-queue-store";
import {
	getPendingTradingActionActions,
	getPendingTradingActionSnapshot,
	type PendingTwapCancellation,
	TRADING_ACTION_CONFIRMATION_TIMEOUT_MS,
	usePendingTwapCancellations,
} from "@/stores/use-pending-trading-action-store";
import {
	getPendingTwapActions,
	type PendingTwapSubmission,
	usePendingTwapActiveSubmissionIds,
	usePendingTwapSubmissions,
} from "@/stores/use-pending-twap-store";

interface TwapCandidate {
	twapId: number;
	state: TwapStateLike & { timestamp: number };
	status: "activated" | "waitingForTrigger" | "terminated" | "finished" | "stopped" | "error";
	error?: string;
}

const activeTwapCancellationReleases = new Set<string>();

const TWAP_RECONCILIATION_RETRY_MS = 1_000;
const TWAP_CANCELLATION_RELEASE_MAX_ATTEMPTS = 3;

export function TwapReconciliation() {
	const { clientKey, env } = useHyperliquid();
	const address = clientKey === "disconnected" ? undefined : (clientKey as `0x${string}`);
	const submissions = usePendingTwapSubmissions();
	const activeSubmissionIds = usePendingTwapActiveSubmissionIds();
	const cancellations = usePendingTwapCancellations();
	useEffect(() => {
		for (const cancellation of cancellations) syncPendingTradingActionFeedback(cancellation, "twap-cancel");
	}, [cancellations]);
	const {
		data: activeTwaps,
		status: activeTwapsStatus,
		isStale: activeTwapsStale,
		lastMessageAt: activeTwapsLastMessageAt,
	} = useSubscription(
		"twapStates",
		{ user: address ?? "0x0000000000000000000000000000000000000000", dex: HL_ALL_DEXS },
		{ enabled: !!address },
	);

	useEffect(() => {
		const awaiting = cancellations.filter(
			(action) => action.phase === "awaiting" && action.confirmationStartedAt !== null,
		);
		const now = Date.now();
		markExpiredTwapCancellations(awaiting, now);
		const nextDeadline = Math.min(
			...awaiting
				.map((action) => (action.confirmationStartedAt ?? now) + TRADING_ACTION_CONFIRMATION_TIMEOUT_MS)
				.filter((deadline) => deadline > now),
		);
		if (!Number.isFinite(nextDeadline)) return;

		const timer = window.setTimeout(() => markExpiredTwapCancellations(awaiting, Date.now()), nextDeadline - now);
		return () => window.clearTimeout(timer);
	}, [cancellations]);

	useEffect(() => {
		if (!address || activeTwapsStatus !== "active" || activeTwapsStale || !activeTwaps) return;
		const owner = address.toLowerCase();
		const activeIds = new Set(activeTwaps.states.map(([twapId]) => twapId));
		for (const cancellation of cancellations) {
			if (cancellation.env !== env || cancellation.owner !== owner || cancellation.phase === "submitting") {
				continue;
			}
			if (
				typeof activeTwapsLastMessageAt !== "number" ||
				cancellation.requestStartedAt === null ||
				activeTwapsLastMessageAt <= cancellation.requestStartedAt
			) {
				continue;
			}
			if (activeIds.has(cancellation.twapId)) {
				if (cancellation.phase === "unconfirmed") {
					if (cancellation.unconfirmedAt === null || activeTwapsLastMessageAt <= cancellation.unconfirmedAt) {
						continue;
					}
					getPendingTradingActionActions().resolveTwapCancellation(cancellation.id);
					updatePendingTradingActionFeedback(cancellation, "twap-cancel", {
						status: "unconfirmed",
						message: msg`TWAP cancellation was not confirmed. Review active TWAP orders before retrying.`,
					});
				}
				continue;
			}
			void confirmTwapCancellation(cancellation);
		}
	}, [activeTwaps, activeTwapsLastMessageAt, activeTwapsStale, activeTwapsStatus, address, cancellations, env]);
	const { data: twapHistory } = useSubscription(
		"userTwapHistory",
		{ user: address ?? "0x0000000000000000000000000000000000000000" },
		{ enabled: !!address },
	);

	useEffect(() => {
		for (const submission of submissions) {
			if (!activeSubmissionIds.has(submission.id)) ensureTwapSubmissionQueue(submission);
		}
		const eligible = submissions.filter(
			(submission) => submission.unconfirmedAt === undefined && !activeSubmissionIds.has(submission.id),
		);
		const now = Date.now();
		markExpiredSubmissions(eligible, now);
		getPendingTwapActions().prune(now);

		const nextDeadline = Math.min(
			...eligible
				.map((submission) => submission.createdAt + TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS)
				.filter((deadline) => deadline > now),
		);
		if (!Number.isFinite(nextDeadline)) return;

		const timer = window.setTimeout(() => {
			const checkedAt = Date.now();
			markExpiredSubmissions(eligible, checkedAt);
			getPendingTwapActions().prune(checkedAt);
		}, nextDeadline - now);
		return () => window.clearTimeout(timer);
	}, [activeSubmissionIds, submissions]);

	useEffect(() => {
		if (!address) return;

		const activeCandidates: TwapCandidate[] =
			activeTwaps?.states.map(([twapId, state]) => ({
				twapId,
				state,
				status: "activated",
			})) ?? [];
		const historyCandidates: TwapCandidate[] =
			twapHistory?.history.flatMap((entry) => {
				if (typeof entry.twapId !== "number") return [];
				return [
					{
						twapId: entry.twapId,
						state: entry.state,
						status: entry.status.status,
						error: entry.status.status === "error" ? entry.status.description : undefined,
					},
				];
			}) ?? [];

		for (const submission of submissions) {
			if (
				submission.env !== env ||
				submission.user !== address.toLowerCase() ||
				activeSubmissionIds.has(submission.id)
			) {
				continue;
			}

			const candidate = findMatchingCandidate(submission, activeCandidates, historyCandidates);
			if (!candidate) continue;
			getPendingTwapActions().markActive(submission.id);
			void coordinateTwapReconciliation(submission, candidate);
		}
	}, [activeSubmissionIds, activeTwaps, address, env, submissions, twapHistory]);

	return null;
}

async function confirmTwapCancellation(cancellation: PendingTwapCancellation, attempt = 1): Promise<void> {
	if (attempt === 1) {
		if (activeTwapCancellationReleases.has(cancellation.id)) return;
		activeTwapCancellationReleases.add(cancellation.id);
	}
	const current = findPendingTwapCancellation(cancellation);
	if (!current) {
		activeTwapCancellationReleases.delete(cancellation.id);
		return;
	}
	const released = await releaseActiveTwapOrderAssetReservation(
		{ env: current.env, owner: current.owner, assetIds: [current.assetId] },
		current.twapId,
	);
	const latest = findPendingTwapCancellation(cancellation);
	if (!latest) {
		activeTwapCancellationReleases.delete(cancellation.id);
		return;
	}
	if (released) {
		getPendingTradingActionActions().resolveTwapCancellation(latest.id);
		activeTwapCancellationReleases.delete(cancellation.id);
		updatePendingTradingActionFeedback(latest, "twap-cancel", {
			status: "success",
			message: msg`TWAP cancellation confirmed.`,
		});
		return;
	}
	if (attempt >= TWAP_CANCELLATION_RELEASE_MAX_ATTEMPTS) {
		activeTwapCancellationReleases.delete(cancellation.id);
		return;
	}
	window.setTimeout(
		() => {
			const retriable = findPendingTwapCancellation(cancellation);
			if (!retriable) {
				activeTwapCancellationReleases.delete(cancellation.id);
				return;
			}
			void confirmTwapCancellation(retriable, attempt + 1);
		},
		TWAP_RECONCILIATION_RETRY_MS * 2 ** (attempt - 1),
	);
}

function findPendingTwapCancellation(expected: PendingTwapCancellation): PendingTwapCancellation | null {
	const current = getPendingTradingActionSnapshot().twapCancellations.find((action) => action.id === expected.id);
	if (
		!current ||
		current.env !== expected.env ||
		current.owner !== expected.owner ||
		current.twapId !== expected.twapId ||
		current.assetId !== expected.assetId
	) {
		return null;
	}
	return current;
}

function markExpiredTwapCancellations(
	cancellations: ReturnType<typeof usePendingTwapCancellations>,
	now: number,
): void {
	for (const cancellation of cancellations) {
		if (!getPendingTradingActionActions().expireTwapCancellationAwaiting(cancellation.id, now)) continue;
		syncPendingTradingActionFeedback({ ...cancellation, phase: "unconfirmed" }, "twap-cancel");
	}
}

function markExpiredSubmissions(submissions: PendingTwapSubmission[], now: number): void {
	for (const submission of submissions) {
		if (now - submission.createdAt < TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS) continue;
		const unconfirmed = getPendingTwapActions().markUnconfirmed(submission.id, now);
		if (unconfirmed) completeUnconfirmedTwapReconciliation(unconfirmed);
	}
}

function completeUnconfirmedTwapReconciliation(submission: PendingTwapSubmission): void {
	void reconcileTwapOrderAssetReservation({
		identity: { env: submission.env, owner: submission.user, assetIds: [submission.intent.assetId] },
		intent: submission.intent,
		pendingSubmissionId: submission.id,
	});
	const error = orderReconciliationError("twap-status-unconfirmed");
	updateOrderQueueItem(ensureTwapSubmissionQueue(submission), { status: "unconfirmed", error });
}

function findMatchingCandidate(
	submission: PendingTwapSubmission,
	activeCandidates: TwapCandidate[],
	historyCandidates: TwapCandidate[],
): TwapCandidate | undefined {
	const knownIds = new Set([...submission.activeBaseline.knownIds, ...submission.historyBaseline.knownIds]);
	const eligibleCandidates = new Map<number, TwapCandidate>();

	if (submission.activeBaseline.ready) {
		for (const candidate of activeCandidates) {
			if (!knownIds.has(candidate.twapId) && matchesTwapIntent(submission.intent, candidate.state)) {
				eligibleCandidates.set(candidate.twapId, candidate);
			}
		}
	}

	if (submission.historyBaseline.ready) {
		for (const candidate of historyCandidates) {
			if (!knownIds.has(candidate.twapId) && matchesTwapIntent(submission.intent, candidate.state)) {
				eligibleCandidates.set(candidate.twapId, candidate);
			}
		}
	}

	return [...eligibleCandidates.values()].sort((left, right) => right.state.timestamp - left.state.timestamp)[0];
}

async function coordinateTwapReconciliation(
	submission: PendingTwapSubmission,
	candidate: TwapCandidate,
): Promise<void> {
	const coordinated = await reconcileTwapOrderAssetReservation({
		identity: { env: submission.env, owner: submission.user, assetIds: [submission.intent.assetId] },
		intent: submission.intent,
		pendingSubmissionId: submission.id,
		active:
			candidate.status === "activated" || candidate.status === "waitingForTrigger"
				? { twapId: candidate.twapId, startedAt: candidate.state.timestamp }
				: undefined,
	});
	if (!coordinated) {
		window.setTimeout(() => getPendingTwapActions().clearActive(submission.id), TWAP_RECONCILIATION_RETRY_MS);
		return;
	}

	const completed = getPendingTwapActions().resolve(submission.id);
	if (!completed) {
		getPendingTwapActions().clearActive(submission.id);
		return;
	}
	completeTwapReconciliation(completed, candidate);
}

function completeTwapReconciliation(submission: PendingTwapSubmission, candidate: TwapCandidate): void {
	const queueId = ensureTwapSubmissionQueue(submission);
	switch (candidate.status) {
		case "activated":
			updateOrderQueueItem(queueId, { status: "success", outcome: "twapStarted" });
			break;
		case "waitingForTrigger":
			updateOrderQueueItem(queueId, { status: "success", message: msg`TWAP waiting for trigger` });
			break;
		case "finished":
			updateOrderQueueItem(queueId, { status: "success", message: msg`TWAP finished` });
			break;
		case "terminated":
			updateOrderQueueItem(queueId, { status: "canceled", message: msg`TWAP terminated` });
			break;
		case "stopped":
			updateOrderQueueItem(queueId, { status: "canceled", message: msg`TWAP stopped` });
			break;
		case "error":
			updateOrderQueueItem(queueId, {
				status: "failed",
				error: candidate.error ?? orderReconciliationError("twap-order-rejected"),
			});
	}
}

function ensureTwapSubmissionQueue(submission: PendingTwapSubmission): string {
	const id = submission.queueId ?? `reconcile-${submission.id}`;
	if (getOrderQueueItem(id)) return id;
	return addOrderQueueItem({
		id,
		owner: submission.user,
		env: submission.env,
		operation: "order",
		market: submission.intent.coin,
		side: submission.intent.side === "B" ? "buy" : "sell",
		size: submission.intent.size,
		orderType: "twap",
		status: submission.unconfirmedAt === undefined ? "confirming" : "unconfirmed",
		error: submission.unconfirmedAt === undefined ? undefined : orderReconciliationError("twap-status-unconfirmed"),
	});
}
