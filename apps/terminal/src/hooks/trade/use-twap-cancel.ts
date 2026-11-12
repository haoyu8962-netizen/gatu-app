import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { isAmbiguousOrderRequestError } from "@/domain/trade/order-tracking";
import { type ActionFailure, formatActionFailure } from "@/lib/errors/action-error";
import { type ExchangeParams, useExchange, useHyperliquid, useMarkets } from "@/lib/hyperliquid";
import { runWithAvailableOrderAssetLocks } from "@/lib/trade/order-asset-lock";
import {
	formatOrderSubmissionFeedback,
	getOrderSubmissionFeedback,
	type OrderSubmissionFeedback,
	orderSubmissionFeedback,
	orderSubmissionFeedbackCause,
} from "@/lib/trade/order-submission-feedback";
import {
	ensurePendingTradingActionFeedback,
	syncPendingTradingActionFeedback,
	updatePendingTradingActionFeedback,
} from "@/lib/trade/pending-trading-action-feedback";
import { classifyTradingActionError } from "@/lib/trade/trading-action-failure";
import type { Translate } from "@/lib/translate";
import {
	getPendingTradingActionActions,
	getPendingTradingActionSnapshot,
	usePendingTwapCancellations,
} from "@/stores/use-pending-trading-action-store";

export interface TwapCancelFeedback {
	tone: "error" | "warning";
	message: string;
}

type StoredTwapCancelFeedbackValue = OrderSubmissionFeedback | ActionFailure;

interface StoredTwapCancelFeedback {
	actionId?: string;
	env: "Mainnet" | "Testnet";
	owner: string | null;
	tone: "error" | "warning";
	value: StoredTwapCancelFeedbackValue;
}

interface TwapCancelExecutionContext {
	actionId: string;
	guardPasses: number;
	env: "Mainnet" | "Testnet";
	owner: string;
	params: ExchangeParams<"twapCancel">;
}

export function useTwapCancel() {
	const { t } = useLingui();
	const markets = useMarkets();
	const { clientKey, env } = useHyperliquid();
	const liveIdentityRef = useRef({ clientKey, env });
	liveIdentityRef.current = { clientKey, env };
	const executionRef = useRef<TwapCancelExecutionContext | null>(null);

	function assertTwapCancelExecution(params: ExchangeParams<"twapCancel">) {
		const execution = executionRef.current;
		const liveIdentity = liveIdentityRef.current;
		const pending = execution
			? getPendingTradingActionSnapshot().twapCancellations.find((action) => action.id === execution.actionId)
			: undefined;
		if (
			!execution ||
			params.a !== execution.params.a ||
			params.t !== execution.params.t ||
			liveIdentity.clientKey === "disconnected" ||
			liveIdentity.clientKey.toLowerCase() !== execution.owner ||
			liveIdentity.env !== execution.env ||
			pending?.phase !== "submitting" ||
			pending.env !== execution.env ||
			pending.owner !== execution.owner ||
			pending.twapId !== execution.params.t ||
			pending.assetId !== execution.params.a
		) {
			throw orderSubmissionFeedbackCause("twap-cancel-identity-changed");
		}
		execution.guardPasses += 1;
		if (execution.guardPasses >= 2) {
			getPendingTradingActionActions().markTwapCancellationRequestStarted(execution.actionId);
		}
	}

	const { mutateAsync: cancel, reset } = useExchange("twapCancel", {
		executionGuard: assertTwapCancelExecution,
	});
	const cancellations = usePendingTwapCancellations();
	const mountedRef = useRef(false);
	const [storedFeedback, setFeedback] = useState<StoredTwapCancelFeedback | null>(null);
	const normalizedOwner = clientKey === "disconnected" ? null : clientKey.toLowerCase();
	const activeCancellations = normalizedOwner
		? cancellations.filter((action) => action.env === env && action.owner === normalizedOwner)
		: [];
	const cancellingTwapId = activeCancellations[0]?.twapId ?? null;
	const storedFeedbackMatchesIdentity = storedFeedback?.env === env && storedFeedback.owner === normalizedOwner;
	const storedFeedbackActionActive =
		!storedFeedback?.actionId || activeCancellations.some((action) => action.id === storedFeedback.actionId);
	const feedback =
		storedFeedback && storedFeedbackMatchesIdentity && storedFeedbackActionActive
			? {
					tone: storedFeedback.tone,
					message: formatStoredTwapCancelFeedback(storedFeedback.value, (descriptor) => t(descriptor)),
				}
			: null;

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	async function cancelTwap(coin: string, twapId: number): Promise<void> {
		if (activeCancellations.some((action) => action.twapId === twapId)) return;

		const assetId = markets.getAssetId(coin);
		if (typeof assetId !== "number") {
			const value = orderSubmissionFeedback("twap-cancel-market-unavailable");
			const message = formatStoredTwapCancelFeedback(value, (descriptor) => t(descriptor));
			setFeedback({ tone: "error", value, env, owner: normalizedOwner });
			toast.error(message);
			return;
		}

		if (clientKey === "disconnected") {
			const value = orderSubmissionFeedback("coordination-unavailable");
			const message = formatStoredTwapCancelFeedback(value, (descriptor) => t(descriptor));
			setFeedback({ tone: "error", value, env, owner: null });
			toast.error(message);
			return;
		}

		const action = getPendingTradingActionActions().claimTwapCancellation({
			env,
			owner: clientKey,
			twapId,
			assetId,
		});
		if (!action) return;
		ensurePendingTradingActionFeedback(action, "twap-cancel");
		const execution: TwapCancelExecutionContext = {
			actionId: action.id,
			guardPasses: 0,
			env: action.env,
			owner: action.owner,
			params: { a: assetId, t: twapId },
		};
		executionRef.current = execution;
		reset();
		setFeedback(null);
		try {
			const lockResult = await runWithAvailableOrderAssetLocks(
				{ env, owner: clientKey, assetIds: [assetId] },
				async () => {
					await cancel(execution.params);
				},
			);
			if (!lockResult.supported || !lockResult.acquired) {
				getPendingTradingActionActions().resolveTwapCancellation(action.id);
				const value = orderSubmissionFeedback("coordination-unavailable");
				updatePendingTradingActionFeedback(action, "twap-cancel", { status: "failed", error: value });
				if (mountedRef.current && isTwapExecutionIdentityCurrent(execution, liveIdentityRef.current)) {
					setFeedback({ tone: "error", value, env: execution.env, owner: execution.owner });
				}
				return;
			}
			getPendingTradingActionActions().markTwapCancellationAccepted(action.id);
			syncPendingTradingActionFeedback({ ...action, phase: "awaiting" }, "twap-cancel");
		} catch (error) {
			if (execution.guardPasses >= 2 && isAmbiguousOrderRequestError(error)) {
				getPendingTradingActionActions().markTwapCancellationUnconfirmed(action.id);
				syncPendingTradingActionFeedback({ ...action, phase: "unconfirmed" }, "twap-cancel");
				const value = orderSubmissionFeedback("twap-cancel-unconfirmed");
				if (mountedRef.current && isTwapExecutionIdentityCurrent(execution, liveIdentityRef.current)) {
					setFeedback({
						tone: "warning",
						value,
						actionId: action.id,
						env: execution.env,
						owner: execution.owner,
					});
				}
				return;
			}

			getPendingTradingActionActions().resolveTwapCancellation(action.id);
			const value =
				getOrderSubmissionFeedback(error) ??
				classifyTradingActionError(error) ??
				orderSubmissionFeedback("twap-cancel-failed");
			updatePendingTradingActionFeedback(action, "twap-cancel", { status: "failed", error: value });
			if (mountedRef.current && isTwapExecutionIdentityCurrent(execution, liveIdentityRef.current)) {
				setFeedback({ tone: "error", value, env: execution.env, owner: execution.owner });
			}
		} finally {
			if (executionRef.current === execution) executionRef.current = null;
		}
	}

	return { cancelTwap, cancellingTwapId, feedback };
}

function formatStoredTwapCancelFeedback(value: StoredTwapCancelFeedbackValue, translate: Translate): string {
	if ("kind" in value && value.kind === "order-submission") return formatOrderSubmissionFeedback(value, translate);
	return (
		formatActionFailure(value, translate) ??
		formatOrderSubmissionFeedback(orderSubmissionFeedback("twap-cancel-failed"), translate)
	);
}

function isTwapExecutionIdentityCurrent(
	execution: TwapCancelExecutionContext,
	liveIdentity: { clientKey: string; env: "Mainnet" | "Testnet" },
): boolean {
	return (
		liveIdentity.clientKey !== "disconnected" &&
		liveIdentity.clientKey.toLowerCase() === execution.owner &&
		liveIdentity.env === execution.env
	);
}
