import { t } from "@lingui/core/macro";
import { useRef, useState } from "react";
import { HL_ALL_DEXS } from "@/config/app";
import { doesOrderBatchMatchRiskContext, type OrderRiskContext } from "@/domain/trade/order-risk-context";
import { isAmbiguousOrderRequestError } from "@/domain/trade/order-tracking";
import type { TwapIntent } from "@/domain/trade/twap";
import {
	type ExchangeParams,
	type ExchangeResponse,
	useExchange,
	useHyperliquid,
	useSubscription,
} from "@/lib/hyperliquid";
import {
	clearOrderAssetReservations,
	getOrderAssetReservationState,
	reserveOrderAssets,
	runWithAvailableOrderAssetLocks,
} from "@/lib/trade/order-asset-lock";
import {
	getTwapOrderAssetReservationIntent,
	promoteTwapReservationToActive,
} from "@/lib/trade/twap-order-asset-reservation";
import { updateOrderQueueItem } from "@/stores/use-order-queue-store";
import { hasPendingOrderForAssets } from "@/stores/use-pending-order-store";
import {
	getPendingTwapActions,
	getPersistedPendingTwapAssetState,
	PendingTwapPersistenceError,
	type PendingTwapSubmission,
} from "@/stores/use-pending-twap-store";

interface SubmitTwapOptions {
	coin: string;
	queueId?: string;
	riskContext: OrderRiskContext;
}

export type TrackedTwapResult =
	| { state: "confirmed"; result: ExchangeResponse<"twapOrder"> }
	| { state: "reconciling"; submissionId: string }
	| { state: "blocked"; reason: "pending" | "stateUnavailable" };

export function useTrackedTwapOrder() {
	const mutation = useExchange("twapOrder");
	const { clientKey, env } = useHyperliquid();
	const coordinatingRef = useRef(false);
	const [isCoordinating, setIsCoordinating] = useState(false);
	const address = clientKey === "disconnected" ? undefined : (clientKey as `0x${string}`);
	const activeTwaps = useSubscription(
		"twapStates",
		{ user: address ?? "0x0000000000000000000000000000000000000000", dex: HL_ALL_DEXS },
		{ enabled: !!address },
	);
	const twapHistory = useSubscription(
		"userTwapHistory",
		{ user: address ?? "0x0000000000000000000000000000000000000000" },
		{ enabled: !!address },
	);

	async function submitTwap(
		params: ExchangeParams<"twapOrder">,
		options: SubmitTwapOptions,
	): Promise<TrackedTwapResult> {
		if (coordinatingRef.current) return { state: "blocked", reason: "pending" };
		coordinatingRef.current = true;
		setIsCoordinating(true);
		try {
			return await submitTwapOnce(params, options);
		} finally {
			coordinatingRef.current = false;
			setIsCoordinating(false);
		}
	}

	async function submitTwapOnce(
		params: ExchangeParams<"twapOrder">,
		options: SubmitTwapOptions,
	): Promise<TrackedTwapResult> {
		if (!address) throw new Error("No active Hyperliquid account");
		if (!doesOrderBatchMatchRiskContext([params.twap], options.riskContext)) {
			throw new Error(t`Order market context does not match the submitted asset.`);
		}

		const intent = createTwapIntent(params, options.coin);
		const lockIdentity = { env, owner: address, assetIds: [intent.assetId] } as const;
		const lockResult = await runWithAvailableOrderAssetLocks(lockIdentity, async (lease) => {
			const reservationIntent = getTwapOrderAssetReservationIntent(intent);
			const reservationState = getOrderAssetReservationState(lease, reservationIntent);
			const pendingTwapState = getPersistedPendingTwapAssetState(env, address, intent.assetId);
			if (reservationState === "unavailable" || pendingTwapState === "unavailable") {
				throw new Error(t`Safe order coordination across tabs is unavailable in this browser.`);
			}
			if (
				reservationState === "conflict" ||
				hasPendingOrderForAssets(env, address, [intent.assetId]) ||
				pendingTwapState === "pending"
			) {
				return { state: "blocked", reason: "pending" } as const;
			}

			const activeBaselineReady =
				activeTwaps.status === "active" && !activeTwaps.isStale && activeTwaps.data !== undefined;
			const historyBaselineReady =
				twapHistory.status === "active" && !twapHistory.isStale && twapHistory.data !== undefined;
			if (!activeBaselineReady || !historyBaselineReady) {
				return { state: "blocked", reason: "stateUnavailable" } as const;
			}

			let submission: PendingTwapSubmission;
			try {
				submission = getPendingTwapActions().add({
					env,
					user: address,
					queueId: options.queueId,
					intent,
					activeBaseline: {
						ready: true,
						knownIds: activeTwaps.data?.states.map(([twapId]) => twapId) ?? [],
					},
					historyBaseline: {
						ready: true,
						knownIds:
							twapHistory.data?.history.flatMap((entry) => (typeof entry.twapId === "number" ? [entry.twapId] : [])) ??
							[],
					},
				});
			} catch (error) {
				if (error instanceof PendingTwapPersistenceError) {
					throw new Error(t`Safe order coordination across tabs is unavailable in this browser.`);
				}
				throw error;
			}
			if (
				!reserveOrderAssets(lease, {
					...reservationIntent,
					submissionId: submission.id,
					createdAt: submission.createdAt,
				})
			) {
				getPendingTwapActions().remove(submission.id);
				throw new Error(t`Safe order coordination across tabs is unavailable in this browser.`);
			}
			getPendingTwapActions().markActive(submission.id);
			let retainPendingReservation = false;

			try {
				const result = await mutation.mutateAsync(params);
				const twapId = getRunningTwapId(result);
				const promoted =
					twapId !== undefined &&
					promoteTwapReservationToActive(lease, {
						intent,
						pendingSubmissionId: submission.id,
						twapId,
						startedAt: Date.now(),
					});
				if (!promoted) {
					retainPendingReservation = true;
					if (options.queueId) {
						updateOrderQueueItem(options.queueId, { status: "confirming", error: undefined });
					}
					return { state: "reconciling", submissionId: submission.id } as const;
				}
				getPendingTwapActions().remove(submission.id);
				return { state: "confirmed", result } as const;
			} catch (error) {
				if (isAmbiguousOrderRequestError(error)) {
					retainPendingReservation = true;
					if (options.queueId) {
						updateOrderQueueItem(options.queueId, { status: "confirming", error: undefined });
					}
					return { state: "reconciling", submissionId: submission.id } as const;
				}
				getPendingTwapActions().remove(submission.id);
				throw error;
			} finally {
				getPendingTwapActions().clearActive(submission.id);
				if (!retainPendingReservation) clearOrderAssetReservations(lease, submission.id);
			}
		});
		if (!lockResult.supported) {
			throw new Error(t`Safe order coordination across tabs is unavailable in this browser.`);
		}
		if (!lockResult.acquired) return { state: "blocked", reason: "pending" };
		return lockResult.value;
	}

	return {
		submitTwap,
		isPending: isCoordinating || mutation.isPending,
		error: isAmbiguousOrderRequestError(mutation.error) ? null : mutation.error,
		reset: mutation.reset,
	};
}

function getRunningTwapId(result: ExchangeResponse<"twapOrder">): number | undefined {
	const status: unknown = result.response?.data?.status;
	if (!status || typeof status !== "object" || !("running" in status)) return undefined;
	const running = status.running;
	if (!running || typeof running !== "object" || !("twapId" in running)) return undefined;
	return typeof running.twapId === "number" && Number.isSafeInteger(running.twapId) && running.twapId >= 0
		? running.twapId
		: undefined;
}

function createTwapIntent(params: ExchangeParams<"twapOrder">, coin: string): TwapIntent {
	const assetId = Number(params.twap.a);
	const minutes = Number(params.twap.m);
	if (!Number.isSafeInteger(assetId) || assetId < 0) throw new Error("Invalid TWAP asset ID");
	if (!Number.isSafeInteger(minutes) || minutes <= 0) throw new Error("Invalid TWAP duration");
	return {
		assetId,
		coin,
		side: params.twap.b ? "B" : "A",
		size: String(params.twap.s),
		minutes,
		reduceOnly: params.twap.r,
		randomize: params.twap.t,
	};
}
