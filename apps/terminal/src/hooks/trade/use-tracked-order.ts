import { t } from "@lingui/core/macro";
import { ISOLATED_RISK_FEATURES } from "@/config/isolated-risk";
import {
	doesOrderBatchMatchRiskContext,
	isIsolatedOrderRiskIncrease,
	type OrderRiskContext,
} from "@/domain/trade/order-risk-context";
import {
	isAmbiguousOrderRequestError,
	isApiOrderResponseError,
	OrderBatchResolutionError,
	resolveOrderBatchResponse,
	type TrackedOrderParams,
	trackOrderRequest,
} from "@/domain/trade/order-tracking";
import { type ExchangeResponse, useExchange, useHyperliquid } from "@/lib/hyperliquid";
import { updateOrderQueueItem } from "@/stores/use-order-queue-store";
import {
	getPendingOrderActions,
	hasPendingOrderForAssets,
	hasPendingOrderIntent,
} from "@/stores/use-pending-order-store";

interface SubmitOptions {
	queueId?: string;
	riskContext: OrderRiskContext;
}

export type TrackedOrderResult =
	| { state: "confirmed"; result: ExchangeResponse<"order"> }
	| { state: "reconciling"; submissionId: string }
	| { state: "blocked" };

export function useTrackedOrder() {
	const mutation = useExchange("order");
	const { clientKey, env } = useHyperliquid();

	async function submitOrder(params: TrackedOrderParams, options: SubmitOptions): Promise<TrackedOrderResult> {
		if (clientKey === "disconnected") throw new Error("No active Hyperliquid account");
		if (!doesOrderBatchMatchRiskContext(params.orders, options.riskContext)) {
			throw new Error(t`Order market context does not match the submitted asset.`);
		}
		if (!ISOLATED_RISK_FEATURES.increaseEnabled && isIsolatedOrderRiskIncrease(params.orders, options.riskContext)) {
			throw new Error(
				t`Opening or increasing isolated positions is temporarily unavailable. Reduce-only orders remain available.`,
			);
		}

		const user = clientKey.toLowerCase() as `0x${string}`;
		const tracked = trackOrderRequest(params);
		const assetIds = tracked.children.map((child) => child.assetId);
		const hasExactPendingIntent = hasPendingOrderIntent(env, user, tracked.intentKey);
		const hasPendingAsset = hasPendingOrderForAssets(env, user, assetIds);
		const isRiskReducing = tracked.params.orders.every((order) => order.r);
		if (hasExactPendingIntent || (hasPendingAsset && !isRiskReducing)) return { state: "blocked" };
		const submission = getPendingOrderActions().add({
			env,
			user,
			intentKey: tracked.intentKey,
			children: tracked.children,
			queueId: options.queueId,
		});
		getPendingOrderActions().markActive(submission.id);

		try {
			const result = await mutation.mutateAsync(tracked.params);
			const statuses = result.response?.data?.statuses ?? [];
			if (statuses.length === tracked.children.length) {
				getPendingOrderActions().remove(submission.id);
				return { state: "confirmed", result };
			}

			return startReconciliation(submission.id, options.queueId);
		} catch (error) {
			if (isApiOrderResponseError(error)) {
				const resolution = resolveOrderBatchResponse(error.response, tracked.children.length);
				if (resolution?.status === "partial" || resolution?.status === "rejected") {
					getPendingOrderActions().remove(submission.id);
					throw new OrderBatchResolutionError(resolution);
				}
				return startReconciliation(submission.id, options.queueId);
			}
			if (isAmbiguousOrderRequestError(error)) return startReconciliation(submission.id, options.queueId);
			getPendingOrderActions().remove(submission.id);
			throw error;
		} finally {
			getPendingOrderActions().clearActive(submission.id);
		}
	}

	return {
		submitOrder,
		isPending: mutation.isPending,
		error: isAmbiguousOrderRequestError(mutation.error) ? null : mutation.error,
		reset: mutation.reset,
	};
}

function startReconciliation(submissionId: string, queueId: string | undefined): TrackedOrderResult {
	if (queueId) {
		updateOrderQueueItem(queueId, { status: "confirming", error: undefined });
	}
	return { state: "reconciling", submissionId };
}
