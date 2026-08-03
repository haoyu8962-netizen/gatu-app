import { t } from "@lingui/core/macro";
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
import { updateOrderQueueItem } from "@/stores/use-order-queue-store";
import { getPendingTwapActions, hasPendingTwapForAsset } from "@/stores/use-pending-twap-store";

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
		if (!address) throw new Error("No active Hyperliquid account");
		if (!doesOrderBatchMatchRiskContext([params.twap], options.riskContext)) {
			throw new Error(t`Order market context does not match the submitted asset.`);
		}

		const intent = createTwapIntent(params, options.coin);
		if (hasPendingTwapForAsset(env, address, intent.assetId)) return { state: "blocked", reason: "pending" };

		const activeBaselineReady =
			activeTwaps.status === "active" && !activeTwaps.isStale && activeTwaps.data !== undefined;
		const historyBaselineReady =
			twapHistory.status === "active" && !twapHistory.isStale && twapHistory.data !== undefined;
		if (!activeBaselineReady || !historyBaselineReady) {
			return { state: "blocked", reason: "stateUnavailable" };
		}

		const submission = getPendingTwapActions().add({
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
					twapHistory.data?.history.flatMap((entry) => (typeof entry.twapId === "number" ? [entry.twapId] : [])) ?? [],
			},
		});
		getPendingTwapActions().markActive(submission.id);

		try {
			const result = await mutation.mutateAsync(params);
			getPendingTwapActions().remove(submission.id);
			return { state: "confirmed", result };
		} catch (error) {
			if (isAmbiguousOrderRequestError(error)) {
				if (options.queueId) {
					updateOrderQueueItem(options.queueId, { status: "confirming", error: undefined });
				}
				return { state: "reconciling", submissionId: submission.id };
			}
			getPendingTwapActions().remove(submission.id);
			throw error;
		} finally {
			getPendingTwapActions().clearActive(submission.id);
		}
	}

	return {
		submitTwap,
		isPending: mutation.isPending,
		error: isAmbiguousOrderRequestError(mutation.error) ? null : mutation.error,
		reset: mutation.reset,
	};
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
