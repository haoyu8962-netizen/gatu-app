import type { ExchangeExecutionGuard } from "@gatu/hl-react";
import { useRef, useState } from "react";
import { doesOrderBatchMatchRiskContext, type OrderRiskContext } from "@/domain/trade/order-risk-context";
import {
	isAmbiguousOrderRequestError,
	isApiOrderResponseError,
	OrderBatchResolutionError,
	resolveFilledOrderBatchResponse,
	resolveOrderBatchResponse,
	type TrackedOrderParams,
	trackOrderRequest,
} from "@/domain/trade/order-tracking";
import { type ExchangeResponse, useExchange, useHyperliquid } from "@/lib/hyperliquid";
import {
	clearOrderAssetReservations,
	doesOrderAssetLockLeaseCover,
	getOrderAssetReservationState,
	type OrderAssetLockLease,
	reserveOrderAssets,
	runWithAvailableOrderAssetLocks,
} from "@/lib/trade/order-asset-lock";
import { orderSubmissionFeedbackCause } from "@/lib/trade/order-submission-feedback";
import { updateOrderQueueItem } from "@/stores/use-order-queue-store";
import {
	getPendingOrderActions,
	hasExclusivePendingOrderForAssets,
	hasPendingOrderForAssets,
	hasPendingOrderIntent,
	type PendingOrderOrigin,
	PendingOrderPersistenceError,
	type PendingOrderSubmission,
} from "@/stores/use-pending-order-store";

interface SubmitOptions {
	assetLockLease?: OrderAssetLockLease;
	queueId?: string;
	riskContext: OrderRiskContext;
	exclusiveAssetLock?: boolean;
	confirmationMode?: "accepted" | "filled";
	finalConfirmation?: (result: ExchangeResponse<"order">) => boolean | Promise<boolean>;
	origin?: PendingOrderOrigin;
}

interface UseTrackedOrderOptions {
	executionGuard?: ExchangeExecutionGuard<"order">;
}

export type TrackedOrderResult =
	| { state: "confirmed"; result: ExchangeResponse<"order"> }
	| { state: "reconciling"; submissionId: string }
	| { state: "blocked" };

export function useTrackedOrder(options: UseTrackedOrderOptions = {}) {
	const mutation = useExchange("order", { executionGuard: options.executionGuard });
	const { clientKey, env } = useHyperliquid();
	const coordinatingRef = useRef(false);
	const [isCoordinating, setIsCoordinating] = useState(false);

	async function submitOrder(params: TrackedOrderParams, options: SubmitOptions): Promise<TrackedOrderResult> {
		if (coordinatingRef.current) return { state: "blocked" };
		coordinatingRef.current = true;
		setIsCoordinating(true);
		try {
			return await submitOrderOnce(params, options);
		} finally {
			coordinatingRef.current = false;
			setIsCoordinating(false);
		}
	}

	async function submitOrderOnce(params: TrackedOrderParams, options: SubmitOptions): Promise<TrackedOrderResult> {
		if (clientKey === "disconnected") throw orderSubmissionFeedbackCause("no-active-account");
		if (!doesOrderBatchMatchRiskContext(params.orders, options.riskContext)) {
			throw orderSubmissionFeedbackCause("market-context-mismatch");
		}

		const user = clientKey.toLowerCase() as `0x${string}`;
		const tracked = trackOrderRequest(params);
		const assetIds = tracked.children.map((child) => child.assetId);
		const isRiskReducing = tracked.params.orders.every((order) => order.r);
		const lockIdentity = { env, owner: user, assetIds } as const;

		async function submitWithLease(lease: OrderAssetLockLease): Promise<TrackedOrderResult> {
			if (!doesOrderAssetLockLeaseCover(lease, lockIdentity)) {
				throw orderSubmissionFeedbackCause("coordination-unavailable");
			}
			const reservationIntent = {
				intentKey: tracked.intentKey,
				exclusiveAssetLock: options.exclusiveAssetLock === true,
				isRiskReducing,
			};
			const reservationState = getOrderAssetReservationState(lease, reservationIntent);
			if (reservationState === "unavailable") {
				throw orderSubmissionFeedbackCause("coordination-unavailable");
			}
			if (reservationState === "conflict") return { state: "blocked" };

			const hasExactPendingIntent = hasPendingOrderIntent(env, user, tracked.intentKey);
			const hasPendingAsset = hasPendingOrderForAssets(env, user, assetIds);
			const hasExclusivePendingAsset = hasExclusivePendingOrderForAssets(env, user, assetIds);
			if (
				hasExactPendingIntent ||
				hasExclusivePendingAsset ||
				(hasPendingAsset && (options.exclusiveAssetLock === true || !isRiskReducing))
			) {
				return { state: "blocked" };
			}

			let submission: PendingOrderSubmission;
			try {
				submission = getPendingOrderActions().add({
					env,
					user,
					intentKey: tracked.intentKey,
					exclusiveAssetLock: options.exclusiveAssetLock,
					confirmationMode: options.confirmationMode,
					origin: options.origin,
					children: tracked.children,
					queueId: options.queueId,
				});
			} catch (error) {
				if (error instanceof PendingOrderPersistenceError) {
					throw orderSubmissionFeedbackCause("coordination-unavailable");
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
				getPendingOrderActions().remove(submission.id);
				throw orderSubmissionFeedbackCause("coordination-unavailable");
			}
			getPendingOrderActions().markActive(submission.id);
			let retainReservation = false;

			try {
				const result = await mutation.mutateAsync(tracked.params);
				if (options.confirmationMode === "filled") {
					const resolution = resolveFilledOrderBatchResponse(
						result,
						tracked.params.orders.map((order) => String(order.s)),
					);
					if (resolution?.status === "partial" || resolution?.status === "rejected") {
						getPendingOrderActions().remove(submission.id);
						throw new OrderBatchResolutionError(resolution);
					}
					if (resolution?.status === "accepted") {
						const isFinallyConfirmed = await runFinalConfirmation(options.finalConfirmation, result);
						if (isFinallyConfirmed) {
							getPendingOrderActions().remove(submission.id);
							return { state: "confirmed", result };
						}
					}
				} else {
					const resolution = resolveOrderBatchResponse(result, tracked.children.length);
					if (resolution?.status === "partial" || resolution?.status === "rejected") {
						getPendingOrderActions().remove(submission.id);
						throw new OrderBatchResolutionError(resolution);
					}
					if (resolution?.status === "accepted") {
						getPendingOrderActions().remove(submission.id);
						return { state: "confirmed", result };
					}
				}

				retainReservation = true;
				return startReconciliation(submission.id, options.queueId);
			} catch (error) {
				if (error instanceof OrderBatchResolutionError) throw error;
				if (isApiOrderResponseError(error)) {
					const resolution =
						options.confirmationMode === "filled"
							? resolveFilledOrderBatchResponse(
									error.response,
									tracked.params.orders.map((order) => String(order.s)),
								)
							: resolveOrderBatchResponse(error.response, tracked.children.length);
					if (resolution?.status === "partial" || resolution?.status === "rejected") {
						getPendingOrderActions().remove(submission.id);
						throw new OrderBatchResolutionError(resolution);
					}
					retainReservation = true;
					return startReconciliation(submission.id, options.queueId);
				}
				if (isAmbiguousOrderRequestError(error)) {
					retainReservation = true;
					return startReconciliation(submission.id, options.queueId);
				}
				getPendingOrderActions().remove(submission.id);
				throw error;
			} finally {
				getPendingOrderActions().clearActive(submission.id);
				if (!retainReservation) clearOrderAssetReservations(lease, submission.id);
			}
		}

		if (options.assetLockLease) return submitWithLease(options.assetLockLease);
		const lockResult = await runWithAvailableOrderAssetLocks(lockIdentity, submitWithLease);
		if (!lockResult.supported) {
			throw orderSubmissionFeedbackCause("coordination-unavailable");
		}
		if (!lockResult.acquired) return { state: "blocked" };
		return lockResult.value;
	}

	return {
		submitOrder,
		isPending: isCoordinating || mutation.isPending,
		error: isAmbiguousOrderRequestError(mutation.error) ? null : mutation.error,
		reset: mutation.reset,
	};
}

async function runFinalConfirmation(
	confirmation: SubmitOptions["finalConfirmation"],
	result: ExchangeResponse<"order">,
): Promise<boolean> {
	if (!confirmation) return true;
	try {
		return await confirmation(result);
	} catch {
		return false;
	}
}

function startReconciliation(submissionId: string, queueId: string | undefined): TrackedOrderResult {
	if (queueId) {
		updateOrderQueueItem(queueId, { status: "confirming", error: undefined });
	}
	return { state: "reconciling", submissionId };
}
