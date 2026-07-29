import { t } from "@lingui/core/macro";
import { useEffect } from "react";
import { toast } from "sonner";
import { HL_ALL_DEXS } from "@/config/app";
import { matchesTwapIntent, TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS, type TwapStateLike } from "@/domain/trade/twap";
import { useHyperliquid, useSubscription } from "@/lib/hyperliquid";
import { hasOrderQueueItem, updateOrderQueueItem } from "@/stores/use-order-queue-store";
import {
	getPendingTwapActions,
	type PendingTwapSubmission,
	usePendingTwapActiveSubmissionIds,
	usePendingTwapSubmissions,
} from "@/stores/use-pending-twap-store";

interface TwapCandidate {
	twapId: number;
	state: TwapStateLike & { timestamp: number };
	status: "activated" | "terminated" | "finished" | "error";
	error?: string;
}

export function TwapReconciliation() {
	const { clientKey, env } = useHyperliquid();
	const address = clientKey === "disconnected" ? undefined : (clientKey as `0x${string}`);
	const submissions = usePendingTwapSubmissions();
	const activeSubmissionIds = usePendingTwapActiveSubmissionIds();
	const { data: activeTwaps } = useSubscription(
		"twapStates",
		{ user: address ?? "0x0000000000000000000000000000000000000000", dex: HL_ALL_DEXS },
		{ enabled: !!address },
	);
	const { data: twapHistory } = useSubscription(
		"userTwapHistory",
		{ user: address ?? "0x0000000000000000000000000000000000000000" },
		{ enabled: !!address },
	);

	useEffect(() => {
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
			const completed = getPendingTwapActions().resolve(submission.id);
			if (completed) completeTwapReconciliation(completed, candidate);
		}
	}, [activeSubmissionIds, activeTwaps, address, env, submissions, twapHistory]);

	return null;
}

function markExpiredSubmissions(submissions: PendingTwapSubmission[], now: number): void {
	for (const submission of submissions) {
		if (now - submission.createdAt < TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS) continue;
		const unconfirmed = getPendingTwapActions().markUnconfirmed(submission.id, now);
		if (unconfirmed) completeUnconfirmedTwapReconciliation(unconfirmed);
	}
}

function completeUnconfirmedTwapReconciliation(submission: PendingTwapSubmission): void {
	const message = t`The exchange did not return a final TWAP status. Review active TWAP orders before retrying.`;
	const queueVisible = submission.queueId ? hasOrderQueueItem(submission.queueId) : false;

	if (submission.queueId && queueVisible) {
		updateOrderQueueItem(submission.queueId, { status: "unconfirmed", error: message });
		return;
	}

	toast.warning(message);
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
				// History is authoritative once the exchange reports a final state for the same TWAP ID.
				eligibleCandidates.set(candidate.twapId, candidate);
			}
		}
	}

	return [...eligibleCandidates.values()].sort((left, right) => right.state.timestamp - left.state.timestamp)[0];
}

function completeTwapReconciliation(submission: PendingTwapSubmission, candidate: TwapCandidate): void {
	const accepted = candidate.status !== "error";
	const errorMessage = candidate.error ?? t`The exchange did not accept the TWAP order.`;
	const queueVisible = submission.queueId ? hasOrderQueueItem(submission.queueId) : false;

	if (submission.queueId && queueVisible) {
		if (accepted) {
			updateOrderQueueItem(submission.queueId, { status: "success", outcome: "twapStarted" });
		} else {
			updateOrderQueueItem(submission.queueId, { status: "failed", error: errorMessage });
		}
		return;
	}

	if (accepted) toast.success(t`TWAP order confirmed by the exchange.`);
	else toast.error(errorMessage);
}
