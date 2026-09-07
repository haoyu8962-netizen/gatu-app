import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { HL_ALL_DEXS } from "@/config/app";
import { matchesTwapIntent, TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS, type TwapStateLike } from "@/domain/trade/twap";
import { useHyperliquid, useSubscription } from "@/lib/hyperliquid";
import { formatOrderReconciliationError, orderReconciliationError } from "@/lib/trade/order-reconciliation-feedback";
import {
	reconcileTwapOrderAssetReservation,
	releaseActiveTwapOrderAssetReservation,
} from "@/lib/trade/twap-order-asset-reservation";
import { hasOrderQueueItem, updateOrderQueueItem } from "@/stores/use-order-queue-store";
import {
	getPendingTradingActionActions,
	getPendingTradingActionSnapshot,
	getPendingTradingActionToastId,
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

interface TwapReconciliationIdentity {
	env: "Mainnet" | "Testnet";
	mounted: boolean;
	owner: string | null;
}

export function TwapReconciliation() {
	const { clientKey, env } = useHyperliquid();
	const address = clientKey === "disconnected" ? undefined : (clientKey as `0x${string}`);
	const submissions = usePendingTwapSubmissions();
	const activeSubmissionIds = usePendingTwapActiveSubmissionIds();
	const cancellations = usePendingTwapCancellations();
	const identityRef = useRef<TwapReconciliationIdentity>({
		env,
		mounted: true,
		owner: address?.toLowerCase() ?? null,
	});
	identityRef.current.env = env;
	identityRef.current.owner = address?.toLowerCase() ?? null;
	useEffect(() => {
		identityRef.current.mounted = true;
		return () => {
			identityRef.current.mounted = false;
		};
	}, []);
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
		markExpiredTwapCancellations(awaiting, now, () => identityRef.current);
		const nextDeadline = Math.min(
			...awaiting
				.map((action) => (action.confirmationStartedAt ?? now) + TRADING_ACTION_CONFIRMATION_TIMEOUT_MS)
				.filter((deadline) => deadline > now),
		);
		if (!Number.isFinite(nextDeadline)) return;

		const timer = window.setTimeout(
			() => markExpiredTwapCancellations(awaiting, Date.now(), () => identityRef.current),
			nextDeadline - now,
		);
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
					toast.info(t`TWAP cancellation was not confirmed. Review active TWAP orders before retrying.`, {
						id: getPendingTradingActionToastId(cancellation.id),
					});
				}
				continue;
			}
			void confirmTwapCancellation(cancellation, () => identityRef.current);
		}
	}, [activeTwaps, activeTwapsLastMessageAt, activeTwapsStale, activeTwapsStatus, address, cancellations, env]);
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
			getPendingTwapActions().markActive(submission.id);
			void coordinateTwapReconciliation(submission, candidate);
		}
	}, [activeSubmissionIds, activeTwaps, address, env, submissions, twapHistory]);

	return null;
}

async function confirmTwapCancellation(
	cancellation: PendingTwapCancellation,
	getIdentity: () => TwapReconciliationIdentity,
	attempt = 1,
): Promise<void> {
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
		const identity = getIdentity();
		if (identity.mounted && identity.env === latest.env && identity.owner === latest.owner) {
			toast.success(t`TWAP cancellation confirmed.`, { id: getPendingTradingActionToastId(latest.id) });
		}
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
			void confirmTwapCancellation(retriable, getIdentity, attempt + 1);
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
	getIdentity: () => TwapReconciliationIdentity,
): void {
	for (const cancellation of cancellations) {
		if (!getPendingTradingActionActions().expireTwapCancellationAwaiting(cancellation.id, now)) continue;
		const identity = getIdentity();
		if (!identity.mounted || identity.env !== cancellation.env || identity.owner !== cancellation.owner) {
			continue;
		}
		toast.warning(
			t`TWAP cancellation was submitted, but its status could not be confirmed. Check the active TWAP list before retrying.`,
			{ id: getPendingTradingActionToastId(cancellation.id) },
		);
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
	const queueVisible = submission.queueId ? hasOrderQueueItem(submission.queueId) : false;

	if (submission.queueId && queueVisible) {
		updateOrderQueueItem(submission.queueId, { status: "unconfirmed", error });
		return;
	}

	toast.warning(formatOrderReconciliationError(error.code, (descriptor) => i18n._(descriptor)));
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
	const accepted = candidate.status !== "error";
	const error = candidate.error ?? orderReconciliationError("twap-order-rejected");
	const queueVisible = submission.queueId ? hasOrderQueueItem(submission.queueId) : false;

	if (submission.queueId && queueVisible) {
		if (accepted) {
			updateOrderQueueItem(submission.queueId, { status: "success", outcome: "twapStarted" });
		} else {
			updateOrderQueueItem(submission.queueId, { status: "failed", error });
		}
		return;
	}

	if (accepted) toast.success(t`TWAP order confirmed by the exchange.`);
	else
		toast.error(
			typeof error === "string"
				? error
				: formatOrderReconciliationError(error.code, (descriptor) => i18n._(descriptor)),
		);
}
